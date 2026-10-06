import type { Metadata, Viewport } from "next";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource-variable/inter";
import "./globals.css";
import { PREFS_BOOT } from "@/components/ui/boot";
import { PrefsProvider } from "@/components/ui/prefs";

export const metadata: Metadata = {
  title: "Lockette — one button, someone to talk to",
  description:
    "Lockette is a small one-button voice companion for older adults. Press it and talk: it answers out loud, reminds, and keeps family in the loop.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#faf5ee",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="paper" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT }} />
      </head>
      <body>
        <PrefsProvider>{children}</PrefsProvider>
      </body>
    </html>
  );
}
