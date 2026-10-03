import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Sora } from "next/font/google";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/Toast";

import "./globals.css";

/**
 * Fonts are self-hosted: `next/font` fetches them at build time and serves them
 * from this deployment, so a production build makes no request to a font CDN.
 */
const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-sora",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "csax+",
  description: "The self-hosted admin console for CrydenSync.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
