"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePrefs } from "@/components/ui/prefs";
import { prefersReducedMotion } from "@/components/ui/motion";
import { cn } from "@/components/ui/reveal";
import type { DeviceScene } from "./scene";
import type { Pose } from "./pose";

/**
 * Loads three.js after the page has painted, and hands the scene to whatever
 * sits inside. Without WebGL, or with reduced motion, it shows a still
 * picture of the device instead, and every section keeps working.
 */

interface StageState {
  scene: DeviceScene | null;
  /** false = showing the still picture */
  live: boolean;
}
const Ctx = createContext<StageState>({ scene: null, live: false });
export const useStage = () => useContext(Ctx);

function webglWorks() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function DeviceStage({
  variant,
  pose,
  label = "Lockette, 3D view. Drag or use the arrow keys to turn it. Press Enter to press its button.",
  className,
  still = "/stills/hero.webp",
  shown = true,
  children,
}: {
  /** "site": fixed and full-screen behind the page; "box": fills its parent */
  variant: "site" | "box";
  pose?: Pose;
  label?: string;
  className?: string;
  still?: string;
  /** fade the device in (the site waits for its preloader) */
  shown?: boolean;
  children?: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<StageState>({ scene: null, live: true });
  const { theme } = usePrefs();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const poseRef = useRef(pose);
  poseRef.current = pose;

  useEffect(() => {
    if (!webglWorks() || prefersReducedMotion()) {
      setState({ scene: null, live: false });
      return;
    }
    let scene: DeviceScene | null = null;
    let cancelled = false;
    import("./scene")
      .then(({ createDeviceScene }) => {
        if (cancelled || !hostRef.current) return;
        scene = createDeviceScene(hostRef.current, {
          theme: themeRef.current,
          handle: handleRef.current,
          pose: poseRef.current,
          camera: variant === "box" ? 3.1 : 4.4,
        });
        setState({ scene, live: true });
      })
      .catch((e) => {
        console.warn("3D view unavailable", e);
        if (!cancelled) setState({ scene: null, live: false });
      });
    return () => {
      cancelled = true;
      scene?.dispose();
    };
  }, [variant]);

  useEffect(() => {
    state.scene?.setTheme(theme);
  }, [theme, state.scene]);

  useEffect(() => {
    if (pose) state.scene?.setPose(pose);
  }, [pose, state.scene]);

  const site = variant === "site";
  return (
    <Ctx.Provider value={state}>
      <div
        ref={hostRef}
        className={cn(site ? "fixed inset-0 z-0" : "absolute inset-0", "transition-opacity duration-[1200ms]", className)}
        style={{ opacity: shown ? 1 : 0 }}
      >
        {!state.live && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={still}
            alt="Lockette: a small rounded square in porcelain white, with one big round button ringed by a soft light."
            className={cn(
              "absolute object-contain",
              site ? "top-1/2 left-1/2 h-[52vh] w-[52vh] -translate-x-1/2 -translate-y-1/2" : "inset-0 h-full w-full p-4",
            )}
          />
        )}
      </div>
      {state.live && (
        <div
          ref={handleRef}
          role="img"
          tabIndex={0}
          aria-label={label}
          className="fixed z-20 touch-pan-y"
          style={{ visibility: "hidden", left: 0, top: 0, width: 0, height: 0, cursor: "grab" }}
        />
      )}
      {children}
    </Ctx.Provider>
  );
}
