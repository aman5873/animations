"use client";

import styles from "@/app/prototype-2/trophy.module.css";

export default function HoldButton({ onHoldChange }: { onHoldChange: (active: boolean) => void }) {
  return (
    <button
      type="button"
      className={styles.holdButton}
      onPointerDown={() => onHoldChange(true)}
      onPointerUp={() => onHoldChange(false)}
      onPointerLeave={() => onHoldChange(false)}
      onPointerCancel={() => onHoldChange(false)}
    >
      Hold Me
    </button>
  );
}
