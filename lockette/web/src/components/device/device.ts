import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/**
 * Lockette, built from code: no model file. Units are millimetres, and the
 * whole thing is scaled so the 52 mm body is one scene unit. The face looks
 * down +z. A designer can later swap in a GLB that uses the same part names.
 *
 * It comes apart in five layers for the exploded view (back to front):
 *   0 back plate + magnet ring · 1 battery · 2 mic & speaker board
 *   3 front shell + grille · 4 button + light ring
 */

export const MM = 1 / 52;

export type LedState = "off" | "idle" | "listening" | "thinking" | "speaking" | "reminder" | "allgood" | "calling";
const LED_MODE: Record<LedState, number> = {
  off: 0,
  idle: 1,
  listening: 2,
  reminder: 3,
  allgood: 4,
  calling: 5,
  thinking: 6,
  speaking: 7,
};

export type Finish = "porcelain" | "graphite" | "clay";
const FINISH: Record<Finish, number> = { porcelain: 0xefe8dd, graphite: 0x2a2d2e, clay: 0xc9a48f };

/** A rounded-square slab: soft corners seen from the front, small bevels on the edges. */
function slab(w: number, h: number, depth: number, r: number, bevel: number) {
  const iw = w - bevel * 2;
  const ih = h - bevel * 2;
  const rr = Math.min(r, iw / 2, ih / 2);
  const s = new THREE.Shape();
  const x = -iw / 2;
  const y = -ih / 2;
  s.moveTo(x + rr, y);
  s.lineTo(x + iw - rr, y);
  s.quadraticCurveTo(x + iw, y, x + iw, y + rr);
  s.lineTo(x + iw, y + ih - rr);
  s.quadraticCurveTo(x + iw, y + ih, x + iw - rr, y + ih);
  s.lineTo(x + rr, y + ih);
  s.quadraticCurveTo(x, y + ih, x, y + ih - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  const core = Math.max(0.1, depth - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: core,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 6,
    curveSegments: 28,
  });
  g.translate(0, 0, -core / 2);
  g.computeVertexNormals();
  return g;
}

const ledVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ledFragment = /* glsl */ `
  uniform vec3 uGlow;
  uniform vec3 uOff;
  uniform float uTime;
  uniform float uMode;
  uniform float uLevel;
  uniform float uGain;
  varying vec3 vPos;
  void main() {
    // 0 at the top of the ring, running clockwise
    float a = fract(0.25 - atan(vPos.y, vPos.x) / 6.28318);
    float b = 0.0;
    if (uMode < 0.5) {
      b = 0.0;                                                     // off
    } else if (uMode < 1.5) {
      b = 0.18;                                                    // idle: a soft steady amber
    } else if (uMode < 2.5) {
      b = 0.55 + 0.45 * sin(uTime * 6.2832 * 1.2) + uLevel * 0.6;  // listening: 1.2 Hz pulse
    } else if (uMode < 3.5) {
      b = 0.2 + 0.8 * (0.5 + 0.5 * sin(uTime * 1.6));              // reminder: slow breath
    } else if (uMode < 4.5) {
      float head = fract(uTime * 0.5);                             // all good: one sweep round
      float d = fract(head - a);
      b = smoothstep(0.35, 0.0, d) * 1.2 + 0.15;
    } else if (uMode < 5.5) {
      float head = fract(uTime * 1.2);                             // calling: a spinner
      float d = fract(head - a);
      b = smoothstep(0.18, 0.0, d) * 1.3;
    } else if (uMode < 6.5) {
      b = 0.35 + 0.65 * (0.5 + 0.5 * sin(a * 6.2832 * 3.0 - uTime * 5.0)); // thinking: rolling bands
    } else {
      b = 0.5 + 0.5 * abs(sin(uTime * 9.0)) * (0.5 + uLevel);    // speaking: flicker with the voice
    }
    b = clamp(b, 0.0, 1.5);
    vec3 c = mix(uOff, uGlow * (0.45 + 3.8 * b) * uGain, smoothstep(0.0, 0.18, b));
    gl_FragColor = vec4(c, 1.0);
  }
`;

export interface Device {
  /** what the scene moves around */
  root: THREE.Group;
  /** the button, for hover and click */
  button: THREE.Mesh;
  /** points (in device mm) that labels hang off */
  anchors: Record<string, THREE.Vector3>;
  /** where the cord attaches, in device mm */
  loopTop: THREE.Vector3;
  setExplode(k: number): void;
  setLed(state: LedState, level?: number): void;
  setGlow(hex: string): void;
  /** overall ring brightness (stills have no bloom, so they turn it down) */
  setGain(g: number): void;
  setFinish(f: Finish): void;
  update(time: number): void;
  dispose(): void;
}

export function buildDevice(): Device {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(MM);
  root.add(body);

  const shell = new THREE.MeshPhysicalMaterial({
    color: FINISH.porcelain,
    roughness: 0.38,
    clearcoat: 0.45,
    clearcoatRoughness: 0.25,
    sheen: 0.2,
    sheenColor: new THREE.Color(0xffffff),
  });
  const back = shell.clone();
  back.roughness = 0.5;
  back.clearcoat = 0.3;
  const buttonMat = shell.clone();
  buttonMat.color = new THREE.Color(FINISH.porcelain).multiplyScalar(0.94);
  buttonMat.roughness = 0.3;
  const dark = new THREE.MeshStandardMaterial({ color: 0x5f5750, roughness: 0.8 });
  const channel = new THREE.MeshStandardMaterial({ color: 0xb7aca0, roughness: 0.6 });
  const board = new THREE.MeshStandardMaterial({ color: 0x24312f, roughness: 0.55, metalness: 0.1 });
  const chip = new THREE.MeshStandardMaterial({ color: 0x151718, roughness: 0.4, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ccce, roughness: 0.32, metalness: 0.75 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xb87a4b, roughness: 0.35, metalness: 0.8 });

  const ledUniforms = {
    uGlow: { value: new THREE.Color("#ffb869") },
    uOff: { value: new THREE.Color(0xd2c9bd) },
    uTime: { value: 0 },
    uMode: { value: 1 },
    uLevel: { value: 0 },
    uGain: { value: 1 },
  };
  const led = new THREE.ShaderMaterial({
    uniforms: ledUniforms,
    vertexShader: ledVertex,
    fragmentShader: ledFragment,
    toneMapped: false,
  });

  const layers: THREE.Group[] = Array.from({ length: 5 }, () => new THREE.Group());
  layers.forEach((l) => body.add(l));
  const [backL, batteryL, boardL, frontL, buttonL] = layers;

  // 0 · back plate and the magnet ring that holds it to a fridge or a lanyard clip
  const backPlate = new THREE.Mesh(slab(52, 52, 6, 13, 2.4), back);
  backPlate.position.z = -4;
  backL.add(backPlate);
  const magnet = new THREE.Mesh(new THREE.TorusGeometry(12, 1.3, 16, 64), metal);
  magnet.position.z = -0.6;
  backL.add(magnet);

  // 1 · battery
  const battery = new THREE.Mesh(new RoundedBoxGeometry(38, 32, 4.6, 3, 1.4), metal);
  battery.position.z = -2.2;
  batteryL.add(battery);

  // 2 · the board: chips, two mics, the speaker
  const pcb = new THREE.Mesh(new THREE.BoxGeometry(44, 44, 1.2), board);
  pcb.position.z = 1;
  boardL.add(pcb);
  for (const [x, y, w, h] of [
    [-9, 8, 9, 9],
    [6, 10, 6, 4],
    [10, -2, 4, 6],
    [-12, -6, 5, 3],
  ]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.2), chip);
    c.position.set(x, y, 2);
    boardL.add(c);
  }
  for (const x of [-15, 15]) {
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.2, 20), metal);
    mic.rotation.x = Math.PI / 2;
    mic.position.set(x, 15, 2);
    boardL.add(mic);
  }
  const speaker = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 2.6, 40), copper);
  speaker.rotation.x = Math.PI / 2;
  speaker.position.set(0, -12, 2.4);
  boardL.add(speaker);

  // 3 · front shell, with the speaker grille under the button
  const front = new THREE.Mesh(slab(52, 52, 8, 13, 3), shell);
  front.position.z = 3;
  frontL.add(front);
  const holes: THREE.Vector3[] = [];
  for (let row = 0; row < 4; row++) {
    const n = row % 2 === 0 ? 10 : 9;
    for (let i = 0; i < n; i++) {
      holes.push(new THREE.Vector3((i - (n - 1) / 2) * 2.5, -14 - row * 2.2, 6.82));
    }
  }
  const hole = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 10);
  hole.rotateX(Math.PI / 2);
  const grille = new THREE.InstancedMesh(hole, dark, holes.length);
  const m = new THREE.Matrix4();
  holes.forEach((p, i) => grille.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
  frontL.add(grille);

  // the loop at the corner: the cord goes through it, which makes it a locket
  const loop = new THREE.Mesh(new THREE.TorusGeometry(3.4, 1.15, 14, 40), shell);
  loop.rotation.y = Math.PI / 2;
  loop.position.set(19.5, 27, 0);
  frontL.add(loop);

  // 4 · the button, slightly proud of the face, and the light ring around it
  const profile = [
    [0, 1.7],
    [6, 1.65],
    [10, 1.35],
    [12.3, 0.85],
    [12.9, 0.3],
    [13, 0],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const buttonGeo = new THREE.LatheGeometry(profile, 64);
  buttonGeo.rotateX(Math.PI / 2);
  const button = new THREE.Mesh(buttonGeo, buttonMat);
  button.position.set(0, 4, 6.75);
  buttonL.add(button);
  const groove = new THREE.Mesh(new THREE.TorusGeometry(14.4, 0.95, 12, 96), channel);
  groove.position.set(0, 4, 6.6);
  buttonL.add(groove);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(14.4, 0.6, 12, 128), led);
  ring.position.set(0, 4, 7.2); // in front of the groove, so they don't flicker
  buttonL.add(ring);

  const insides = [battery, pcb, speaker, magnet, ...boardL.children];

  const anchors: Record<string, THREE.Vector3> = {
    button: new THREE.Vector3(0, 4, 8.5),
    ring: new THREE.Vector3(-10.2, 14.2, 7),
    shell: new THREE.Vector3(24, -20, 5),
    board: new THREE.Vector3(-15, 15, 2.5),
    battery: new THREE.Vector3(19, -14, -2),
    back: new THREE.Vector3(-24, -20, -6),
    frontTop: new THREE.Vector3(0, 26, 7),
    backTop: new THREE.Vector3(0, 26, -7),
  };
  const layerOf: Record<string, number> = { button: 4, ring: 4, shell: 3, board: 2, battery: 1, back: 0 };

  let explode = 0;
  const setExplode = (k: number) => {
    explode = k;
    layers.forEach((l, i) => (l.position.z = (i - 2) * 11 * k));
    const showInsides = k > 0.01;
    insides.forEach((o) => (o.visible = showInsides));
  };
  setExplode(0);

  return {
    root,
    button,
    get anchors() {
      // anchors follow their layer as it moves out
      const out: Record<string, THREE.Vector3> = {};
      for (const [k, v] of Object.entries(anchors)) {
        const i = layerOf[k];
        out[k] = i === undefined ? v.clone() : v.clone().setZ(v.z + (i - 2) * 11 * explode);
      }
      return out;
    },
    loopTop: new THREE.Vector3(19.5, 30.5, 0),
    setExplode,
    setLed(state, level = 0) {
      ledUniforms.uMode.value = LED_MODE[state];
      ledUniforms.uLevel.value = level;
    },
    setGlow(hex) {
      ledUniforms.uGlow.value.set(hex);
    },
    setGain(g) {
      ledUniforms.uGain.value = g;
    },
    setFinish(f) {
      ledUniforms.uOff.value.set(f === "graphite" ? 0x4a4d4f : 0xd2c9bd);
      shell.color.set(FINISH[f]);
      back.color.set(FINISH[f]);
      buttonMat.color.set(FINISH[f]).multiplyScalar(0.94);
    },
    update(time) {
      ledUniforms.uTime.value = time;
    },
    dispose() {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
      });
      [shell, back, buttonMat, dark, channel, board, chip, metal, copper, led].forEach((x) => x.dispose());
    },
  };
}
