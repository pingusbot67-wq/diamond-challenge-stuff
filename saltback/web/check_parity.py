"""Confirm the website's JavaScript model (web/model.js) gives the same answers as model.py.

Run from the saltback folder:  python web/check_parity.py      (needs Node.js)
Sensor noise is switched off so both sides are exactly deterministic.
"""
import json, math, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import model

CASES = [{}, {"pavement_temp_F": 15, "snowfall_in": 8}, {"pavement_temp_F": 30, "first_pass_h": 1.5},
         {"pavement_temp_F": 5, "temp_after_F": 20, "salt_per_pass_lb": 300}, {"pavement_temp_F": 34},
         {"probe_max_mS_cm": 200, "use_temp_probe": False, "plow_every_h": 1}]
QUIET = {"probe_noise": 0, "temp_probe_error_C": 0}

JS = """
const S = require(process.argv[1]);
const cases = JSON.parse(process.argv[2]);
const out = cases.map(c => {
  const s = Object.assign({}, S.SETTINGS, c);
  const {rows, summary} = S.stormTimeline(s);
  const {needed} = S.findNeeded(s);
  return {summary, needed, card: S.stormCard(s, summary, needed), rows: rows.map(r => [r.bonded_ice_mm, r.brine_mm,
          r.cl_true_mg_L, r.reading_mS_cm, r.cl_measured_mg_L]),
          eq: [0, 150, 300, 450].map(d => S.equilibrium(s, d))};
});
console.log(JSON.stringify(out, (k, v) => (typeof v === 'number' && !isFinite(v)) ? String(v) : v));
"""


def close(a, b, tol=1e-6):
    a = float(a) if not isinstance(a, str) else float(a.replace("Infinity", "inf"))
    b = float(b) if not isinstance(b, str) else float(b.replace("Infinity", "inf"))
    if math.isnan(a) and math.isnan(b) or a == b:
        return True
    return abs(a - b) <= tol * max(1, abs(a), abs(b))


cases = [{**QUIET, **c} for c in CASES]
js = json.loads(subprocess.run(["node", "-e", JS, str(HERE / "model.js"), json.dumps(cases)],
                               capture_output=True, text=True, check=True).stdout)
bad = 0
for c, j in zip(cases, js):
    s = {**model.SETTINGS, **c}
    rows, sm = model.storm_timeline(s)
    need, _ = model.find_needed(s)
    card = model.storm_card(s, sm, need)
    checks = [(f"summary.{k}", v, j["summary"][k]) for k, v in sm.items()]
    checks += [("needed", need, j["needed"])] + [(f"card.{k}", v, j["card"][k]) for k, v in card.items() if k != "chloride_level"]
    checks.append(("card.chloride_level", 0, 0 if card["chloride_level"] == j["card"]["chloride_level"] else 1))
    for i, (r, jr) in enumerate(zip(rows, j["rows"])):
        for k, v in zip(["bonded_ice_mm", "brine_mm", "cl_true_mg_L", "reading_mS_cm", "cl_measured_mg_L"], jr):
            checks.append((f"row{i}.{k}", r[k], float("nan") if v is None or v == "NaN" else v))
    for d, e in zip([0, 150, 300, 450], j["eq"]):
        r = model.storm([d / model.LB_PER_LANE_MILE], s, __import__("numpy").random.default_rng(0))
        for k in ("salt_needed_lb_per_lane_mile", "ice_cleared_pct", "excess_pct"):
            checks.append((f"step1.{d}.{k}", r[k][0], e[k]))
    fails = [(n, a, b) for n, a, b in checks if not close(a, b)]
    bad += len(fails)
    print(f"{'OK  ' if not fails else 'FAIL'} {c}  ({len(checks)} numbers compared)")
    for f in fails[:5]:
        print("     ", f)
print("\nPython and JavaScript models agree." if not bad else f"\n{bad} mismatches.")
sys.exit(1 if bad else 0)
