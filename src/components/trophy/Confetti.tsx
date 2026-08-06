"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import gsap from "gsap";
import styles from "@/app/prototype-2/trophy.module.css";

export interface ConfettiHandle {
  start: () => void;
  stop: () => void;
}

const COLORS = ["#d4af52", "#f3d98a", "#c79a3a", "#2b2620", "#8a6f2e"];
const SPAWN_INTERVAL_MS = 200;

const Confetti = forwardRef<ConfettiHandle>(function Confetti(_props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    start() {
      const container = containerRef.current;
      if (!container || intervalRef.current) return;

      const spawn = () => {
        const el = document.createElement("span");
        el.className = styles.confettiPiece;
        el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
        el.style.left = `${Math.random() * window.innerWidth}px`;
        el.style.top = "-16px";
        container.appendChild(el);

        const drift = (Math.random() - 0.5) * 180;
        const fallDuration = 3 + Math.random() * 1.6;
        const fallDistance = window.innerHeight * (0.55 + Math.random() * 0.35);
        const spin = (Math.random() - 0.5) * 360;

        const tl = gsap.timeline({ onComplete: () => el.remove() });
        tl.fromTo(el, { opacity: 0 }, { opacity: 0.95, duration: 0.3, ease: "power1.out" }, 0)
          .to(el, { y: fallDistance, x: drift, rotate: spin, duration: fallDuration, ease: "sine.in" }, 0)
          .to(el, { opacity: 0, duration: 0.8, ease: "power1.in" }, fallDuration - 0.8);
      };

      spawn();
      intervalRef.current = window.setInterval(spawn, SPAWN_INTERVAL_MS);
    },
    stop() {
      // Only stops spawning new pieces — in-flight ones keep falling and
      // fading on their own timeline, which is what makes this read as a
      // gradual wind-down rather than everything vanishing at once.
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    },
  }));

  return <div ref={containerRef} className={styles.confettiLayer} />;
});

export default Confetti;
