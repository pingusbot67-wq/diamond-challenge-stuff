import type { Metadata } from "next";
import { Login } from "@/components/dashboard/login";

export const metadata: Metadata = { title: "Lockette — log in" };

export default function LoginPage() {
  return <Login />;
}
