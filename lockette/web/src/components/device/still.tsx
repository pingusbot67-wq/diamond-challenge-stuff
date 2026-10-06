"use client";

import { useEffect, useRef, useState } from "react";
import { POSES } from "./pose";
import type { DeviceScene } from "./scene";

/**
 * Renders one pose on a see-through background, so `scripts/stills.py` can
 * save the pictures shown when 3D is off (no WebGL, or reduced motion).
 */
export function Still() {
  const host = useRef<HTMLDivElement | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const which = new URLSearchParams(location.search).get("pose") === "exploded" ? "exploded" : "hero";
    let scene: DeviceScene | null = null;
    import("./scene").then(({ createDeviceScene }) => {
      if (!host.current) return;
      const pose = { ...POSES[which], x: 0, y: 0, float: 0, scale: which === "exploded" ? 0.9 : 1.15 };
      scene = createDeviceScene(host.current, { theme: "paper", pose, transparent: true, camera: 4.4 });
      window.setTimeout(() => setDone(true), 1500);
    });
    return () => scene?.dispose();
  }, []);
  return <div ref={host} data-done={done ? "1" : "0"} style={{ position: "relative", width: 900, height: 900 }} />;
}
