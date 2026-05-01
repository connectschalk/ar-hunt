import type { Metadata } from "next";
import { JoinTribeForm } from "./JoinTribeForm";

export const metadata: Metadata = {
  title: "Tribe",
};

export default function JoinPage() {
  return <JoinTribeForm />;
}
