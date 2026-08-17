import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vault — Real-Time Game Economy Intelligence",
  description: "AI-driven market intelligence, patch analysis, and strategy — real-time economic data tracking, refreshed around the clock, one game at a time.",
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
