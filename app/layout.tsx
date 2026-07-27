import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vault — Hypixel Skyblock Intelligence",
  description: "AI-driven market intelligence, patch analysis, and strategy for Hypixel Skyblock — real-time Bazaar and Auction House tracking, refreshed around the clock.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
