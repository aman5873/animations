import { Suspense } from "react";
import TrophyExperience from "@/components/trophy/TrophyExperience";

export default function Prototype2() {
  return (
    <Suspense fallback={null}>
      <TrophyExperience />
    </Suspense>
  );
}
