"""Re-open every exported file and check it the way another program would.

    python device/cad/check_exports.py            (after saltback_node.py; run from the saltback folder)

STEP: re-imported with OpenCASCADE (the kernel FreeCAD and many CAE tools use); every solid must be valid and closed,
      with the same volume as the model.
STL:  loaded with trimesh; every part must be watertight (no holes), consistently wound and have positive volume,
      which slicers and meshing tools for simulation need.
GLB:  checked separately with the Khronos glTF validator (see README); this script checks the node names.
"""
import json
import struct
import sys
from pathlib import Path

import cadquery as cq
import trimesh

OUT = Path(__file__).resolve().parents[1] / "out"
meta = json.loads((OUT / "parts.json").read_text())
bad = 0
print(f"{'part':8s} {'STEP':>6s} {'solids':>6s} {'cm3':>8s} | {'STL':>4s} {'tris':>7s} {'watertight':>10s} {'cm3':>8s}")
for p in meta["parts"]:
    stem = Path(p["files"]["step"]).stem
    shp = cq.importers.importStep(str(OUT / "step" / f"{stem}.step")).val()
    solids = shp.Solids()
    ok_step = shp.isValid() and all(s.isValid() for s in solids) and solids
    vol = sum(s.Volume() for s in solids) / 1000
    m = trimesh.load(OUT / "stl" / f"{stem}.stl", force="mesh")
    ok_stl = m.is_watertight and m.is_winding_consistent and m.volume > 0
    vol_ok = abs(vol - p["volume_cm3"]) <= max(0.15, 0.01 * p["volume_cm3"]) and abs(m.volume / 1000 - vol) <= max(0.2, 0.03 * vol)
    bad += not (ok_step and ok_stl and vol_ok)
    print(f"{p['pn']:8s} {'ok' if ok_step else 'FAIL':>6s} {len(solids):6d} {vol:8.2f} | {'ok' if ok_stl else 'FAIL':>4s} {len(m.faces):7d} "
          f"{str(m.is_watertight):>10s} {m.volume / 1000:8.2f}{'' if vol_ok else '  VOLUME MISMATCH'}")
asm = cq.importers.importStep(str(OUT / "saltback-node.step")).val()
print(f"assembly STEP: {len(asm.Solids())} solids, valid={asm.isValid()}")
bad += not asm.isValid()
raw = (OUT / "saltback-node.glb").read_bytes()
magic, ver, length = struct.unpack("<4sII", raw[:12])
jlen = struct.unpack("<I", raw[12:16])[0]
gltf = json.loads(raw[20:20 + jlen])
names = sorted(n.get("name", "") for n in gltf["nodes"])
want = sorted(n for p in meta["parts"] for n in p["nodes"])
missing = [n for n in want if n not in names]
print(f"assembly GLB: glTF {ver}, {len(raw) / 1e6:.1f} MB, {len(gltf['meshes'])} meshes, {len(gltf['nodes'])} nodes, missing part nodes: {missing or 'none'}")
bad += bool(missing) or magic != b"glTF"
print("ALL CHECKS PASSED" if not bad else f"{bad} PROBLEMS")
sys.exit(1 if bad else 0)
