/* Saltback drain node: interactive 3D model (three.js). Loaded only when the Device page opens.
   Units are millimetres. The three printed parts (box, lid, probe holder) are the same STL files you print
   (made by device/build_parts.py); everything else is drawn from simple shapes at real sizes. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STL } from './device/stl-data.js';

/* ---------- parts list: the single source for the 3D labels, the table and the costs ---------- */
export const PARTS = [
  { id: 'body', group: 'Housing', name: 'Electronics box (3D printed)', qty: 1, usd: 4, print: 'enclosure_body.stl',
    job: 'Keeps the electronics dry under the grate. 150 × 100 × 70 mm, 3 mm walls, three cable-gland holes in the floor, side tabs for the bracket.',
    buy: 'Print in PETG or ASA, about 160 g. Or buy an IP67 box of the same size (about $15).' },
  { id: 'lid', group: 'Housing', name: 'Lid with sealing lip (3D printed)', qty: 1, usd: 2, print: 'enclosure_lid.stl',
    job: 'Closes the box with four M3 screws. The lip presses a foam gasket against the rim.', buy: 'Print plate-down in PETG or ASA.' },
  { id: 'gasket', group: 'Housing', name: 'Foam gasket tape, 3 mm', qty: 1, usd: 3, job: 'Seals the lid against splashes and road spray.', buy: 'Closed-cell neoprene weatherstrip tape.' },
  { id: 'glands', group: 'Housing', name: 'Cable glands, PG7', qty: 3, usd: 5, job: 'Let the three probe cables out of the box without letting water in.', buy: 'Nylon PG7 glands for 3–6.5 mm cable, pack of 10.' },
  { id: 'desiccant', group: 'Housing', name: 'Desiccant pack', qty: 1, usd: 2, job: 'Soaks up condensation inside the box. Swap it each spring.', buy: '10 g silica gel with colour indicator.' },
  { id: 'mcu', group: 'Electronics', name: 'ESP32 microcontroller board', qty: 1, usd: 10,
    job: 'Wakes every 5 minutes, reads the probes, stores the reading and sends the data. Sleeps the rest of the time to save battery.', buy: 'ESP32-DevKitC or similar.' },
  { id: 'ecboard', group: 'Electronics', name: 'Conductivity signal board', qty: 1, usd: 0, job: 'Turns the probe signal into a voltage the ESP32 can read. Comes with the DFR0300 kit.', buy: 'Included with the conductivity probe.' },
  { id: 'modem', group: 'Electronics', name: 'LTE-M / NB-IoT modem with SIM', qty: 1, usd: 35,
    job: 'Sends each storm\'s readings to Saltback over the cell network. No Wi-Fi is needed in a storm drain.', buy: 'SIM7080G board, plus an IoT data SIM (about $2–5 a month).' },
  { id: 'antenna', group: 'Electronics', name: 'Flat LTE antenna', qty: 1, usd: 8, job: 'Sits on the lid, just under the grate, so the signal gets out through the grate slots.', buy: 'Adhesive flex antenna with u.FL lead.' },
  { id: 'rtc', group: 'Electronics', name: 'Real-time clock', qty: 1, usd: 5, job: 'Keeps exact time so readings line up with truck logs and weather, even without signal.', buy: 'DS3231 module with coin cell.' },
  { id: 'sd', group: 'Electronics', name: 'microSD logger + 8 GB card', qty: 1, usd: 9, job: 'Backup copy of every reading in case the cell signal drops during a storm.', buy: 'SPI microSD module.' },
  { id: 'carrier', group: 'Electronics', name: 'Carrier board, wires, 4.7 kΩ resistor', qty: 1, usd: 8, job: 'Holds the modules on brass standoffs and wires them together. The resistor is needed by the temperature probe.', buy: 'Perfboard, JST connectors, M3 standoffs.' },
  { id: 'battery', group: 'Power', name: 'Battery: 3 × 18650 Li-ion cells', qty: 1, usd: 22, job: 'About 10 Ah. With deep sleep between readings this should last a winter; check it with a real power test.', buy: 'Protected 18650 cells and a 3-cell holder (wired in parallel).' },
  { id: 'ec1', group: 'Sensors', name: 'Conductivity probe, standard (K=1)', qty: 1, usd: 70,
    job: 'Measures how salty the drain water is, up to 20 mS/cm. The simulation shows it maxes out in the first flush of brine.', buy: 'DFRobot DFR0300 (Gravity analog EC kit).' },
  { id: 'ec10', group: 'Sensors', name: 'Conductivity probe, high-range (K=10)', qty: 1, usd: 90,
    job: 'Reads about ten times higher, so the saltiest runoff is counted too. Recommended by the simulation.', buy: 'K=10 industrial EC electrode; uses the same signal board.' },
  { id: 'temp', group: 'Sensors', name: 'Temperature probe', qty: 1, usd: 5,
    job: 'Cold water conducts less electricity. Without this correction the salt readings would be about half what they should be.', buy: 'Waterproof DS18B20, stainless tip.' },
  { id: 'float', group: 'Sensors', name: 'Float switch (optional)', qty: 1, usd: 6, job: 'Tells the node when water is flowing, so it can read every minute during runoff and sleep longer when the drain is dry.', buy: 'Small vertical float switch.' },
  { id: 'holder', group: 'Probe guard', name: 'Probe holder (3D printed)', qty: 1, usd: 1, print: 'probe_holder.stl',
    job: 'Plug for the top of the guard tube. Holds the three probes at fixed spacing and takes the tether.', buy: 'Print in PETG; measure your probes and adjust the holes in build_parts.py first.' },
  { id: 'tube', group: 'Probe guard', name: 'Perforated guard tube, 1½" PVC', qty: 1, usd: 8, job: 'Lets water flow past the probes while keeping out leaves, gravel and road grit. Drill 8 mm holes all over.', buy: '250 mm of schedule 40 PVC pipe.' },
  { id: 'cap', group: 'Probe guard', name: 'PVC end cap, drilled', qty: 1, usd: 2, job: 'Closes the bottom of the guard tube; small holes let silt drain out.', buy: '1½" PVC cap.' },
  { id: 'cables', group: 'Probe guard', name: 'Probe cables', qty: 3, usd: 0, job: 'Run from the probes up through the glands. Extension cable if the drain is deep.', buy: 'Come with the probes.' },
  { id: 'tether', group: 'Mounting', name: 'Stainless tether cable', qty: 1, usd: 6, job: 'Carries the guard tube\'s weight so the probe cables are never pulled.', buy: '1.5 mm stainless wire rope, 2 crimp sleeves.' },
  { id: 'bracket', group: 'Mounting', name: 'Stainless wall bracket + anchors', qty: 1, usd: 12, job: 'Holds the box on the inside wall of the catch basin, just below the grate, out of the water.', buy: 'Bent stainless strap, two M8 concrete anchors, two M5 bolts.' },
];
export const PRINTS = PARTS.filter(p => p.print);

/* ---------- materials ---------- */
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.6, metalness: o.m ?? 0, ...o.extra });
const MAT = {
  print: M(0x8b9399, { r: 0.75 }), lid: M(0x9aa2a8, { r: 0.75 }), pcb: M(0x1d6b46, { r: 0.5 }), pcbBlue: M(0x1f4f8f, { r: 0.5 }), pcbBlack: M(0x202326, { r: 0.5 }),
  chip: M(0x1a1a1a, { r: 0.4 }), shield: M(0xc9ccd0, { r: 0.25, m: 0.9 }), steel: M(0xb8bcc0, { r: 0.3, m: 0.85 }), brass: M(0xc8a24a, { r: 0.35, m: 0.8 }),
  black: M(0x1c1c1c, { r: 0.55 }), white: M(0xeeeeea, { r: 0.6 }), cellBlue: M(0x2d5fa8, { r: 0.4 }), cellRed: M(0xb03a2e, { r: 0.4 }), foam: M(0x2a2a2a, { r: 0.95 }),
  pvc: null, cap: M(0xdedfdc, { r: 0.55 }), wireR: M(0xc0392b), wireB: M(0x222222), wireY: M(0xd4a017), wireG: M(0x2e8b57), gold: M(0xd8b04c, { r: 0.3, m: 0.9 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x9c9890, roughness: 1, transparent: true, opacity: 0.14, depthWrite: false }),
  iron: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8, metalness: 0.3, transparent: true, opacity: 0.55, depthWrite: false }),
  water: new THREE.MeshStandardMaterial({ color: 0x4a7fa8, roughness: 0.2, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
};
function perforated() {   // PVC with drilled holes: a repeating alpha texture
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); g.globalCompositeOperation = 'destination-out';
  for (const [x, y] of [[32, 32], [96, 96]]) { g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 8); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.55, alphaMap: t, alphaTest: 0.5, side: THREE.DoubleSide, transparent: false });
}

/* ---------- small builders ---------- */
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cylY = (r, h, mat, x = 0, y = 0, z = 0, seg = 32, r2 = r) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), mat); m.position.set(x, y, z); return m; };
const cylX = (r, h, mat, x = 0, y = 0, z = 0) => { const m = cylY(r, h, mat, x, y, z); m.rotation.z = Math.PI / 2; return m; };
const hex = (r, h, mat, x, y, z) => cylY(r, h, mat, x, y, z, 6);
function wire(points, r, mat) { const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))); return new THREE.Mesh(new THREE.TubeGeometry(curve, 64, r, 8, false), mat); }
function board(w, d, mat, x, y, z, extras = []) {   // a module: PCB plate + parts on top, lying flat
  const g = new THREE.Group(); g.add(box(w, 1.6, d, mat, 0, 0, 0)); extras.forEach(e => g.add(e)); g.position.set(x, y, z); return g;
}
function pins(n, x0, z, y = 1.6, pitch = 2.54) { const g = new THREE.Group(); for (let i = 0; i < n; i++) g.add(box(0.8, 3, 0.8, MAT.gold, x0 + i * pitch, y + 1.5, z)); return g; }

/* ---------- the model ---------- */
/* The printable parts ship as base64 in device/stl-data.js (made by device/build_parts.py). */
const stlBytes = name => { const b = atob(STL[name]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
export const stlBlob = name => new Blob([stlBytes(name)], { type: 'model/stl' });
function loadSTL(name) { const geo = new STLLoader().parse(stlBytes(name).buffer); geo.computeVertexNormals(); return geo; }

export async function mountDevice(host, opts = {}) {
  const W = () => Math.max(280, host.clientWidth), H = () => Math.max(320, Math.min(640, Math.round(host.clientWidth * 0.68)));
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(W(), H()); renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement); renderer.domElement.style.display = 'block'; renderer.domElement.style.width = '100%'; renderer.domElement.style.height = 'auto';
  renderer.domElement.setAttribute('aria-label', '3D model of the Saltback drain node. Drag to turn, scroll or pinch to zoom.');
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a80, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(400, 700, 600); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(-500, 200, -300); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(35, W() / H(), 5, 8000);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.screenSpacePanning = true;

  const root = new THREE.Group(); scene.add(root);
  const parts = {};   // id -> Group, each with .userData.home and .userData.explode
  const part = (id, explode = [0, 0, 0]) => { const g = new THREE.Group(); g.userData = { partId: id, explode: new THREE.Vector3(...explode) }; root.add(g); parts[id] = g; return g; };

  const [bodyGeo, lidGeo, holderGeo] = ['enclosure_body.stl', 'enclosure_lid.stl', 'probe_holder.stl'].map(loadSTL);
  // STL is Z-up (print orientation); the scene is Y-up. Box: floor at y = 0, front of the box toward +z.
  const BOX_H = 70;
  { const m = new THREE.Mesh(bodyGeo, MAT.print.clone()); m.rotation.x = -Math.PI / 2; part('body').add(m); }
  { const m = new THREE.Mesh(lidGeo, MAT.lid.clone()); m.rotation.x = Math.PI / 2; m.position.y = BOX_H + 4; part('lid', [0, 110, 0]).add(m); }
  { const g = part('gasket', [0, 70, 0]); const s = new THREE.Shape(), r = 8, w = 147, d = 97;
    s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r); s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    s.lineTo(-w / 2 + r, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const hole = new THREE.Path(), w2 = w - 6, d2 = d - 6, r2 = 5;
    hole.moveTo(-w2 / 2 + r2, -d2 / 2); hole.lineTo(w2 / 2 - r2, -d2 / 2); hole.quadraticCurveTo(w2 / 2, -d2 / 2, w2 / 2, -d2 / 2 + r2); hole.lineTo(w2 / 2, d2 / 2 - r2); hole.quadraticCurveTo(w2 / 2, d2 / 2, w2 / 2 - r2, d2 / 2);
    hole.lineTo(-w2 / 2 + r2, d2 / 2); hole.quadraticCurveTo(-w2 / 2, d2 / 2, -w2 / 2, d2 / 2 - r2); hole.lineTo(-w2 / 2, -d2 / 2 + r2); hole.quadraticCurveTo(-w2 / 2, -d2 / 2, -w2 / 2 + r2, -d2 / 2);
    s.holes.push(hole); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 1.5, bevelEnabled: false }), MAT.foam); m.rotation.x = -Math.PI / 2; m.position.y = BOX_H; g.add(m); }

  // Cable glands in the floor (STL y = 30 -> scene z = -30)
  const GL = [-35, 0, 35], GZ = -30;
  { const g = part('glands', [0, -45, 0]);
    GL.forEach(x => { g.add(hex(9.5, 6, MAT.black, x, 6, GZ)); g.add(hex(9.5, 5, MAT.black, x, -2.5, GZ)); g.add(cylY(7, 10, MAT.black, x, -10, GZ, 24, 4.5)); }); }
  { const g = part('desiccant', [-40, 60, 60]); g.add(box(42, 6, 30, MAT.white, -48, 6, -26)); }
  // Battery: 3 x 18650 in a holder on the floor, toward the front
  { const g = part('battery', [0, 40, 110]); g.add(box(72, 6, 62, MAT.pcbBlack, 0, 6, 16));
    [-3, 16, 35].forEach((z, i) => { g.add(cylX(9.3, 65, MAT.cellBlue, 0, 18.3, z)); g.add(cylX(4, 2, MAT.steel, 33.5, 18.3, z)); });
    g.add(box(20, 0.5, 40, MAT.white, -5, 27.7, 16)); }
  // Carrier board on standoffs, modules on top
  const CY = 40;
  { const g = part('carrier', [0, 60, 0]);
    g.add(box(132, 1.6, 82, M(0xb5893f, { r: 0.6 }), 0, CY, 0));
    [[-60, -35], [60, -35], [-60, 35], [60, 35]].forEach(([x, z]) => g.add(hex(3, CY - 3, MAT.brass, x, (CY + 3) / 2 - 0.8, z)));
    g.add(wire([[-12, CY + 2, 18], [0, CY + 6, 0], [20, CY + 2, -18]], 0.7, MAT.wireR)); g.add(wire([[-12, CY + 2, 20], [5, CY + 5, 4], [25, CY + 2, -16]], 0.7, MAT.wireB));
    g.add(wire([[-30, CY + 2, -8], [-25, CY + 5, -14], [-20, CY + 2, -20]], 0.7, MAT.wireY));
    g.add(box(4, 2.2, 1.6, M(0xc7b48b), 5, CY + 1.9, 30));   // 4.7 kOhm pull-up
    g.add(wire([[10, CY, -40], [20, 20, -38], [36, 6, GZ]], 0.9, MAT.wireR)); }
  { const g = part('mcu', [0, 95, 0]); g.position.set(-35, CY + 1.6, 10);
    g.add(box(52, 1.6, 28, MAT.pcbBlack, 0, 0.8, 0)); g.add(box(18, 3, 25.5, MAT.shield, 13, 3.1, 0)); g.add(box(6, 0.4, 18, MAT.gold, 23.5, 1.8, 0));
    g.add(box(8, 3, 6, MAT.steel, -24, 3, 0)); g.add(pins(19, -23, -12.7)); g.add(pins(19, -23, 12.7)); }
  { const g = part('ecboard', [0, 95, 0]); g.position.set(15, CY + 1.6, 20); g.add(box(42, 1.6, 32, MAT.pcbBlue, 0, 0.8, 0)); g.add(box(10, 2, 10, MAT.chip, -6, 2.6, 0));
    g.add(box(9, 7, 9, MAT.gold, 15, 5, 8)); g.add(box(8, 6, 6, MAT.white, -17, 4.6, -10)); }
  { const g = part('modem', [40, 95, -20]); g.position.set(40, CY + 1.6, -20); g.add(box(45, 1.6, 30, MAT.pcbBlack, 0, 0.8, 0)); g.add(box(17, 2.4, 15.5, MAT.shield, -6, 2.8, 0));
    g.add(box(15, 1.5, 13, MAT.steel, 13, 2.4, 3)); g.add(box(12, 0.4, 10, MAT.gold, 13, 3.3, 3));
    g.add(wire([[-20, 3, -10], [-30, 30, -20], [-10, 34 - 2, -10]].map(([x, y, z]) => [x, y, z]), 0.6, MAT.black)); }
  { const g = part('rtc', [-30, 95, -10]); g.position.set(-45, CY + 1.6, -24); g.add(box(38, 1.6, 22, MAT.pcbBlue, 0, 0.8, 0)); g.add(box(8, 2, 10, MAT.chip, -4, 2.6, 0)); g.add(cylY(10, 3.2, MAT.steel, 8, 3.2, 0)); }
  { const g = part('sd', [0, 95, -20]); g.position.set(-3, CY + 1.6, -26); g.add(box(42, 1.6, 24, MAT.pcbBlue, 0, 0.8, 0)); g.add(box(16, 2.2, 15, MAT.steel, 8, 2.7, 0)); g.add(box(11, 0.8, 15, MAT.black, 2, 3.2, 0)); }
  { const g = part('antenna', [0, 170, 0]); g.add(box(90, 0.8, 22, MAT.black, 10, BOX_H + 4.4, 10)); g.add(box(70, 0.2, 14, MAT.gold, 10, BOX_H + 4.9, 10)); }

  // Probe guard hanging below the box
  const TUBE_TOP = -250, TUBE_LEN = 250;
  if (!MAT.pvc) MAT.pvc = perforated();
  { const g = part('tube', [0, -90, 0]); const t = new THREE.Mesh(new THREE.CylinderGeometry(24.1, 24.1, TUBE_LEN, 48, 1, true), MAT.pvc); t.position.y = TUBE_TOP - TUBE_LEN / 2; g.add(t);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(20.5, 20.5, TUBE_LEN, 48, 1, true), MAT.pvc); inner.position.y = t.position.y; g.add(inner);
    const rim = new THREE.Mesh(new THREE.RingGeometry(20.5, 24.1, 48), MAT.cap); rim.rotation.x = -Math.PI / 2; rim.position.y = TUBE_TOP; g.add(rim); }
  { const g = part('cap', [0, -150, 0]); g.add(cylY(26.5, 28, MAT.cap, 0, TUBE_TOP - TUBE_LEN - 8, 0)); }
  { const g = part('holder', [0, 70, 0]); const m = new THREE.Mesh(holderGeo, MAT.print.clone()); m.rotation.x = -Math.PI / 2; m.position.y = TUBE_TOP - 15; g.add(m); }
  // Probes, at the probe holder's hole positions (STL x, y -> scene x, -y)
  const P1 = [-9.5, 4], P2 = [9.5, 4], PT = [0, -11];
  { const g = part('ec1', [-70, 70, 0]); const [x, z] = P1;
    g.add(cylY(6, 150, MAT.black, x, TUBE_TOP - 55, z)); g.add(cylY(5.6, 22, MAT.white, x, TUBE_TOP - 141, z)); g.add(box(1.4, 14, 12, MAT.black, x, TUBE_TOP - 142, z)); }
  { const g = part('ec10', [70, 70, 0]); const [x, z] = P2;
    g.add(cylY(6, 150, M(0x4b5563), x, TUBE_TOP - 55, z)); g.add(cylY(6.2, 6, MAT.cellRed, x, TUBE_TOP - 40, z)); g.add(cylY(5.6, 22, MAT.white, x, TUBE_TOP - 141, z)); g.add(box(12, 14, 1.4, MAT.black, x, TUBE_TOP - 142, z)); }
  { const g = part('temp', [0, 70, 70]); const [x, z] = PT; g.add(cylY(3, 50, MAT.steel, x, TUBE_TOP - 70, z)); g.add(cylY(2.6, 30, MAT.black, x, TUBE_TOP - 30, z)); }
  { const g = part('float', [80, -40, 40]); g.add(cylY(1.5, 40, MAT.steel, 27, TUBE_TOP - 190, 0)); g.add(cylY(8, 14, MAT.white, 27, TUBE_TOP - 200, 0)); g.add(box(8, 8, 6, MAT.black, 27, TUBE_TOP - 168, 0)); }
  { const g = part('cables', [0, 0, 0]);
    const mk = (x0, xs, zs, mat) => wire([[x0, -14, GZ], [x0 * 0.9, -80, GZ + 10], [xs * 1.5, -170, zs * 2], [xs, TUBE_TOP + 22, zs], [xs, TUBE_TOP + 15, zs]], 2.4, mat);
    g.add(mk(GL[0], P1[0], P1[1], MAT.black)); g.add(mk(GL[1], PT[0], PT[1], MAT.black)); g.add(mk(GL[2], P2[0], P2[1], M(0x4b5563))); }
  // Bracket on the basin wall behind the box: two straps, a cross bar, anchors and bolts through the box tabs
  const TABX = 75 - 1 + 9, TABY = BOX_H - 6 - 15, WALLZ = -53;
  { const g = part('bracket', [0, 0, -90]);
    [-1, 1].forEach(s => { g.add(box(24, 150, 3, MAT.steel, s * TABX, TABY + 50, WALLZ + 1.5)); g.add(hex(5, 4, MAT.steel, s * TABX, TABY, -43).rotateX(Math.PI / 2)); g.add(cylY(2.5, 16, MAT.steel, s * TABX, TABY, -50).rotateX(Math.PI / 2)); });
    g.add(box(2 * TABX + 24, 26, 3, MAT.steel, 0, TABY + 112, WALLZ + 1.5));
    [-55, 55].forEach(x => { g.add(hex(7, 6, MAT.steel, x, TABY + 112, WALLZ + 6).rotateX(Math.PI / 2)); }); }
  { const g = part('tether', [0, 0, 0]); g.add(wire([[0, TUBE_TOP + 3, 14.5], [40, -120, 0], [TABX + 10, -20, -40], [TABX, TABY + 30, WALLZ + 4]], 0.9, MAT.steel)); }

  // Context: catch basin (not part of the node)
  const ctx = new THREE.Group(); scene.add(ctx);
  ctx.add(box(760, 900, 10, MAT.concrete, 0, -260, -58));                                 // back wall
  ctx.add(box(10, 900, 520, MAT.concrete, -380, -260, 200)); ctx.add(box(10, 900, 520, MAT.concrete, 380, -260, 200));
  { const grate = new THREE.Group(); for (let i = -6; i <= 6; i++) grate.add(box(16, 30, 560, MAT.iron, i * 46, 205, 220)); grate.add(box(600, 30, 16, MAT.iron, 0, 205, -52)); grate.add(box(600, 30, 16, MAT.iron, 0, 205, 492)); ctx.add(grate); }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(750, 510), MAT.water); water.rotation.x = -Math.PI / 2; water.position.set(0, -430, 200); ctx.add(water);
  ctx.add(cylX(150, 120, MAT.concrete, 330, -560, 200));                                     // outlet pipe stub

  // Remember each part's home position for the exploded view
  Object.values(parts).forEach(g => { g.userData.home = g.position.clone(); });

  /* ---------- views, selection, explode, see-through ---------- */
  const VIEWS = { all: { t: [0, -150, 0], p: [560, 120, 860] }, box: { t: [0, 40, 0], p: [300, 70, 360] }, probes: { t: [0, -380, 0], p: [240, -300, 330] } };
  let view = 'all', animT = 1, from = null;
  const setView = v => { view = v; from = { t: controls.target.clone(), p: camera.position.clone() }; animT = 0; };
  controls.target.set(...VIEWS.all.t); camera.position.set(...VIEWS.all.p);

  let explodeTarget = 0, explode = 0, selected = null;
  const highlight = (id, on) => { const g = parts[id]; if (!g) return; g.traverse(o => { if (o.isMesh && o.material && 'emissive' in o.material) {
    if (on && !o.userData.ownMat) { o.userData.ownMat = o.material; o.material = o.material.clone(); o.material.emissive = new THREE.Color(0xff7a1a); o.material.emissiveIntensity = 0.55; }
    else if (!on && o.userData.ownMat) { o.material.dispose(); o.material = o.userData.ownMat; delete o.userData.ownMat; } } }); };
  function select(id, fromScene) { if (selected) highlight(selected, false); selected = id && id !== selected ? id : (fromScene ? null : id); if (selected) highlight(selected, true); opts.onSelect && opts.onSelect(selected); }
  function setSeeThrough(on) { [parts.body, parts.lid].forEach(g => g.traverse(o => { if (o.isMesh) { const m = o.userData.ownMat || o.material; m.transparent = on; m.opacity = on ? 0.28 : 1; m.depthWrite = !on; m.needsUpdate = true;
    if (o.userData.ownMat) { o.material.transparent = on; o.material.opacity = m.opacity; o.material.depthWrite = !on; o.material.needsUpdate = true; } } })); }
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ptr, camera); const hit = ray.intersectObjects(root.children, true).find(h => h.object.visible && !(h.object.material && h.object.material.opacity < 0.5));
    let o = hit && hit.object; while (o && !o.userData.partId) o = o.parent; select(o ? o.userData.partId : null, true); });

  const clock = new THREE.Clock(); let alive = true, ctxWanted = true;
  function frame() {
    if (!alive) return; requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    if (Math.abs(explode - explodeTarget) > 1e-3) { explode += (explodeTarget - explode) * Math.min(1, dt * 6); Object.values(parts).forEach(g => g.position.copy(g.userData.home).addScaledVector(g.userData.explode, explode));
      parts.cables.visible = parts.tether.visible = explode < 0.3; }
    if (animT < 1 && from) { animT = Math.min(1, animT + dt * 1.8); const k = 1 - (1 - animT) ** 3, v = VIEWS[view];
      controls.target.lerpVectors(from.t, new THREE.Vector3(...v.t), k); camera.position.lerpVectors(from.p, new THREE.Vector3(...v.p), k); }
    controls.update(); renderer.render(scene, camera);
  }
  frame();
  const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); }); ro.observe(host);

  return {
    parts: PARTS, select: id => select(id, false), setView,
    setExplode: on => { explodeTarget = on ? 1 : 0; ctx.visible = !on && ctxWanted; }, setSeeThrough, setContext: on => { ctxWanted = on; ctx.visible = on && explodeTarget === 0; },
    async exportGLB() { const was = ctx.visible; ctx.visible = false; const res = await new GLTFExporter().parseAsync(root, { binary: true }); ctx.visible = was; return new Blob([res], { type: 'model/gltf-binary' }); },
    dispose() { alive = false; ro.disconnect(); renderer.dispose(); host.innerHTML = ''; },
  };
}
