import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Michroma } from "next/font/google";
import "./globals.css";

// Three roles, three faces, and each one is doing a job:
//
// Michroma is the Spaceblanket voice: a precise, geometric face for the
// wordmark and the studio's primary headings.
//
// DM Sans is the interface voice: round, calm, and already the face on the
// channel's thumbnails, so the tool matches what it makes.
//
// JetBrains Mono is the instrument readout — the agent stream, paths, sizes.
// Tall x-height, unambiguous 0/O and 1/l, which is what a log needs.
const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

const display = Michroma({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Studio by Spaceblanket.ai",
  description: "Create finished videos from your raw materials.",
  icons: {
    icon: "/spaceblanket-mark.png",
    apple: "/spaceblanket-mark.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      {/* Browser extensions can add attributes to body before React hydrates it. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
