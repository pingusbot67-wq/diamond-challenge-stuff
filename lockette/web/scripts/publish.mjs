// Copies the static build (out/) to ../site, which app.py (Pi) and hub.py (PC) serve.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "out");
const site = join(here, "..", "..", "site");
if (!existsSync(out)) throw new Error("No build output in web/out. Run `next build` first.");
rmSync(site, { recursive: true, force: true });
cpSync(out, site, { recursive: true });
console.log(`Published the site to ${site}`);
