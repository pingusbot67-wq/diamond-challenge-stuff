"""Saves the still pictures used when 3D is off (no WebGL, or reduced motion).

Serve the built site first (e.g. LOCKETTE_FAKE_AUDIO=1 LOCKETTE_PORT=8765 python app.py), then:
    python scripts/stills.py http://127.0.0.1:8765
Needs: pip install playwright pillow  (and a Chromium for Playwright)
"""
import io
import os
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
out = Path(__file__).resolve().parent.parent / "public" / "stills"
out.mkdir(parents=True, exist_ok=True)
chrome = os.environ.get("CHROME")

with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=chrome or None,
        args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    )
    page = b.new_page(viewport={"width": 900, "height": 900}, device_scale_factor=1)
    for pose in ("hero", "exploded"):
        page.goto(f"{base}/still/?pose={pose}")
        page.wait_for_selector('[data-done="1"]', timeout=30000)
        png = page.locator("[data-done]").screenshot(omit_background=True)
        img = Image.open(io.BytesIO(png)).convert("RGBA")
        img.save(out / f"{pose}.webp", "WEBP", quality=88, method=6)
        print("saved", out / f"{pose}.webp", img.size)
    b.close()
