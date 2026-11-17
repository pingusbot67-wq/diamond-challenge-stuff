// The 3D kitchen: glossy produce you can spin, that follows your pointer with a light,
// drops into a bowl as you scroll, and tumbles when you "shake the fridge".
// Everything is modelled in code (no downloaded models). If 3D isn't available the page still works.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const THREE: any;

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
let threePromise: Promise<boolean> | null = null;
function loadThree(): Promise<boolean> {
  if ((window as any).THREE) return Promise.resolve(true);
  return (threePromise ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = THREE_URL;
    s.async = true;
    s.onload = () => resolve(!!(window as any).THREE);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  }));
}

export type SceneHandle = { destroy(): void; shake(): void };
type Anchor = () => Element | null;
type Opts = { mode: 'landing' | 'orbit'; anchors?: { hero?: Anchor; bowl?: Anchor; floor?: Anchor }; onReady?: () => void };

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ───────────────────────── materials + models ─────────────────────────
function makeKit() {
  const dimples = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1100; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = 1.5 + Math.random() * 2.5;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(40,40,40,.55)');
      grad.addColorStop(1, 'rgba(128,128,128,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 3);
    return t;
  })();

  const mat = (color: string, o: Record<string, unknown> = {}) =>
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.55, ...o });
  const lathe = (fn: (th: number) => [number, number], seg = 40, phi = Math.PI * 2) => {
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const [r, y] = fn((i / 28) * Math.PI);
      pts.push(new THREE.Vector2(Math.max(0.0001, r), y));
    }
    return new THREE.LatheGeometry(pts, seg, 0, phi);
  };
  const mesh = (g: any, m: any) => new THREE.Mesh(g, m);
  const leafGreen = mat('#2F7A2E', { roughness: 0.55, clearcoat: 0.25, side: THREE.DoubleSide });

  function tomato() {
    const grp = new THREE.Group();
    const g = new THREE.SphereGeometry(1, 64, 48);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.028 * Math.cos(5 * Math.atan2(z, x)) * (1 - y * y);
      const dip = 1 - 0.1 * Math.pow(Math.max(0, y), 6); // little dimple at the stem
      p.setXYZ(i, x * k, y * 0.86 * dip, z * k);
    }
    g.computeVertexNormals();
    grp.add(mesh(g, mat('#DD2C1C', { roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08 })));
    const calyx = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const leaf = mesh(new THREE.ConeGeometry(0.09, 0.5, 5), leafGreen);
      leaf.geometry.translate(0, 0.25, 0);
      leaf.scale.set(1, 1, 0.35);
      leaf.rotation.set(0, (i / 6) * Math.PI * 2, 0);
      const arm = new THREE.Group();
      arm.rotation.y = (i / 6) * Math.PI * 2;
      leaf.rotation.set(0, 0, -1.25);
      arm.add(leaf);
      calyx.add(arm);
    }
    calyx.position.y = 0.76;
    const stem = mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.3, 8), leafGreen);
    stem.position.y = 0.9;
    grp.add(calyx, stem);
    return grp;
  }
  function orange() {
    const grp = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(1, 48, 36), mat('#FF8A1C', { roughness: 0.42, clearcoat: 0.5, bumpMap: dimples, bumpScale: 0.02 }));
    body.scale.y = 0.94;
    const navel = mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.05, 6), mat('#4E7D2E', { roughness: 0.8, clearcoat: 0 }));
    navel.position.y = 0.93;
    grp.add(body, navel);
    return grp;
  }
  function lemon() {
    const g = lathe((th) => [0.72 * Math.pow(Math.sin(th), 0.62) + 0.035 * Math.pow(Math.abs(Math.cos(th)), 12), 1.14 * Math.cos(th)]);
    const m = mesh(g, mat('#F7CF36', { roughness: 0.4, clearcoat: 0.5, bumpMap: dimples, bumpScale: 0.018 }));
    m.rotation.z = Math.PI / 2;
    const grp = new THREE.Group();
    grp.add(m);
    return grp;
  }
  function egg() {
    const g = lathe((th) => [0.76 * Math.sin(th) * (1 - 0.16 * Math.cos(th)), Math.cos(th)]);
    const grp = new THREE.Group();
    grp.add(mesh(g, mat('#F1DCC3', { roughness: 0.5, clearcoat: 0.25 })));
    return grp;
  }
  function avocado() {
    const prof = (th: number): [number, number] => [Math.sin(th) * (0.66 - 0.24 * Math.cos(th)), 1.2 * Math.cos(th)];
    const grp = new THREE.Group();
    grp.add(mesh(lathe(prof, 32, Math.PI), mat('#2C4520', { roughness: 0.65, clearcoat: 0.3, bumpMap: dimples, bumpScale: 0.035 })));
    const face = (scale: number, color: string, x: number) => {
      const s = new THREE.Shape();
      for (let i = 0; i <= 28; i++) {
        const [r, y] = prof((i / 28) * Math.PI);
        i ? s.lineTo(r * scale, y * scale) : s.moveTo(r * scale, y * scale);
      }
      for (let i = 28; i >= 0; i--) {
        const [r, y] = prof((i / 28) * Math.PI);
        s.lineTo(-r * scale, y * scale);
      }
      const m = mesh(new THREE.ShapeGeometry(s, 16), mat(color, { roughness: 0.5, clearcoat: 0.35, side: THREE.DoubleSide }));
      m.rotation.y = Math.PI / 2;
      m.position.x = x;
      return m;
    };
    grp.add(face(1, '#9DBF4F', 0), face(0.88, '#DCE58A', -0.004));
    const pit = mesh(new THREE.SphereGeometry(0.33, 32, 24), mat('#7A4826', { roughness: 0.35, clearcoat: 0.7 }));
    pit.position.set(-0.03, -0.36, 0);
    pit.scale.x = 0.75;
    grp.add(pit);
    const turn = new THREE.Group();
    grp.rotation.y = Math.PI / 2; // cut face toward the camera
    turn.add(grp);
    return turn;
  }
  function broccoli() {
    const grp = new THREE.Group();
    const stem = mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.95, 12), mat('#8FB862', { roughness: 0.7, clearcoat: 0.1 }));
    stem.position.y = -0.55;
    grp.add(stem);
    const head = mat('#3B7A32', { roughness: 0.85, clearcoat: 0.05, flatShading: true });
    const spots: [number, number, number, number][] = [[0, 0.42, 0, 0.5], [0.42, 0.2, 0.1, 0.4], [-0.42, 0.22, 0.05, 0.4], [0.1, 0.22, 0.42, 0.4], [-0.08, 0.2, -0.42, 0.4],
      [0.33, 0.02, -0.33, 0.33], [-0.34, 0, 0.34, 0.33], [0.36, -0.02, 0.36, 0.3], [-0.36, 0, -0.33, 0.3]];
    for (const [x, y, z, r] of spots) {
      const f = mesh(new THREE.IcosahedronGeometry(r, 1), head);
      f.position.set(x, y, z);
      grp.add(f);
    }
    return grp;
  }
  function carrot() {
    const grp = new THREE.Group();
    const body = mesh(new THREE.ConeGeometry(0.34, 1.9, 28, 1), mat('#F2832A', { roughness: 0.45, clearcoat: 0.4 }));
    body.rotation.z = Math.PI;
    grp.add(body);
    for (let i = 0; i < 3; i++) {
      const l = mesh(new THREE.ConeGeometry(0.07, 0.75, 6), leafGreen);
      l.position.set((i - 1) * 0.1, 1.25, 0);
      l.rotation.z = (1 - i) * 0.35;
      grp.add(l);
    }
    grp.rotation.z = -0.5;
    const outer = new THREE.Group();
    outer.add(grp);
    return outer;
  }
  function berry() {
    const grp = new THREE.Group();
    grp.add(mesh(new THREE.SphereGeometry(1, 28, 20), mat('#3A478F', { roughness: 0.38, clearcoat: 0.45 })));
    const crown = mesh(new THREE.TorusGeometry(0.24, 0.07, 6, 5), mat('#232B5C', { roughness: 0.6, clearcoat: 0 }));
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 0.94;
    grp.add(crown);
    return grp;
  }
  function leaf() {
    const s = new THREE.Shape();
    s.moveTo(0, -1);
    s.bezierCurveTo(0.72, -0.5, 0.72, 0.5, 0, 1);
    s.bezierCurveTo(-0.72, 0.5, -0.72, -0.5, 0, -1);
    const g = new THREE.ShapeGeometry(s, 14);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, 0.45 * p.getX(i) * p.getX(i) + 0.12 * p.getY(i) * p.getY(i));
    g.computeVertexNormals();
    const grp = new THREE.Group();
    grp.add(mesh(g, mat('#4FA046', { roughness: 0.5, clearcoat: 0.3, side: THREE.DoubleSide })));
    return grp;
  }
  function bowl() {
    const pts = [[0, -0.55], [0.5, -0.55], [0.92, -0.3], [1.16, 0.08], [1.27, 0.36], [1.2, 0.37], [1.09, 0.1], [0.86, -0.24], [0.46, -0.44], [0, -0.45]].map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
    const g = new THREE.LatheGeometry(pts, 64);
    return mesh(g, mat('#1C1917', { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.35, side: THREE.DoubleSide }));
  }
  return { tomato, orange, lemon, egg, avocado, broccoli, carrot, berry, leaf, bowl };
}

type Item = {
  obj: any; kind: string; size: number; ang: number; ring: number; yoff: number; ph: number; sp: number;
  bx: number; bz: number; bh: number; x: number; y: number; z: number; s: number; vx: number; vy: number; sa: number; sr: number; spin: number;
};

export function mountScene(host: HTMLElement, opts: Opts): SceneHandle {
  let dead = false;
  let cleanup = () => {};
  let doShake = () => {};
  const handle: SceneHandle = { destroy: () => ((dead = true), cleanup()), shake: () => doShake() };

  loadThree().then((ok) => {
    if (!ok || dead) return;
    let renderer: any;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      return; // no WebGL here: the page simply shows without 3D
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    const canvas: HTMLCanvasElement = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.z = 12;

    // soft studio reflections so the produce looks glossy
    {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const g = c.getContext('2d')!;
      const bg = g.createLinearGradient(0, 0, 0, 256);
      bg.addColorStop(0, '#8c7a6c');
      bg.addColorStop(0.5, '#5c4a3e');
      bg.addColorStop(1, '#2a1f19');
      g.fillStyle = bg;
      g.fillRect(0, 0, 512, 256);
      for (const [x, y, r, a] of [[130, 60, 80, 1], [380, 40, 60, 0.9], [260, 20, 110, 0.7], [470, 120, 40, 0.5]] as const) {
        const sp = g.createRadialGradient(x, y, 0, x, y, r);
        sp.addColorStop(0, `rgba(255,255,255,${a})`);
        sp.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = sp;
        g.fillRect(0, 0, 512, 256);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.encoding = THREE.sRGBEncoding;
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromEquirectangular(tex).texture;
      tex.dispose();
      pm.dispose();
    }
    scene.add(new THREE.HemisphereLight(0xfff1dd, 0x8a5a3c, 0.62));
    const key = new THREE.DirectionalLight(0xfff6ea, 0.85);
    key.position.set(3, 6, 7);
    const rim = new THREE.DirectionalLight(0xff7a45, 0.45);
    rim.position.set(-6, 2, -4);
    const glow = new THREE.PointLight(0xffd2a0, 0.9, 14, 2); // follows your pointer
    glow.position.set(0, 0, 4);
    scene.add(key, rim, glow);

    const kit = makeKit();
    const landing = opts.mode === 'landing';
    const recipe: [keyof typeof kit, number][] = landing
      ? [['tomato', 1], ['avocado', 0.5], ['lemon', 0.4], ['broccoli', 0.42], ['egg', 0.34], ['carrot', 0.4], ['orange', 0.38], ['leaf', 0.24], ['berry', 0.15], ['egg', 0.3], ['berry', 0.13], ['leaf', 0.2], ['tomato', 0.3], ['berry', 0.14], ['lemon', 0.3], ['leaf', 0.22], ['berry', 0.12]]
      : [['tomato', 1], ['avocado', 0.52], ['lemon', 0.4], ['broccoli', 0.42], ['egg', 0.34], ['carrot', 0.4], ['leaf', 0.24], ['berry', 0.15], ['berry', 0.13]];
    const root = new THREE.Group();
    scene.add(root);
    const sats = recipe.length - 1;
    const items: Item[] = recipe.map(([kind, size], i) => {
      const obj = (kit[kind] as () => any)();
      root.add(obj);
      const k = i - 1;
      const golden = k * 2.39996;
      const br = i === 0 ? 0 : 0.28 + 0.6 * Math.sqrt((k + 0.5) / sats);
      return {
        obj, kind, size,
        ang: i === 0 ? 0 : (k / sats) * Math.PI * 2 + (k % 2) * 0.35,
        ring: i === 0 ? 0 : 1.02 + (k % 3) * 0.2,
        yoff: i === 0 ? 0 : ((k * 0.37) % 1) * 1.1 - 0.55,
        ph: i * 1.7, sp: 0.5 + (i % 4) * 0.13,
        bx: Math.cos(golden) * br, bz: Math.sin(golden) * br, bh: 0.12 + (k % 3) * 0.1,
        x: 0, y: 0, z: 0, s: 0.0001, vx: 0, vy: 0, sa: (i * 12.9898) % 6.283, sr: 0.35 + ((i * 7) % 5) * 0.07, spin: 0,
      };
    });
    const bowl = kit.bowl();
    bowl.visible = false;
    scene.add(bowl);
    const BOWL_TILT = 0.8;
    bowl.rotation.x = BOWL_TILT;

    let W = 1, H = 1, viewW = 1, viewH = 1;
    const resize = () => {
      const r = host.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      viewH = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      viewW = viewH * camera.aspect;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // pointer: light + spin
    const ptr = { x: 0, y: 0, tx: 0, ty: 0, lastX: null as number | null, lastY: 0, in: false };
    let yaw = 0, yawV = 0;
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      ptr.tx = ((e.clientX - r.left) / r.width - 0.5) * viewW;
      ptr.ty = (0.5 - (e.clientY - r.top) / r.height) * viewH;
      ptr.in = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (ptr.lastX !== null && ptr.in) yawV += clamp((e.clientX - ptr.lastX) * 0.0016, -0.08, 0.08);
      ptr.lastX = e.clientX;
      ptr.lastY = e.clientY;
    };
    const onLeave = () => ((ptr.lastX = null), (ptr.in = false));
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onLeave, { passive: true });
    window.addEventListener('pointercancel', onLeave, { passive: true });

    // where things should be on screen
    const rectOf = (a?: Anchor) => {
      const el = a?.();
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      return {
        cx: ((r.left + r.width / 2 - h.left) / W - 0.5) * viewW,
        cy: (0.5 - (r.top + r.height / 2 - h.top) / H) * viewH,
        w: (r.width / W) * viewW,
        h: (r.height / H) * viewH,
        bottom: (0.5 - (r.bottom - h.top) / H) * viewH,
        vis: clamp((Math.min(r.bottom, h.bottom) - Math.max(r.top, h.top)) / Math.max(1, Math.min(r.height, h.height))),
      };
    };

    // "shake the fridge": simple bouncy physics
    let drop = false;
    let autoDropped = false;
    const startDrop = () => {
      drop = true;
      bowl.visible = false;
      items.forEach((it, i) => {
        it.x = (Math.random() - 0.5) * viewW * 0.8;
        it.y = viewH / 2 + 1 + i * 0.55;
        it.vx = (Math.random() - 0.5) * 2;
        it.vy = 0;
      });
    };
    doShake = () => {
      if (!landing) {
        yawV += 0.35;
        return;
      }
      if (!drop) return startDrop();
      for (const it of items) {
        it.vy += 7 + Math.random() * 6;
        it.vx += (Math.random() - 0.5) * 9;
      }
    };

    let raf = 0, last = performance.now(), visible = true, readyFired = false;
    const io = new IntersectionObserver((es) => (visible = es[0]?.isIntersecting ?? true));
    io.observe(host);
    const t0 = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const t = reduce ? 0 : (now - t0) / 1000;
      const ease = 1 - Math.exp(-dt * 5.5);

      ptr.x += (ptr.tx - ptr.x) * (1 - Math.exp(-dt * 8));
      ptr.y += (ptr.ty - ptr.y) * (1 - Math.exp(-dt * 8));
      glow.position.set(ptr.x, ptr.y, 3.2);
      yaw += yawV + (reduce ? 0 : dt * 0.12);
      yawV *= Math.pow(0.04, dt);

      const hero = landing ? rectOf(opts.anchors?.hero) : { cx: 0, cy: 0, w: viewW, h: viewH, bottom: -viewH / 2, vis: 1 };
      const bowlA = landing ? rectOf(opts.anchors?.bowl) : null;
      const floorA = landing ? rectOf(opts.anchors?.floor) : null;

      if (landing && floorA && floorA.vis > 0.55 && !autoDropped) {
        autoDropped = true;
        startDrop();
      }
      if (drop && (!floorA || floorA.vis <= 0.01)) {
        drop = false;
        autoDropped = false;
        for (const it of items) it.s = 0.0001;
      }

      if (drop && floorA) {
        const floorY = Math.max(-viewH / 2, floorA.bottom) + 0.05;
        const wall = viewW / 2;
        const unit = clamp(viewW * 0.075, 0.34, 0.62);
        const steps = 2;
        for (let k = 0; k < steps; k++) {
          const h = dt / steps;
          for (const it of items) {
            const rad = unit * (0.4 + it.size * 0.85);
            it.vy -= 22 * h;
            if (ptr.in) {
              const dx = it.x - ptr.x, dy = it.y - ptr.y, d = Math.hypot(dx, dy);
              if (d < rad * 1.6 && d > 0.001) {
                it.vx += (dx / d) * 30 * h;
                it.vy += (dy / d) * 30 * h;
              }
            }
            it.x += it.vx * h;
            it.y += it.vy * h;
            if (it.y - rad < floorY) {
              it.y = floorY + rad;
              it.vy = Math.abs(it.vy) > 1.2 ? -it.vy * 0.38 : 0;
              it.vx *= 0.94;
            }
            if (it.x - rad < -wall) (it.x = -wall + rad), (it.vx = Math.abs(it.vx) * 0.5);
            if (it.x + rad > wall) (it.x = wall - rad), (it.vx = -Math.abs(it.vx) * 0.5);
            it.s = rad;
          }
          for (let a = 0; a < items.length; a++)
            for (let b = a + 1; b < items.length; b++) {
              const A = items[a], B = items[b];
              const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 0.001, min = A.s + B.s;
              if (d < min) {
                const nx = dx / d, ny = dy / d, push = (min - d) / 2;
                A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
                const rel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
                if (rel < 0) {
                  const j = -rel * 0.62;
                  A.vx -= nx * j; A.vy -= ny * j; B.vx += nx * j; B.vy += ny * j;
                }
              }
            }
        }
        for (const it of items) {
          it.spin -= it.vx * dt * 1.6;
          it.obj.position.set(it.x, it.y, 0);
          it.obj.rotation.set(it.sa * 0.3, it.sa, it.spin);
          it.obj.scale.setScalar(it.s);
          it.obj.visible = true;
        }
        renderer.render(scene, camera);
        return;
      }

      // hero cluster ↔ scattered ↔ in the bowl
      const wHero = hero ? (landing ? smooth(0.05, 0.75, hero.vis) : 1) : 0;
      const wBowl = bowlA ? smooth(0.25, 0.8, bowlA.vis) : 0;
      const u = (hero ? Math.min(hero.w, hero.h) / 2 : 1) * (landing ? 1 : 0.84);
      const narrow = viewW < viewH * 0.8;
      const bR = bowlA ? Math.min(bowlA.w, bowlA.h * 1.25) / 2.6 : 1;

      if (bowlA && wBowl > 0.01) {
        bowl.visible = true;
        bowl.position.set(bowlA.cx, bowlA.cy - bR * 0.25, -0.5);
        bowl.scale.setScalar(bR * smooth(0, 0.6, wBowl));
      } else bowl.visible = false;

      items.forEach((it, i) => {
        // scattered: flown off past the screen edge
        const sx = Math.cos(it.sa) * (viewW * 0.5 + 2.2) * (1 + (i % 3) * 0.12);
        const sy = Math.sin(it.sa) * (viewH * 0.5 + 2.2) + (hero ? hero.cy * 0.3 : 0);
        let tx = sx, ty = sy, tz = 0, ts = 0.0001;

        if (wBowl > 0.01 && bowlA) {
          const wi = smooth(0, 1, clamp(wBowl * 1.5 - i * 0.03));
          const lx = it.bx * bR * 0.95, lz = it.bz * bR * 0.95, ly = it.bh * bR + (1 - wi) * (viewH * 0.6 + i * 0.3);
          const bx = bowlA.cx + lx;
          const by = bowlA.cy - bR * 0.25 + ly * Math.cos(BOWL_TILT) - lz * Math.sin(BOWL_TILT) + bR * 0.12;
          const bz = -0.5 + ly * Math.sin(BOWL_TILT) + lz * Math.cos(BOWL_TILT);
          const bs = bR * (0.15 + it.size * 0.36);
          tx = sx + (bx - sx) * wi; ty = sy + (by - sy) * wi; tz = bz * wi; ts = bs * wi;
        } else if (hero && wHero > 0.01) {
          const a = it.ang + yaw;
          const R = it.ring * u * (landing ? (narrow ? 0.6 : 0.78) : 1);
          const hx = hero.cx + Math.cos(a) * R + ptr.x * 0.03 * (i ? 1 : 0.4);
          const hy = hero.cy + it.yoff * u * 0.6 - Math.sin(a) * u * 0.46 + Math.sin(t * it.sp + it.ph) * u * 0.045 + ptr.y * 0.03; // items passing in front dip below the hero
          const hz = Math.sin(a) * R * 0.9;
          const hs = u * it.size * (i ? 0.46 : landing ? 0.5 : 0.56);
          tx = sx + (hx - sx) * wHero; ty = sy + (hy - sy) * wHero; tz = hz * wHero; ts = hs * smooth(0, 0.7, wHero);
        }
        it.x += (tx - it.x) * ease; it.y += (ty - it.y) * ease; it.z += (tz - it.z) * ease; it.s += (ts - it.s) * ease;
        it.obj.visible = it.s > 0.002;
        it.obj.position.set(it.x, it.y, it.z);
        it.obj.scale.setScalar(Math.max(0.0001, it.s));
        const wob = it.kind === 'avocado' || it.kind === 'tomato' && i === 0;
        it.obj.rotation.set(
          Math.sin(t * 0.4 + it.ph) * 0.18 + (i ? it.sa * 0.25 : 0.12) - ptr.y * 0.02,
          wob ? Math.sin(t * 0.5 + it.ph) * 0.35 + yaw * (i ? 0.2 : 1) + ptr.x * 0.04 : t * it.sr + it.sa + yaw,
          i ? Math.sin(t * 0.3 + it.ph) * 0.25 : 0.08,
        );
      });
      renderer.render(scene, camera);
      if (!readyFired) {
        readyFired = true;
        canvas.classList.add('is-ready');
        opts.onReady?.();
      }
    };
    raf = requestAnimationFrame(frame);

    cleanup = () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onLeave);
      window.removeEventListener('pointercancel', onLeave);
      scene.traverse((o: any) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => m.dispose?.());
      });
      renderer.dispose();
      canvas.remove();
    };
    if (dead) cleanup();
  });

  return handle;
}
