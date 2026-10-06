import type { LedState } from "./device";

/**
 * Where the device is and what it's doing. Positions are fractions of the
 * screen (-1..1 across half the width / height), so poses work at any size.
 */
export interface Pose {
  x: number;
  y: number;
  scale: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** 0 assembled, 1 fully apart */
  explode: number;
  led: LedState;
  /** 0..1, how much it hangs on its cord (footer) */
  cord: number;
  /** 0..1, how much it bobs and sways on its own */
  float: number;
  /** radians a second it turns by itself (showcase) */
  spin: number;
}

const D = Math.PI / 180;

export const POSES = {
  hero: { x: 0, y: 0.02, scale: 1, yaw: -28 * D, pitch: 12 * D, roll: 4 * D, explode: 0, led: "idle", cord: 0, float: 1, spin: 0 },
  side: { x: 0.42, y: 0.02, scale: 1.05, yaw: -90 * D, pitch: 4 * D, roll: 0, explode: 0, led: "idle", cord: 0, float: 0.35, spin: 0 },
  exploded: { x: -0.12, y: 0, scale: 0.92, yaw: -42 * D, pitch: 20 * D, roll: 0, explode: 1, led: "idle", cord: 0, float: 0.2, spin: 0 },
  assembled3q: { x: -0.12, y: 0, scale: 0.92, yaw: -42 * D, pitch: 20 * D, roll: 0, explode: 0, led: "idle", cord: 0, float: 0.2, spin: 0 },
  aside: { x: 0.78, y: 0.55, scale: 0.42, yaw: -20 * D, pitch: 8 * D, roll: 0, explode: 0, led: "idle", cord: 0, float: 0.6, spin: 0 },
  showcase: { x: 0, y: 0, scale: 1.45, yaw: 0, pitch: 8 * D, roll: 0, explode: 0, led: "allgood", cord: 0, float: 0.6, spin: 0.35 },
  hanging: { x: 0.55, y: 0.46, scale: 0.55, yaw: -12 * D, pitch: 4 * D, roll: 0, explode: 0, led: "idle", cord: 1, float: 0, spin: 0 },
} satisfies Record<string, Pose>;

/** One feature step: the device on the left half, in its own pose and light. */
export function featurePose(i: number, led: LedState): Pose {
  const yaws = [-18, 24, -38, 12, -8];
  const pitches = [10, 4, 16, -4, 8];
  return {
    x: -0.5,
    y: 0,
    scale: 0.95,
    yaw: yaws[i % 5] * D,
    pitch: pitches[i % 5] * D,
    roll: (i % 2 ? -3 : 3) * D,
    explode: 0,
    led,
    cord: 0,
    float: 0.5,
    spin: 0,
  };
}

export function mixNumber(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Blend two poses (rotations are blended by the scene with a slerp). */
export function mixPose(a: Pose, b: Pose, t: number): Pose {
  return {
    x: mixNumber(a.x, b.x, t),
    y: mixNumber(a.y, b.y, t),
    scale: mixNumber(a.scale, b.scale, t),
    yaw: mixNumber(a.yaw, b.yaw, t),
    pitch: mixNumber(a.pitch, b.pitch, t),
    roll: mixNumber(a.roll, b.roll, t),
    explode: mixNumber(a.explode, b.explode, t),
    led: t < 0.5 ? a.led : b.led,
    cord: mixNumber(a.cord, b.cord, t),
    float: mixNumber(a.float, b.float, t),
    spin: mixNumber(a.spin, b.spin, t),
  };
}
