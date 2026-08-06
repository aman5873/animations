"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import HoldButton from "./HoldButton";
import Credits from "./Credits";
import Confetti, { type ConfettiHandle } from "./Confetti";
import { useRingControl } from "@/hooks/useRingControl";
import { playCrowdCheer, stopCrowdCheer } from "@/lib/sound";
import styles from "@/app/prototype-2/trophy.module.css";

// three.js touches the DOM/WebGL context at mount, so this branch is kept
// out of the server render entirely (see the Next.js lazy-loading guide's
// note that ssr:false only works when called from inside a Client Component).
const Trophy = dynamic(() => import("./Trophy"), { ssr: false });

const RING_IMAGE_COUNT = 18;
const RING_IMAGES = Array.from(
  { length: RING_IMAGE_COUNT },
  (_, i) => `https://picsum.photos/seed/trophy-ring-${i}/480/300`,
);

export default function TrophyExperience() {
  const { ringRadRef, trophyRadRef, setHold } = useRingControl();
  const confettiRef = useRef<ConfettiHandle>(null);

  const handleHoldChange = (active: boolean) => {
    setHold(active);
    if (active) {
      confettiRef.current?.start();
      playCrowdCheer();
    } else {
      confettiRef.current?.stop();
      stopCrowdCheer();
    }
  };

  return (
    <main className={styles.scene}>
      <div className={styles.grain} />
      <div className={styles.stage}>
        <Trophy images={RING_IMAGES} ringRadRef={ringRadRef} ballRadRef={trophyRadRef} />
      </div>
      <Confetti ref={confettiRef} />
      <HoldButton onHoldChange={handleHoldChange} />
      <Credits />
    </main>
  );
}
