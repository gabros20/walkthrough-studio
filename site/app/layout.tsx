import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const description =
  "A screen-recording studio for coding agents: a Claude Code plugin that drives any web app or website with Playwright, logs every action, and cuts a Screen-Studio-style walkthrough film from the log, with a drawn pointer, camera punch-ins, and captions or an ElevenLabs voiceover.";

const site = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "walkthrough-studio: walkthrough films, made by your coding agent",
  description,
  openGraph: {
    title: "walkthrough-studio",
    description,
    type: "website",
    images: [{ url: "/visuals/hero.jpg", width: 1920, height: 1080 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#e3e6e2",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
