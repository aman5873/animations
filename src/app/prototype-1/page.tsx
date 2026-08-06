import { Suspense } from "react";
import ScrollExperience from "@/components/ScrollExperience";

export default function Prototype1() {
  return (
    <Suspense fallback={null}>
      <ScrollExperience />
    </Suspense>
  );
}
