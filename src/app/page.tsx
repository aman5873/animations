import { Suspense } from "react";
import ScrollExperience from "@/components/ScrollExperience";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ScrollExperience />
    </Suspense>
  );
}
