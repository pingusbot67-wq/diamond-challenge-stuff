"use client";

import Link from "next/link";
import { DeviceStage } from "@/components/device/stage";
import type { Pose } from "@/components/device/pose";
import { CornerControls, CornerName, DevGrid, SplitButton, useGridToggle } from "@/components/ui/chrome";
import { GooText } from "@/components/ui/goo-text";

const D = Math.PI / 180;
const CORNER_POSE: Pose = {
  x: 0,
  y: 0,
  scale: 0.95,
  yaw: 30 * D,
  pitch: 12 * D,
  roll: -4 * D,
  explode: 0,
  led: "idle",
  cord: 0,
  float: 1,
  spin: 0,
};

/**
 * "Welcome back." Lockette lives on the home Wi-Fi for now, so there's no
 * account and no password to remember: the dashboard opens straight away.
 * Google and email-link sign-in come when Lockette works away from home.
 */
export function Login() {
  const [grid, setGrid] = useGridToggle();
  return (
    <>
      <CornerControls
        action={
          <Link href="/" className="pc-press inline-flex min-h-11 items-center border border-ink px-4 text-base font-semibold hover:bg-ink hover:text-bg">
            Home
          </Link>
        }
      />
      <CornerName grid={grid} onGrid={() => setGrid((g) => !g)} />
      <DevGrid on={grid} />
      <main className="grid min-h-[100svh] grid-cols-12 gap-x-6 px-4 pt-28 pb-16 md:px-6">
        <div className="col-span-12 flex flex-col justify-center md:col-span-7 md:col-start-2">
          <p className="caption">log in</p>
          <GooText as="h1" play lines={["Welcome", "back."]} className="display mt-3 text-[18vw] md:text-[8vw]" />
          <p className="mt-8 max-w-[34rem] text-[1.25rem] leading-relaxed text-dim">
            Lockette lives on your home Wi-Fi, so there&apos;s no password to remember. If you&apos;re at home, your
            dashboard opens straight away.
          </p>
          <div className="mt-10 flex flex-col gap-4">
            <SplitButton href="/app/" label="Open my dashboard" big />
            <p className="max-w-[34rem] text-base text-dim">
              Signing in with Google or an email link is coming, for when Lockette works away from home.
            </p>
          </div>
        </div>
        <div className="relative col-span-12 mt-12 aspect-square md:col-span-3 md:col-start-10 md:mt-0 md:self-start">
          <div className="pc-frame absolute inset-0 border border-line">
            <DeviceStage variant="box" pose={CORNER_POSE} />
          </div>
          <p className="caption absolute -bottom-6 left-0">fig. — say hello</p>
        </div>
      </main>
    </>
  );
}
