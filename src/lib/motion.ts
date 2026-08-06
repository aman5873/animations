// Pure math + deterministic card-layout generation for the scroll scene.
// Card configs are generated with a seeded PRNG (not Math.random()) so the
// exact same layout is produced on the server render and the client
// hydration pass — avoids a hydration mismatch on the <img> src/size props.

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function wrap01(v: number) {
  let r = v % 1;
  if (r < 0) r += 1;
  return r;
}

export interface Point {
  x: number;
  y: number;
}

export function bezierPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

export function bezierTangent(
  p0: Point,
  p1: Point,
  p2: Point,
  t: number,
): Point {
  const mt = 1 - t;
  return {
    x: 2 * mt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * mt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
  };
}

// A quadratic bezier only ever bulges toward its single control point — it
// has no inflection, so it can't bend one way then the other. The reference
// path does exactly that (an S: bulges right through the lower half, then
// bends back left through the upper half), which needs a cubic — two
// control points on opposing sides of the start->end chord.
export function cubicBezierPoint(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number,
): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

export function cubicBezierTangent(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number,
): Point {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const c = 3 * t * t;
  return {
    x: a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    y: a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y),
  };
}

// mulberry32 — tiny, fast, deterministic PRNG.
export function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CardConfig {
  id: number;
  width: number;
  height: number;
  imgSeed: string;
  // Fixed start point on the scroll-progress timeline (0..1) — every card
  // begins its journey at the same path position (t=0) and travels it
  // exactly once over DURATION, no looping. Staggering CARD_COUNT starts
  // evenly across [0, 1-DURATION] is what gives "one card at a time, full
  // flow covered, with a gap" instead of a randomly-desynced loop where
  // cards from different cycles could coincidentally pile up at one spot.
  startProgress: number;
  rotationZ: number;
  rotationY: number;
  rotationX: number;
  perpOffset: number;
  wobbleFreq: number;
  wobblePhase: number;
  idlePhase: number;
  idleFreq: number;
  // Each card's own breakpoints for growth/fade/sharpen — randomized per
  // card around the SCENE_CONFIG bases rather than every card sharing one
  // timing curve. This is what makes cards sitting at similar points along
  // the path look different from each other (one already crisp, another
  // still soft) instead of every card reading identically at a given t.
  growthStart: number;
  growthEnd: number;
  fadeInEnd: number;
  sharpenEnd: number;
  fadeOutStart: number;
  // The macro path is a single C-bulge (a quadratic bezier can't inflect,
  // so it can't be an S on its own) — but each card spins on its own axis
  // once it's fully arrived (between growthEnd and fadeOutStart), which is
  // what makes the very end of its journey read as a little S-twist even
  // though the overall travel curve never bends back on itself.
  endSpinDeg: number;
  // Same rotateY-on-its-own-axis trick, but as a brief mid-flight flourish
  // right at the path's bend (BEND_T) instead of a one-way exit twist — it
  // ramps up approaching the bend and back down leaving it, landing back at
  // the card's normal rotation rather than staying offset.
  bendSpinDeg: number;
}

const CARD_COUNT = 24;

// DURATION is derived from CARD_COUNT rather than fixed, so overlap density
// (how many cards are ever mid-flight at once) stays constant as CARD_COUNT
// changes. Without this, turning CARD_COUNT up just packs the same DURATION
// window tighter and tighter — gap = (1-DURATION)/(CARD_COUNT-1) shrinks but
// DURATION doesn't, so more cards end up overlapping until they're back to
// stacking on top of each other. The ratio is pinned to the density of the
// originally-tuned 12-card/0.34-duration config (~5.67 cards visible at
// once), so this reproduces that same density at any CARD_COUNT — including
// a runtime override (e.g. a `?cards=` URL param), via deriveDuration below.
const REFERENCE_CARD_COUNT = 12;
const REFERENCE_DURATION = 0.34;
const TARGET_OVERLAP =
  (REFERENCE_DURATION * (REFERENCE_CARD_COUNT - 1)) / (1 - REFERENCE_DURATION);

export function deriveDuration(cardCount: number) {
  return TARGET_OVERLAP / (cardCount - 1 + TARGET_OVERLAP);
}

const DURATION = deriveDuration(CARD_COUNT);

export const SCENE_CONFIG = {
  CARD_COUNT,
  ASPECT_MIN: 1.15,
  ASPECT_MAX: 1.6,

  ROTATION_Z_MIN: -14,
  ROTATION_Z_MAX: 14,
  ROTATION_Y_MIN: -26,
  ROTATION_Y_MAX: 26,
  ROTATION_X_MIN: -7,
  ROTATION_X_MAX: 7,

  // Shared C-shaped quadratic bezier the whole cascade travels along,
  // expressed as fractions of the stage half-width/half-height (origin =
  // stage center) — a single bulge toward PATH_APEX, no inflection.
  PATH_START: { xFrac: 0.1, yFrac: 1.3 },
  PATH_APEX: { xFrac: 1.75, yFrac: 0.1 },
  PATH_END: { xFrac: -0.85, yFrac: -1.3 },

  PERP_JITTER_PX: 30,
  LATERAL_WOBBLE_PX: 5,
  WOBBLE_FREQ_MIN: 0.5,
  WOBBLE_FREQ_MAX: 1.05,

  // Per-card self-rotation right at exit (see endSpinDeg) — magnitude
  // range, always clockwise. Anchored to fadeOutStart (not growthEnd): the
  // spin should happen as the card is actually leaving, not the moment it
  // finishes growing while it's still sitting fully visible mid-frame.
  END_SPIN_MIN_DEG: 35,
  END_SPIN_MAX_DEG: 90,
  END_SPIN_LEAD: 0.08,

  // Mid-flight bend flourish: a brief rotateY spin centered on BEND_T (the
  // path's bulge, ~halfway through the C) that ramps up then back down
  // over BEND_SPIN_WIDTH on each side — unlike the exit spin it always
  // resets to 0, since the card still has the rest of the path ahead of it.
  BEND_T: 0.5,
  BEND_SPIN_WIDTH: 0.1,
  BEND_SPIN_MIN_DEG: 20,
  BEND_SPIN_MAX_DEG: 50,

  // Each card's own local journey (spawn -> full path -> faded out) takes
  // this fraction of the total scroll range, traversed exactly once — no
  // wrap/loop. Consecutive cards start GAP apart (derived below from
  // CARD_COUNT so the last card still finishes by progress=1), which is
  // what bounds how many cards can ever be mid-flight at once.
  DURATION,

  SCALE_SPAWN: 0.16,

  // Bases + per-card jitter for buildCardConfigs (see CardConfig above) —
  // each card gets its own point within [base - jitter, base + jitter]
  // rather than every card sharing the exact base value.
  GROWTH_START_BASE: 0.04,
  GROWTH_START_JITTER: 0.03,
  GROWTH_END_BASE: 0.86,
  GROWTH_END_JITTER: 0.06,
  FADE_IN_END_BASE: 0.1,
  FADE_IN_END_JITTER: 0.05,
  SHARPEN_END_BASE: 0.26,
  SHARPEN_END_JITTER: 0.1,
  FADE_OUT_START_BASE: 0.93,
  FADE_OUT_START_JITTER: 0.03,

  BLUR_MAX: 7,

  // 3D depth: cards start "far" from camera (negative Z, small + soft) and
  // drift toward the viewer as they grow, then hold — this is layered on
  // top of the 2D scale ramp so the pop feels dimensional, not just a resize.
  Z_SPAWN: -560,
  Z_HOLD: 40,

  IDLE_AMP: 3,
  IDLE_SPEED: 0.0006,

  SCROLL_EASE: 0.1,

  MOBILE_BREAKPOINT: 700,
  MOBILE_SCALE: 0.62,
} as const;

const SIZE_TIERS = [
  { weight: 0.28, min: 270, max: 330 },
  { weight: 0.4, min: 215, max: 260 },
  { weight: 0.32, min: 165, max: 205 },
];

function pickTier(rand: () => number) {
  const r = rand();
  let acc = 0;
  for (const tier of SIZE_TIERS) {
    acc += tier.weight;
    if (r <= acc) return tier;
  }
  return SIZE_TIERS[SIZE_TIERS.length - 1];
}

function randRange(rand: () => number, min: number, max: number) {
  return min + rand() * (max - min);
}

export function buildCardConfigs(
  seed = 1337,
  cardCountOverride?: number,
): CardConfig[] {
  const rand = mulberry32(seed);
  const cards: CardConfig[] = [];
  const count = cardCountOverride ?? SCENE_CONFIG.CARD_COUNT;
  const duration = cardCountOverride
    ? deriveDuration(count)
    : SCENE_CONFIG.DURATION;

  // Evenly staggered starts spanning [0, 1 - duration] — card 0 starts at
  // progress 0, the last card starts exactly duration early so it still
  // completes its full pass by progress 1. Deterministic order (not
  // shuffled): timing consistency is the point here, and per-card size/tilt
  // is already randomized independently, so start order doesn't need to be.
  const span = 1 - duration;
  const gap = count > 1 ? span / (count - 1) : 0;

  for (let i = 0; i < count; i++) {
    const tier = pickTier(rand);
    const width = Math.round(randRange(rand, tier.min, tier.max));
    const height = Math.round(
      width * randRange(rand, SCENE_CONFIG.ASPECT_MIN, SCENE_CONFIG.ASPECT_MAX),
    );

    const growthStart = randRange(
      rand,
      SCENE_CONFIG.GROWTH_START_BASE - SCENE_CONFIG.GROWTH_START_JITTER,
      SCENE_CONFIG.GROWTH_START_BASE + SCENE_CONFIG.GROWTH_START_JITTER,
    );
    const growthEnd = randRange(
      rand,
      SCENE_CONFIG.GROWTH_END_BASE - SCENE_CONFIG.GROWTH_END_JITTER,
      SCENE_CONFIG.GROWTH_END_BASE + SCENE_CONFIG.GROWTH_END_JITTER,
    );
    const fadeInEnd = randRange(
      rand,
      SCENE_CONFIG.FADE_IN_END_BASE - SCENE_CONFIG.FADE_IN_END_JITTER,
      SCENE_CONFIG.FADE_IN_END_BASE + SCENE_CONFIG.FADE_IN_END_JITTER,
    );
    const sharpenEnd = randRange(
      rand,
      SCENE_CONFIG.SHARPEN_END_BASE - SCENE_CONFIG.SHARPEN_END_JITTER,
      SCENE_CONFIG.SHARPEN_END_BASE + SCENE_CONFIG.SHARPEN_END_JITTER,
    );
    const fadeOutStart = randRange(
      rand,
      SCENE_CONFIG.FADE_OUT_START_BASE - SCENE_CONFIG.FADE_OUT_START_JITTER,
      SCENE_CONFIG.FADE_OUT_START_BASE + SCENE_CONFIG.FADE_OUT_START_JITTER,
    );

    cards.push({
      id: i,
      width,
      height,
      imgSeed: `zeroz-card-${i}`,
      startProgress: i * gap,
      rotationZ: randRange(
        rand,
        SCENE_CONFIG.ROTATION_Z_MIN,
        SCENE_CONFIG.ROTATION_Z_MAX,
      ),
      rotationY: randRange(
        rand,
        SCENE_CONFIG.ROTATION_Y_MIN,
        SCENE_CONFIG.ROTATION_Y_MAX,
      ),
      rotationX: randRange(
        rand,
        SCENE_CONFIG.ROTATION_X_MIN,
        SCENE_CONFIG.ROTATION_X_MAX,
      ),
      perpOffset: randRange(rand, -1, 1) * SCENE_CONFIG.PERP_JITTER_PX,
      wobbleFreq: randRange(
        rand,
        SCENE_CONFIG.WOBBLE_FREQ_MIN,
        SCENE_CONFIG.WOBBLE_FREQ_MAX,
      ),
      wobblePhase: rand() * Math.PI * 2,
      idlePhase: rand() * Math.PI * 2,
      idleFreq: 0.7 + rand() * 0.6,
      growthStart,
      growthEnd: Math.max(growthEnd, growthStart + 0.5),
      fadeInEnd,
      sharpenEnd,
      fadeOutStart: Math.max(fadeOutStart, growthEnd + 0.03),
      // Always positive (clockwise) — every card twists the same direction
      // on its way out, not a coin-flip mix of left and right.
      endSpinDeg: randRange(
        rand,
        SCENE_CONFIG.END_SPIN_MIN_DEG,
        SCENE_CONFIG.END_SPIN_MAX_DEG,
      ),
      bendSpinDeg: randRange(
        rand,
        SCENE_CONFIG.BEND_SPIN_MIN_DEG,
        SCENE_CONFIG.BEND_SPIN_MAX_DEG,
      ),
    });
  }

  return cards;
}
