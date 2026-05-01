import type { Metadata } from "next";
import { IslandMapClient } from "./IslandMapClient";

export const metadata: Metadata = {
  title: "Island Map",
  description: "Explore the island and collect supplies.",
};

export default function MapPage() {
  return <IslandMapClient />;
}
