import type { Metadata, Viewport } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";
import { themeInitScript } from "@billbistro/ui";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", weight: ["600", "700"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", weight: ["500"] });

export const metadata: Metadata = { title: "BillBistro POS", description: "Touch-first billing", manifest: "/manifest.webmanifest", appleWebApp: { capable: true, title: "BillBistro POS", statusBarStyle: "black-translucent" } };
export const viewport: Viewport = { themeColor: "#0A0B10", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${sora.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
