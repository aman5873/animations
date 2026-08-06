"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import CardLayer, { type CardLayerHandle } from "./CardLayer";
import { lerp, smoothstep } from "@/lib/motion";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const NAV_LINKS = ["About", "Science & Technology", "Product", "Interview"];
const DOT_COUNT = 6;

// Runtime override for tuning without a redeploy — e.g. /prototype-1?cards=24.
// Clamped so a stray value can't render zero cards or spawn hundreds of them.
const CARD_COUNT_MIN = 4;
const CARD_COUNT_MAX = 60;

function useCardCountOverride() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("cards");
  if (raw === null) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(CARD_COUNT_MAX, Math.max(CARD_COUNT_MIN, parsed));
}

// The pinned stage releases at progress=1 regardless of where each card
// happens to sit in its own cycle — without this, whatever frame is showing
// gets frozen and dragged offscreen as a static image the instant the pin
// lets go. Fading + lifting the whole scene out over the final stretch means
// by the time the pin releases there's nothing left to freeze.
const EXIT_START = 0.86;

export default function ScrollExperience() {
  const cardCount = useCardCountOverride();
  const stageSectionRef = useRef<HTMLDivElement>(null);
  const stageStickyRef = useRef<HTMLDivElement>(null);
  const stageContentRef = useRef<HTMLDivElement>(null);
  const cardLayerRef = useRef<CardLayerHandle>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    // ScrollTrigger owns pinning + progress smoothing (`scrub`) here — no
    // hand-rolled scroll listener or lerp loop for that part anymore.
    const scrollState = { progress: 0 };
    const st = ScrollTrigger.create({
      trigger: stageSectionRef.current,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.6,
      pin: stageStickyRef.current,
      pinSpacing: true,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        scrollState.progress = self.progress;
      },
    });

    // gsap.quickTo replaces the manual mouse-parallax lerp with the same
    // kind of eased tween GSAP already uses internally.
    const mouseState = { x: 0, y: 0 };
    const setMouseX = gsap.quickTo(mouseState, "x", { duration: 0.5, ease: "power3" });
    const setMouseY = gsap.quickTo(mouseState, "y", { duration: 0.5, ease: "power3" });

    const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const onPointerMove = (e: PointerEvent) => {
      setMouseX((e.clientX / window.innerWidth - 0.5) * 2);
      setMouseY((e.clientY / window.innerHeight - 0.5) * 2);
    };
    const onPointerLeave = () => {
      setMouseX(0);
      setMouseY(0);
    };

    if (supportsHover) {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerleave", onPointerLeave);
    }

    const tick = (time: number) => {
      const progress = scrollState.progress;

      cardLayerRef.current?.setFrame(progress, time * 1000, mouseState.x, mouseState.y);

      if (stageContentRef.current) {
        // The card cascade and the content share this one exit: once the
        // cascade's done, the whole scene — text included — shifts up and
        // recedes (fade + lift + slight scale-down) together, rather than
        // the content just vanishing while cards animate on their own.
        const exit = smoothstep(EXIT_START, 1, progress);
        stageContentRef.current.style.opacity = (1 - exit).toFixed(3);
        stageContentRef.current.style.transform = `translate3d(0, ${(-exit * 110).toFixed(1)}px, 0) scale(${(1 - exit * 0.06).toFixed(4)})`;
      }

      if (heroRef.current) {
        // Starts fully hidden, not just dim — the text has its own distinct
        // "fade in" beat before it settles, running in parallel with the
        // card cascade rather than simply being present the whole time.
        const heroOpacity = lerp(0, 1, smoothstep(0, 0.34, progress));
        const heroLift = lerp(30, 0, smoothstep(0, 0.34, progress));
        heroRef.current.style.opacity = heroOpacity.toFixed(3);
        heroRef.current.style.transform = `translate3d(0, ${heroLift.toFixed(1)}px, 0)`;
      }

      if (ctaRef.current) {
        const ctaProgress = smoothstep(0.03, 0.14, progress);
        ctaRef.current.style.opacity = ctaProgress.toFixed(3);
        ctaRef.current.style.transform = `translate3d(-50%, ${lerp(16, 0, ctaProgress).toFixed(1)}px, 0)`;
      }

      const activeDot = Math.min(DOT_COUNT - 1, Math.floor(progress * DOT_COUNT));
      dotsRef.current.forEach((dot, i) => {
        if (!dot) return;
        dot.classList.toggle("scrollDot--active", i === activeDot);
      });
    };
    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      st.kill();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <>
      <nav className="siteNav">
        <div className="siteNav__logo">/zeroz</div>
        <ul className="siteNav__links">
          {NAV_LINKS.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <a className="siteNav__store" href="#store">
          Online store
        </a>
      </nav>

      <section className="stageSection" ref={stageSectionRef}>
        <div className="stageSticky" ref={stageStickyRef}>
          <div className="stageContent" ref={stageContentRef}>
            <CardLayer ref={cardLayerRef} cardCount={cardCount} />

            <div className="heroCopy" ref={heroRef}>
              <p className="heroCopy__chapter">Chapter 1</p>
              <h1 className="heroCopy__title">
                Life energy <b>is,</b> t<b>h</b>e <b>s</b>ource <b>o</b>f <b>h</b>ealth.
              </h1>
              <p className="heroCopy__caption">(About / Concept)</p>
            </div>

            <div className="ctaButton" ref={ctaRef}>
              <a href="#about-concept">
                About / Concept
                <span className="ctaButton__arrow">&#8250;</span>
              </a>
            </div>

            <div className="scrollDots">
              {Array.from({ length: DOT_COUNT }).map((_, i) => (
                <span
                  key={i}
                  className="scrollDot"
                  ref={(node) => {
                    dotsRef.current[i] = node;
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="chapterSection" id="about-concept">
        <RevealOnScroll className="chapterSection__inner">
          <p className="chapterSection__eyebrow">Chapter 2</p>
          <h2 className="chapterSection__title">Science &amp; Technology</h2>
          <p className="chapterSection__text">
            Once the cascade above finishes its pass, the page hands scrolling back
            to normal content — this section&apos;s solid background naturally
            covers the fixed card layer, and scrolling back up reverses the whole
            sequence in perfect sync.
          </p>
        </RevealOnScroll>
      </section>

      <footer className="siteFooter">
        <p>/zeroz — scroll prototype</p>
      </footer>
    </>
  );
}

function RevealOnScroll({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.classList.add("reveal--visible");
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${className ?? ""}`}>
      {children}
    </div>
  );
}
