"use client";

import { useCallback, useEffect, useRef } from "react";
import gsap from "gsap";
import Lenis from "lenis";

// Ambient baseline the ring always turns at, even with no scroll/hold input.
const IDLE_DEG_PER_SEC = 4;
// On mount the ring spins in fast, then this decays back toward idle — an
// entrance flourish rather than a constant rate.
const INTRO_SPIN_DEG_PER_SEC = 320;
const INTRO_DECAY_TAU = 0.7;
// Scroll is the drive input (not drag) — each Lenis scroll tick adds
// momentum here, which decays on its own between ticks so the ring eases
// rather than tracking scroll position 1:1.
const SCROLL_DECAY_TAU = 0.4;
const SCROLL_SENSITIVITY = 0.5;
const HOLD_SPEED_DEG_PER_SEC = 320;
// The trophy always turns opposite the ring, noticeably faster than a 1:1
// mirror — that's what makes the two read as independently driven rather
// than one visually "attached" to the other, and keeps the ball's own
// spin legible (rather than just its highlight drifting) on both scroll
// and hold, since both drive the same shared deltaDeg the ball mirrors.
const TROPHY_COUNTER_RATIO = 2.4;

export function useRingControl() {
  const ringRadRef = useRef(0);
  const trophyRadRef = useRef(0);
  const rotationDeg = useRef(0);
  const introV = useRef(INTRO_SPIN_DEG_PER_SEC);
  const scrollV = useRef(0);
  const holdV = useRef({ v: 0 });
  const prevTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const lenis = new Lenis({ smoothWheel: true });
    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    // The hero is a single fixed viewport with nothing to actually scroll,
    // so Lenis's "scroll" event (position-delta based) never fires with a
    // real velocity here. "virtual-scroll" reports the raw wheel/touch
    // delta directly, independent of whether the page itself moved.
    const unsubscribe = lenis.on("virtual-scroll", ({ deltaY }) => {
      scrollV.current += deltaY * SCROLL_SENSITIVITY;
    });

    const tick = (time: number) => {
      if (prevTimeRef.current === null) {
        prevTimeRef.current = time;
        return;
      }
      const dt = Math.min(time - prevTimeRef.current, 0.1);
      prevTimeRef.current = time;

      introV.current *= Math.exp(-dt / INTRO_DECAY_TAU);
      scrollV.current *= Math.exp(-dt / SCROLL_DECAY_TAU);

      const speed = IDLE_DEG_PER_SEC + introV.current + scrollV.current + holdV.current.v;
      const deltaDeg = speed * dt;
      rotationDeg.current += deltaDeg;
      ringRadRef.current = (rotationDeg.current * Math.PI) / 180;
      trophyRadRef.current -= ((deltaDeg * Math.PI) / 180) * TROPHY_COUNTER_RATIO;
    };
    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      unsubscribe();
      lenis.destroy();
      cancelAnimationFrame(rafId);
    };
  }, []);

  const setHold = useCallback((active: boolean) => {
    gsap.to(holdV.current, {
      v: active ? HOLD_SPEED_DEG_PER_SEC : 0,
      duration: active ? 0.5 : 1.1,
      ease: active ? "power2.out" : "power3.out",
      overwrite: true,
    });
  }, []);

  return { ringRadRef, trophyRadRef, setHold };
}
