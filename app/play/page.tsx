import type { Metadata } from "next";
import { PlayDashboard } from "./PlayDashboard";

export const metadata: Metadata = {
  title: "Play",
};

export default function PlayPage() {
  return <PlayDashboard />;
}
