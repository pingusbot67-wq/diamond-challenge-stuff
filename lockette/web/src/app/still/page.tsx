import type { Metadata } from "next";
import { Still } from "@/components/device/still";

export const metadata: Metadata = { title: "Lockette — still", robots: { index: false } };

export default function StillPage() {
  return <Still />;
}
