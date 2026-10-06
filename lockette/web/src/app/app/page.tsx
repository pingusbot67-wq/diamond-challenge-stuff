import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/dashboard";

export const metadata: Metadata = { title: "Lockette — dashboard" };

export default function AppPage() {
  return <Dashboard />;
}
