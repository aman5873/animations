"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  SCENE_CONFIG,
  bezierPoint,
  bezierTangent,
  buildCardConfigs,
  clamp01,
  lerp,
  smoothstep,
  type CardConfig,
} from "@/lib/motion";

const CARDS: CardConfig[] = buildCardConfigs();

export interface CardLayerHandle {
  /** Push a new render frame: progress (0..1) + a monotonically increasing time in ms. */
  setFrame: (progress: number, timeMs: number, mouseX: number, mouseY: number) => void;
}

function photoUrl(seed: string, w: number, h: number) {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

const CardLayer = forwardRef<CardLayerHandle>(function CardLayer(_props, ref) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const stage = sceneRef.current?.parentElement;
    const measure = () => {
      const isMobile = window.innerWidth <= SCENE_CONFIG.MOBILE_BREAKPOINT;
      sizeRef.current = {
        w: stage?.clientWidth ?? window.innerWidth,
        h: stage?.clientHeight ?? window.innerHeight,
      };
      (sizeRef.current as { isMobile?: boolean }).isMobile = isMobile;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setFrame(progress, timeMs, mouseX, mouseY) {
        const scene = sceneRef.current;
        if (!scene) return;

        const { w, h } = sizeRef.current;
        const isMobile = (sizeRef.current as { isMobile?: boolean }).isMobile ?? false;
        const sizeScale = isMobile ? SCENE_CONFIG.MOBILE_SCALE : 1;
        const halfW = w * 0.5;
        const halfH = h * 0.5;

        const p0 = {
          x: SCENE_CONFIG.PATH_START.xFrac * halfW,
          y: SCENE_CONFIG.PATH_START.yFrac * halfH,
        };
        const p1 = {
          x: SCENE_CONFIG.PATH_APEX.xFrac * halfW,
          y: SCENE_CONFIG.PATH_APEX.yFrac * halfH,
        };
        const p2 = {
          x: SCENE_CONFIG.PATH_END.xFrac * halfW,
          y: SCENE_CONFIG.PATH_END.yFrac * halfH,
        };

        // Whole-scene 3D tilt driven softly by pointer position — the
        // classic "camera parallax" that reads as depth rather than flat pan.
        const tiltY = mouseX * 6;
        const tiltX = -mouseY * 4;
        scene.style.transform = `rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) scale(${(1 + progress * 0.02).toFixed(4)})`;

        const wobbleAmp = SCENE_CONFIG.LATERAL_WOBBLE_PX * sizeScale;
        const perpScale = sizeScale;

        for (let i = 0; i < CARDS.length; i++) {
          const c = CARDS[i];
          const el = cardRefs.current[i];
          if (!el) continue;

          // Local progress through this card's own single pass — clamped,
          // never wrapped. Below its start it sits parked at t=0 (spawn
          // point, invisible); past its own finish it parks at t=1 (faded
          // out). No loop means no card can ever be caught mid-reset.
          const t = clamp01((progress - c.startProgress) / SCENE_CONFIG.DURATION);

          const base = bezierPoint(p0, p1, p2, t);
          const tangent = bezierTangent(p0, p1, p2, t);
          const tangentLen = Math.hypot(tangent.x, tangent.y) || 1;
          const perpX = -tangent.y / tangentLen;
          const perpY = tangent.x / tangentLen;

          const wobble = Math.sin(t * Math.PI * 2 * c.wobbleFreq + c.wobblePhase) * wobbleAmp;
          const perp = c.perpOffset * perpScale + wobble;

          const pathX = base.x + perpX * perp;
          const pathY = base.y + perpY * perp;

          // Each card's own growth/fade breakpoints (see CardConfig) — not
          // one shared curve, so two cards at a similar t can legitimately
          // look different: one already crisp and opaque, another still
          // soft, matching the reference's more organic, non-uniform reveal.
          const growth = smoothstep(c.growthStart, c.growthEnd, t);
          const fadeIn = smoothstep(0, c.fadeInEnd, t);
          const fadeOut = 1 - smoothstep(c.fadeOutStart, 1, t);
          const opacity = Math.min(fadeIn, fadeOut);

          const idleT = timeMs * SCENE_CONFIG.IDLE_SPEED * c.idleFreq + c.idlePhase;
          const idleX = Math.cos(idleT) * SCENE_CONFIG.IDLE_AMP * sizeScale;
          const idleY = Math.sin(idleT * 0.85) * SCENE_CONFIG.IDLE_AMP * sizeScale;

          const x = pathX + idleX;
          const y = pathY + idleY;
          const z = lerp(SCENE_CONFIG.Z_SPAWN, SCENE_CONFIG.Z_HOLD, growth);
          const scale = lerp(SCENE_CONFIG.SCALE_SPAWN, 1, growth) * sizeScale;

          const blur = lerp(SCENE_CONFIG.BLUR_MAX, 0, smoothstep(0, c.sharpenEnd, t));

          // Cards lean into the direction they're travelling — a small
          // dynamic rotateY layered on top of each card's fixed 3D tilt,
          // so the cascade reads as swooshing through space, not sliding
          // on a flat plane.
          const lean = clamp01((tangent.x / tangentLen + 1) / 2) * 2 - 1;
          const dynamicRotateY = lean * 10 * (1 - growth * 0.4);

          // The macro path is a single C-bulge and can't bend back on
          // itself — but right at exit, each card spins on its own axis.
          // That per-card flourish is what makes the end of each journey
          // read as a little twist without the whole path needing to be
          // one. Two things make it read as an "exit" turn rather than a
          // random mid-flight wobble: it's anchored to fadeOutStart (not
          // growthEnd — spinning the moment growth finishes happens while
          // the card is still sitting fully visible mid-frame, too early),
          // and it turns on rotateY, not rotateZ — rotateZ is a flat
          // in-plane pinwheel spin with no perspective foreshortening,
          // i.e. reads as 2D no matter what; rotateY genuinely foreshortens
          // through the scene's existing perspective, which is what makes
          // a spin look three-dimensional in the first place.
          const spinStart = Math.max(c.growthEnd, c.fadeOutStart - SCENE_CONFIG.END_SPIN_LEAD);
          const endSpin = smoothstep(spinStart, 1, t) * c.endSpinDeg;

          // Same rotateY-foreshortening trick as the exit spin, but as a
          // transient pass-through flourish: ramps up approaching BEND_T
          // (the path's bulge) and back down leaving it, so it resets to 0
          // rather than staying offset — the card still has the rest of
          // its journey ahead, unlike at exit where there's nothing after.
          const bendRise = smoothstep(
            SCENE_CONFIG.BEND_T - SCENE_CONFIG.BEND_SPIN_WIDTH,
            SCENE_CONFIG.BEND_T,
            t,
          );
          const bendFall = 1 - smoothstep(SCENE_CONFIG.BEND_T, SCENE_CONFIG.BEND_T + SCENE_CONFIG.BEND_SPIN_WIDTH, t);
          const bendSpin = Math.min(bendRise, bendFall) * c.bendSpinDeg;

          el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(1)}px) rotateZ(${c.rotationZ.toFixed(2)}deg) rotateY(${(c.rotationY + dynamicRotateY + endSpin + bendSpin).toFixed(2)}deg) rotateX(${c.rotationX.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
          el.style.opacity = opacity.toFixed(3);
          el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
          el.style.zIndex = String(Math.round(t * 1000));
        }
      },
    }),
    [],
  );

  return (
    <div className="cardScenePerspective">
      <div className="cardSceneInner" ref={sceneRef}>
        {CARDS.map((c, i) => (
          <div
            key={c.id}
            ref={(node) => {
              cardRefs.current[i] = node;
            }}
            className="scrollCard"
            style={{ width: c.width, height: c.height, marginLeft: -c.width / 2, marginTop: -c.height / 2 }}
          >
            <img
              src={photoUrl(c.imgSeed, c.width, c.height)}
              alt=""
              width={c.width}
              height={c.height}
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
      </div>
    </div>
  );
});

export default CardLayer;
