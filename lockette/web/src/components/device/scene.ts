import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildDevice, MM, type LedState } from "./device";
import { POSES, type Pose } from "./pose";

/**
 * The one WebGL scene behind the page: the device, a soft contact shadow,
 * the cord (footer), and Pingus's post chain:
 *
 *   scene -> bloom (only the light ring is bright enough) -> output -> grade (vignette + grain)
 *
 * The background is painted in the page's own colour, so the canvas can sit
 * full-screen behind everything. Resolution drops a notch when frames run
 * long, and nothing renders while the canvas is off-screen.
 */

const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.08 },
    uGrain: { value: 0.03 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette, uGrain, uTime;
    uniform vec2 uRes;
    varying vec2 vUv;
    float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec2 q = vUv - 0.5;
      q.x *= uRes.x / uRes.y;
      c *= 1.0 - uVignette * smoothstep(0.35, 1.1, length(q));
      float g = h12(vUv * uRes + fract(uTime * 7.13) * 431.0) - 0.5;
      c += g * uGrain * (0.35 + l * (1.0 - l) * 2.6);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }
  `,
};

const THEMES = {
  paper: { bg: "#faf5ee", shadow: 0x4a3426, shadowOpacity: 0.3, vignette: 0.08, cord: 0x3a302b },
  night: { bg: "#0b0d0d", shadow: 0x000000, shadowOpacity: 0.55, vignette: 0.28, cord: 0xcbbfb2 },
};
export type SceneTheme = keyof typeof THEMES;

export interface Projected {
  x: number;
  y: number;
}

export interface DeviceScene {
  setPose(p: Pose): void;
  /** override the light ring (the dashboard mirrors Lockette's real state) */
  setLed(state: LedState | null, level?: number): void;
  setTheme(t: SceneTheme): void;
  /** where a named point on the device is, in CSS px inside the host */
  project(anchor: string): Projected | null;
  /** runs after each frame is drawn; for labels that follow the device */
  onFrame(fn: () => void): () => void;
  onPress(fn: () => void): () => void;
  setInteractive(on: boolean): void;
  dispose(): void;
}

export function createDeviceScene(
  host: HTMLElement,
  opts: { theme: SceneTheme; handle?: HTMLElement | null; pose?: Pose; camera?: number; fov?: number; transparent?: boolean },
): DeviceScene {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const clear = !!opts.transparent;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: clear, alpha: clear, preserveDrawingBuffer: clear, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  let theme = THEMES[opts.theme];
  scene.background = clear ? null : new THREE.Color(theme.bg);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  if (clear) {
    // stills have no bloom, so tone-map the light ring instead of letting it clip
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene.environmentIntensity = 0.75;
  }
  const key = new THREE.DirectionalLight(0xfff0dc, 0.85);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.25);
  rim.position.set(4, -1, -3);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(opts.fov ?? 30, 1, 0.1, 50);
  camera.position.set(0, 0, opts.camera ?? 4.4);
  camera.lookAt(0, 0, 0);

  const device = buildDevice();
  scene.add(device.root);
  const body = device.root.children[0] as THREE.Object3D;
  if (opts.theme === "night") device.setFinish("graphite");
  if (clear) device.setGain(0.36);

  // a soft contact shadow: a blurred dark ellipse on an invisible floor
  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadowMat = new THREE.MeshBasicMaterial({
    color: theme.shadow,
    alphaMap: shadowTex,
    transparent: true,
    opacity: theme.shadowOpacity,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  // the cord it hangs from in the footer
  const cordMat = new THREE.MeshStandardMaterial({ color: theme.cord, roughness: 0.9 });
  const cord = new THREE.Mesh(new THREE.BufferGeometry(), cordMat);
  cord.visible = false;
  scene.add(cord);

  const target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.45, 1.7);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);

  /* ------------------------------------------------------------ sizing */

  let cssW = 1;
  let cssH = 1;
  let scale = 1;
  const baseRatio = () => Math.min(window.devicePixelRatio || 1, 1.5);
  const resize = () => {
    cssW = Math.max(1, host.clientWidth);
    cssH = Math.max(1, host.clientHeight);
    const ratio = baseRatio() * scale;
    renderer.setPixelRatio(ratio);
    renderer.setSize(cssW, cssH, false);
    composer.setPixelRatio(ratio);
    composer.setSize(cssW, cssH);
    grade.uniforms.uRes.value.set(cssW * ratio, cssH * ratio);
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let onScreen = true;
  const io = new IntersectionObserver((e) => (onScreen = e.some((x) => x.isIntersecting)));
  io.observe(host);

  /* -------------------------------------------------------- interaction */

  const handle = opts.handle ?? null;
  let interactive = !!handle;
  const user = { yaw: 0, pitch: 0, vy: 0, vp: 0, dragging: false, sinceRelease: 99, lx: 0, ly: 0 };
  const lean = { x: 0, y: 0, tx: 0, ty: 0 };
  const press = { start: 0, x: 0, y: 0, moved: false };
  let hoverButton = false;
  let pressedUntil = 0;
  const pressFns = new Set<() => void>();
  const raycaster = new THREE.Raycaster();

  const hitsButton = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(device.button, false).length > 0;
  };
  const doPress = () => {
    pressedUntil = clock + 2.6;
    pressFns.forEach((f) => f());
  };

  const onDown = (e: PointerEvent) => {
    if (!interactive) return;
    user.dragging = true;
    user.vy = user.vp = 0;
    user.lx = e.clientX;
    user.ly = e.clientY;
    press.start = performance.now();
    press.x = e.clientX;
    press.y = e.clientY;
    press.moved = false;
    try {
      handle?.setPointerCapture(e.pointerId);
    } catch {
      /* fine */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!interactive) return;
    if (user.dragging) {
      const dx = e.clientX - user.lx;
      const dy = e.clientY - user.ly;
      user.lx = e.clientX;
      user.ly = e.clientY;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) press.moved = true;
      if (!press.moved) return;
      user.yaw += dx * 0.011;
      user.pitch = Math.max(-0.6, Math.min(0.6, user.pitch + dy * 0.008));
      user.vy = user.vy * 0.5 + dx * 0.011 * 30;
      user.vp = user.vp * 0.5 + dy * 0.008 * 30;
    } else {
      hoverButton = hitsButton(e.clientX, e.clientY);
      if (handle) handle.style.cursor = hoverButton ? "pointer" : "grab";
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!user.dragging) return;
    user.dragging = false;
    user.sinceRelease = 0;
    if (!press.moved && performance.now() - press.start < 450 && hitsButton(e.clientX, e.clientY)) doPress();
  };
  const onLeave = () => {
    hoverButton = false;
  };
  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowRight") {
      user.vy += k === "ArrowLeft" ? -3 : 3;
      user.sinceRelease = -0.4;
      e.preventDefault();
    } else if (k === "ArrowUp" || k === "ArrowDown") {
      user.vp += k === "ArrowUp" ? -2 : 2;
      user.sinceRelease = -0.4;
      e.preventDefault();
    } else if (k === "Enter" || k === " ") {
      doPress();
      e.preventDefault();
    }
  };
  const onWindowMove = (e: PointerEvent) => {
    lean.tx = (e.clientX / window.innerWidth) * 2 - 1;
    lean.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (handle) {
    handle.addEventListener("pointerdown", onDown);
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
    handle.addEventListener("pointerleave", onLeave);
    handle.addEventListener("keydown", onKey);
  }
  window.addEventListener("pointermove", onWindowMove, { passive: true });

  /* ------------------------------------------------------------- pose */

  let targetPose: Pose = opts.pose ?? POSES.hero;
  const cur = { ...targetPose };
  const curQ = new THREE.Quaternion();
  const tmpQ = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  let ledOverride: { state: LedState; level: number } | null = null;
  let spinAngle = 0;
  const pend = { angle: 0, vel: 0 };
  const HANG_ROLL = Math.atan2(19.5, 30.5); // turns the loop to the top so it hangs true

  const halfSize = () => {
    const h = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    return { w: h * camera.aspect, h };
  };

  const loopWorld = new THREE.Vector3();
  const applyPose = (dt: number) => {
    const k = 1 - Math.exp(-dt * 10);
    for (const key of ["x", "y", "scale", "explode", "cord", "float", "spin"] as const) {
      cur[key] += (targetPose[key] - cur[key]) * k;
    }
    cur.led = targetPose.led;

    // user turning: inertia after a flick, then an easy spring back to the timeline
    if (!user.dragging) {
      user.yaw += user.vy * dt;
      user.pitch = Math.max(-0.6, Math.min(0.6, user.pitch + user.vp * dt));
      const decay = Math.pow(0.04, dt);
      user.vy *= decay;
      user.vp *= decay;
      user.sinceRelease += dt;
      if (user.sinceRelease > 0.25) {
        const back = Math.exp(-dt * 3.2);
        user.yaw *= back;
        user.pitch *= back;
      }
    }
    lean.x += (lean.tx - lean.x) * (1 - Math.exp(-dt * 3));
    lean.y += (lean.ty - lean.y) * (1 - Math.exp(-dt * 3));
    spinAngle += cur.spin * dt;

    const t = clock;
    const bob = Math.sin(t * 1.15) * 0.012 * cur.float;
    const sway = Math.sin(t * 0.45) * 0.105 * cur.float;
    const hang = cur.cord;

    // the pendulum (footer): swings, settles, and follows the cursor a little
    if (hang > 0.01) {
      const g = 9;
      const want = lean.x * 0.22;
      const acc = -g * Math.sin(pend.angle - want) - 1.1 * pend.vel;
      pend.vel += acc * dt;
      pend.angle += pend.vel * dt;
    } else {
      pend.angle = 0.35; // starts with a little swing when the cord arrives
      pend.vel = 0;
    }

    euler.set(
      targetPose.pitch + user.pitch + lean.y * 0.09,
      targetPose.yaw + user.yaw + sway + spinAngle + lean.x * 0.14,
      targetPose.roll + (HANG_ROLL + pend.angle) * hang,
    );
    tmpQ.setFromEuler(euler);
    curQ.slerp(tmpQ, 1 - Math.exp(-dt * 9));
    device.root.quaternion.copy(curQ);

    const { w, h } = halfSize();
    const s = cur.scale * Math.min(1, camera.aspect / 0.75);
    device.root.scale.setScalar(s);
    let px = cur.x * w;
    let py = cur.y * h + bob;
    if (hang > 0.01) {
      // hang from an anchor above the top of the screen, through the corner loop
      const anchor = new THREE.Vector3(px + 0.15, h * 1.25, 0);
      const len = anchor.y - py;
      const end = new THREE.Vector3(anchor.x + Math.sin(pend.angle) * len, anchor.y - Math.cos(pend.angle) * len, 0);
      device.root.position.set(0, 0, 0);
      device.root.updateMatrixWorld();
      loopWorld.copy(device.loopTop).applyMatrix4(body.matrixWorld);
      const hx = end.x - loopWorld.x;
      const hy = end.y - loopWorld.y;
      px = px + (hx - px) * hang;
      py = py + (hy - py) * hang;
      device.root.position.set(px, py, 0);
      device.root.updateMatrixWorld();
      loopWorld.copy(device.loopTop).applyMatrix4(body.matrixWorld);
      const mid = anchor.clone().lerp(loopWorld, 0.5).add(new THREE.Vector3(Math.sin(pend.angle) * 0.04, -0.02, 0));
      const curve = new THREE.CatmullRomCurve3([anchor, mid, loopWorld]);
      cord.geometry.dispose();
      cord.geometry = new THREE.TubeGeometry(curve, 48, 0.008 * s + 0.004, 6, false);
      cord.visible = true;
    } else {
      device.root.position.set(px, py, 0);
      cord.visible = false;
    }

    device.setExplode(cur.explode);
    shadow.position.set(px, py - 0.62 * s - 0.04, -0.1);
    shadow.scale.set(s * (1 - cur.explode * 0.15), s * 0.55, 1);
    shadowMat.opacity = theme.shadowOpacity * (1 - hang) * (1 - cur.explode * 0.5);

    let led: LedState = cur.led;
    let level = 0;
    if (ledOverride) {
      led = ledOverride.state;
      level = ledOverride.level;
    }
    if (hoverButton || clock < pressedUntil) led = "listening";
    device.setLed(led, level);
  };

  /* ------------------------------------------------------ handle + labels */

  const box = new THREE.Box3();
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  const placeHandle = () => {
    if (!handle) return;
    if (!interactive || cur.cord > 0.5) {
      handle.style.visibility = "hidden";
      return;
    }
    box.setFromObject(body);
    const { min, max } = box;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    corners.forEach((c, i) => {
      c.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).project(camera);
      const sx = ((c.x + 1) / 2) * cssW;
      const sy = ((1 - c.y) / 2) * cssH;
      x0 = Math.min(x0, sx);
      y0 = Math.min(y0, sy);
      x1 = Math.max(x1, sx);
      y1 = Math.max(y1, sy);
    });
    const r = host.getBoundingClientRect();
    handle.style.visibility = "visible";
    handle.style.left = `${r.left + x0}px`;
    handle.style.top = `${r.top + y0}px`;
    handle.style.width = `${Math.max(0, x1 - x0)}px`;
    handle.style.height = `${Math.max(0, y1 - y0)}px`;
  };

  const frameFns = new Set<() => void>();
  const proj = new THREE.Vector3();

  /* ------------------------------------------------------------ loop */

  let clock = 0;
  let last = performance.now();
  let raf = 0;
  let slow = 0;
  let fast = 0;
  let disposed = false;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (!onScreen) return;
    clock += dt;
    applyPose(dt);
    device.update(clock);
    grade.uniforms.uTime.value = clock;
    if (clear) renderer.render(scene, camera);
    else composer.render(dt);
    placeHandle();
    frameFns.forEach((f) => f());
    // a notch down after a run of slow frames, back up after a long run of fast ones
    if (dt > 0.034) {
      slow++;
      fast = 0;
    } else {
      fast++;
      slow = Math.max(0, slow - 1);
    }
    if (slow > 40 && scale > 0.5) {
      scale = Math.max(0.5, scale * 0.85);
      slow = 0;
      resize();
    } else if (fast > 600 && scale < 1) {
      scale = Math.min(1, scale * 1.1);
      fast = 0;
      resize();
    }
  };
  applyPose(1);
  raf = requestAnimationFrame(frame);

  return {
    setPose(p) {
      targetPose = p;
    },
    setLed(state, level = 0) {
      ledOverride = state ? { state, level } : null;
    },
    setTheme(t) {
      theme = THEMES[t];
      device.setFinish(t === "night" ? "graphite" : "porcelain");
      if (!clear) (scene.background as THREE.Color).set(theme.bg);
      shadowMat.color.set(theme.shadow);
      cordMat.color.set(theme.cord);
      grade.uniforms.uVignette.value = theme.vignette;
    },
    project(name) {
      const a = device.anchors[name];
      if (!a) return null;
      proj.copy(a).applyMatrix4(body.matrixWorld).project(camera);
      return { x: ((proj.x + 1) / 2) * cssW, y: ((1 - proj.y) / 2) * cssH };
    },
    onFrame(fn) {
      frameFns.add(fn);
      return () => frameFns.delete(fn);
    },
    onPress(fn) {
      pressFns.add(fn);
      return () => pressFns.delete(fn);
    },
    setInteractive(on) {
      interactive = on && !!handle;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onWindowMove);
      if (handle) {
        handle.removeEventListener("pointerdown", onDown);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        handle.removeEventListener("pointerleave", onLeave);
        handle.removeEventListener("keydown", onKey);
      }
      device.dispose();
      cord.geometry.dispose();
      cordMat.dispose();
      shadow.geometry.dispose();
      shadowMat.dispose();
      shadowTex.dispose();
      env.dispose();
      pmrem.dispose();
      bloom.dispose();
      composer.dispose();
      target.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

export { MM };
