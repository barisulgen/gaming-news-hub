import type { Metadata } from "next";
import { Archivo, Newsreader } from "next/font/google";

import { TabNav } from "@/components/TabNav";

import "./globals.css";

// latin-ext carries the Turkish characters used by Türk Oyun Sektörü.
const newsreader = Newsreader({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-newsreader",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mobile gaming news hub",
  description:
    "Mobile games industry press from 16 feeds on one page, for people who need to scan it quickly.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${archivo.variable}`}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-paper focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <TabNav />
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
