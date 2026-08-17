import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vault — Hypixel Skyblock Intelligence",
  description: "AI-driven market intelligence, patch analysis, and strategy for Hypixel Skyblock — real-time Bazaar and Auction House tracking, refreshed around the clock.",
};

export default function HypixelSkyblockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
