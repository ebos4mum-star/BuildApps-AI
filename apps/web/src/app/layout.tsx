import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuildApps AI - learn to build apps with AI",
  description:
    "Hands-on lessons, project rescue and publishing help for people building apps and websites with AI.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#130f2a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
