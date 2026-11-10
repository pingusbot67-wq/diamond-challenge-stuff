"""Build the 3D-printable parts of the Saltback drain node as STL files (millimetres, Z up, print orientation).

    pip install manifold3d numpy
    python device/build_parts.py          (run from the saltback folder)

Writes web/device/enclosure_body.stl, enclosure_lid.stl and probe_holder.stl. The website's Device page loads the
same files, so the 3D model and the printable parts always match. Change the sizes below to fit the parts you buy
(measure your probes with calipers before printing the probe holder).

Print in PETG or ASA (not PLA: it softens in summer sun and creeps under the lid screws). 3 walls, 25% infill.
"""
from pathlib import Path
import struct

import numpy as np
from manifold3d import Manifold

OUT = Path(__file__).resolve().parent.parent / "web" / "device"

# ---- sizes (mm) ----
BOX_W, BOX_D, BOX_H, BOX_R = 150, 100, 70, 8   # outside of the electronics box
WALL, FLOOR = 3, 3
GLAND_HOLE = 12.5                              # PG7 cable gland
GLAND_X = (-35, 0, 35)                         # three glands in the floor: EC probe, high-range EC probe, temperature probe
GLAND_Y = 30                                   # toward the back wall, leaving the front of the floor for the battery
BOSS_R, SCREW_HOLE = 4, 1.4                    # M3 self-tapping screws into the corner bosses
LID_T, LID_SCREW = 4, 1.7                      # lid plate thickness, M3 clearance radius
LIP_H, LIP_T = 6, 1.6                          # lip that keeps the lid aligned and presses the foam gasket
EAR_W, EAR_T, EAR_H, EAR_HOLE = 18, 5, 30, 2.75  # side mounting tabs for the stainless bracket (M5 bolts)
PVC_ID = 40.5                                  # inside of 1-1/2" schedule 40 PVC pipe (about 40.9 mm)
PROBE_HOLE = 6.3                               # radius: 12.6 mm hole for each conductivity probe
TEMP_HOLE = 3.3                                # radius: 6.6 mm hole for the DS18B20 probe
SEG = 72


def rbox(w, d, h, r, z=0.0):
    """Box with rounded vertical edges, centred in X and Y, from z to z+h."""
    r = max(0.5, r)
    c = Manifold.cylinder(h, r, r, SEG)
    pts = [c.translate([sx * (w / 2 - r), sy * (d / 2 - r), z]) for sx in (-1, 1) for sy in (-1, 1)]
    return Manifold.batch_hull(pts)


def cyl(h, r, x=0.0, y=0.0, z=0.0):
    return Manifold.cylinder(h, r, r, SEG).translate([x, y, z])


def corners(inset):
    return [(sx * (BOX_W / 2 - inset), sy * (BOX_D / 2 - inset)) for sx in (-1, 1) for sy in (-1, 1)]


def enclosure_body():
    body = rbox(BOX_W, BOX_D, BOX_H, BOX_R) - rbox(BOX_W - 2 * WALL, BOX_D - 2 * WALL, BOX_H, BOX_R - WALL, FLOOR)
    for x, y in corners(BOSS_R + WALL + 1):
        body += cyl(BOX_H - FLOOR, BOSS_R, x, y, FLOOR)
        body -= cyl(16, SCREW_HOLE, x, y, BOX_H - 15)
    for x in GLAND_X:
        body -= cyl(FLOOR + 2, GLAND_HOLE / 2, x, GLAND_Y, -1)
    for sx in (-1, 1):   # mounting tabs, flush with the back face, holes front-to-back
        ear = Manifold.cube([EAR_W, EAR_T, EAR_H]).translate([0 if sx > 0 else -EAR_W, 0, 0])
        ear = ear.translate([sx * (BOX_W / 2 - 1), BOX_D / 2 - EAR_T, BOX_H - EAR_H - 6])
        hole = Manifold.cylinder(EAR_T + 2, EAR_HOLE, EAR_HOLE, SEG).rotate([-90, 0, 0])
        hole = hole.translate([sx * (BOX_W / 2 + EAR_W / 2), BOX_D / 2 - EAR_T - 1, BOX_H - EAR_H / 2 - 6])
        body = body + ear - hole
    return body


def enclosure_lid():
    """Printed plate-down: the plate is z 0..LID_T and the lip points up (it faces into the box when fitted)."""
    lid = rbox(BOX_W, BOX_D, LID_T, BOX_R)
    o = WALL + 0.3   # 0.3 mm clearance inside the walls
    lip = rbox(BOX_W - 2 * o, BOX_D - 2 * o, LIP_H, BOX_R - o, LID_T) - rbox(BOX_W - 2 * (o + LIP_T), BOX_D - 2 * (o + LIP_T), LIP_H, BOX_R - o - LIP_T, LID_T)
    for x, y in corners(BOSS_R + WALL + 1):
        lip -= cyl(LIP_H + 1, BOSS_R + 0.6, x, y, LID_T)
        lid -= cyl(LID_T + 2, LID_SCREW, x, y, -1)
    return lid + lip


def probe_holder():
    """Plug for the top of the PVC guard tube: holds both conductivity probes and the temperature probe."""
    part = cyl(15, PVC_ID / 2) + cyl(3, PVC_ID / 2 + 4, z=15)
    for x, y, r in ((-9.5, -4, PROBE_HOLE), (9.5, -4, PROBE_HOLE), (0, 11, TEMP_HOLE), (0, -14.5, 2.0)):
        part -= cyl(20, r, x, y, -1)
    return part


def write_stl(m, path):
    mesh = m.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3].astype(np.float32)
    t = np.asarray(mesh.tri_verts)
    a, b, c = v[t[:, 0]], v[t[:, 1]], v[t[:, 2]]
    n = np.cross(b - a, c - a)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    rec = np.zeros(len(t), dtype=[("n", "<f4", 3), ("a", "<f4", 3), ("b", "<f4", 3), ("c", "<f4", 3), ("attr", "<u2")])
    rec["n"], rec["a"], rec["b"], rec["c"] = n, a, b, c
    with open(path, "wb") as f:
        f.write(b"Saltback drain node part, mm".ljust(80, b" "))
        f.write(struct.pack("<I", len(t)))
        f.write(rec.tobytes())
    lo, hi = v.min(0), v.max(0)
    print(f"{path.name:22s} {len(t):6d} triangles  {hi[0]-lo[0]:.0f} x {hi[1]-lo[1]:.0f} x {hi[2]-lo[2]:.0f} mm  "
          f"volume {m.volume()/1000:.0f} cm3  genus {m.genus()}")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("enclosure_body", enclosure_body), ("enclosure_lid", enclosure_lid), ("probe_holder", probe_holder)):
        part = fn()
        assert not part.is_empty(), name
        write_stl(part, OUT / f"{name}.stl")
