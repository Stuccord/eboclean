import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/Pwa";

const inter = Inter({
  variable: "--font-inter",
  display: "swap",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Eboclean: cleaning help for ADHD & overwhelmed brains",
  description:
    "Cleaning help for brains that hate starting. Snap your rooms, get tiny 2-minute steps, a friendly body-double voice, and no-guilt streaks.",
  applicationName: "Eboclean",
  // iPhone "Add to Home Screen": full-screen app with its own name.
  appleWebApp: {
    capable: true,
    title: "Eboclean",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f4f5fb",
  width: "device-width",
  initialScale: 1,
  // Draw under the notch / home bar; the layout pads with safe-area insets.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
