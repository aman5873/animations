"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import type { Group } from "three";
import { mulberry32 } from "@/lib/motion";

// VS_logo.svg's own intrinsic size (from its <svg width/height>) — used so
// the plane's aspect ratio matches the source art instead of being guessed.
const LOGO_ASPECT = 379 / 244;
const LOGO_HEIGHT = 0.95;
// Matches the base/blade gold elsewhere in this file, so the recolored logo
// reads as part of the same trophy rather than a mismatched accent color.
const LOGO_COLOR = "#271f0b";

// VS_logo.svg's source art is a raster image (not vector paths with a
// fill), so there's no attribute to just recolor. Redrawing it onto a
// canvas and compositing with "source-in" replaces every opaque pixel with
// LOGO_COLOR while keeping the original alpha silhouette — a solid-color
// cutout of the same shape, regardless of what colors the source art had.
function useSolidColorTexture(url: string, color: string) {
  const sourceTextures = useLoader(THREE.TextureLoader, [url]);
  const source = sourceTextures[0];

  return useMemo(() => {
    const img = source.image as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [source, color]);
}

function LogoPlane() {
  const texture = useSolidColorTexture("/VS_logo.svg", LOGO_COLOR);

  return (
    <mesh>
      <planeGeometry args={[LOGO_HEIGHT * LOGO_ASPECT, LOGO_HEIGHT]} />
      {/* DoubleSide so the logo doesn't vanish edge-on as it spins past
          90° — the back face just shows the same artwork mirrored. */}
      <meshBasicMaterial
        map={texture}
        transparent
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// Logo + base rotate together as one rigid unit (when not static) — a
// single group/ref carries both, driven from ballRadRef, rather than the
// logo spinning on its own while the base sits fixed underneath it.
function TrophyUnit({
  ballRadRef,
  staticLogo,
}: {
  ballRadRef: { current: number };
  staticLogo: boolean;
}) {
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    // staticLogo=true simply never touches rotation.y, leaving it at its
    // initial 0 — no separate "static" code path to keep in sync.
    if (groupRef.current && !staticLogo) {
      groupRef.current.rotation.y = ballRadRef.current;
    }
  });

  return (
    <group ref={groupRef}>
      <Suspense fallback={null}>
        <LogoPlane />
      </Suspense>
      {/* <SpikyBase /> */}
    </group>
  );
}

const BLADE_COUNT = 22;

function useBladeGeometry() {
  return useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.055, 0.28, 0.02, 0.6);
    shape.quadraticCurveTo(0.01, 0.66, 0, 0.72);
    shape.quadraticCurveTo(-0.01, 0.66, -0.02, 0.6);
    shape.quadraticCurveTo(-0.055, 0.28, 0, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.03,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 2,
      curveSegments: 8,
    });
    geometry.translate(0, 0, -0.015);
    return geometry;
  }, []);
}

// A real Ballon d'Or base is a burst of gold flame-like blades cupping the
// ball. Each blade is one flat extruded shape, instanced N times around Y
// (revolved via each blade's own parent group rotation) with alternating
// heights so it doesn't read as a uniform, obviously-repeated ring.
function SpikyBase() {
  const bladeGeometry = useBladeGeometry();
  const blades = useMemo(() => {
    const rand = mulberry32(99);
    return Array.from({ length: BLADE_COUNT }, (_, i) => {
      const angle = (i / BLADE_COUNT) * Math.PI * 2;
      const tall = i % 2 === 0;
      return {
        angle,
        heightScale: (tall ? 0.8 : 0.5) + rand() * 0.1,
        flareTilt: 0.5 + rand() * 0.15,
        radius: 0.4 + rand() * 0.03,
      };
    });
  }, []);

  return (
    <group position={[0, -0.62, 0]}>
      {blades.map((b, i) => (
        <group key={i} rotation={[0, b.angle, 0]}>
          <mesh
            geometry={bladeGeometry}
            position={[b.radius, 0, 0]}
            rotation={[0, 0, -b.flareTilt]}
            scale={[1, b.heightScale, 1]}
          >
            <meshStandardMaterial
              color="#caa03f"
              metalness={1}
              roughness={0.25}
              envMapIntensity={1.3}
            />
          </mesh>
        </group>
      ))}
      <mesh>
        <cylinderGeometry args={[0.42, 0.5, 0.14, 48]} />
        <meshStandardMaterial
          color="#b3872f"
          metalness={1}
          roughness={0.3}
          envMapIntensity={1.2}
        />
      </mesh>
    </group>
  );
}

// Overall ring/card size — radius is derived from this (see RingBand), so
// bumping this one number scales card height AND the ring's radius
// together while keeping RING_CARD_ASPECT's proportions locked. If you
// push this much further, pull the camera back too (see Trophy below) —
// it's currently framed for this value, not auto-fitted.
const RING_BAND_HEIGHT = 0.85;
// Matches the supplied card spec (317×218.5px).
const RING_CARD_ASPECT = 317 / 218.5;
// Tilts only the ring's own group, not the ball/base — the ball stays
// upright (a real trophy would), while the ring reads as a halo seen from
// slightly above, the same way Saturn's rings tilt independent of the
// planet. Positive X here is the front (the +Z side, nearest the camera)
// dipping down and the back lifting up; combining it with a roll (Z) is
// what makes the tilt read as diagonal rather than symmetric front-to-back.

const RING_TILT_X = 0.18; // pitch — front dips down / back lifts up
const RING_TILT_Z = 0.1; // roll — left dips down / right lifts up (diagonal)

function RingBand({
  images,
  ringRadRef,
}: {
  images: string[];
  ringRadRef: { current: number };
}) {
  const spinRef = useRef<Group>(null);
  const textures = useLoader(THREE.TextureLoader, images);

  useEffect(() => {
    textures.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
    });
  }, [textures]);

  useFrame(() => {
    if (spinRef.current) spinRef.current.rotation.y = ringRadRef.current;
  });

  const sliceAngle = (Math.PI * 2) / images.length;
  // arcWidth = radius * sliceAngle, so solving for radius from the target
  // aspect ratio is what keeps each card's proportions correct at any count.
  const radius = (RING_BAND_HEIGHT * RING_CARD_ASPECT) / (sliceAngle * 0.98);
  const geometry = useMemo(
    () =>
      new THREE.CylinderGeometry(
        radius,
        radius,
        RING_BAND_HEIGHT,
        12,
        1,
        true,
        0,
        sliceAngle * 0.98,
      ),
    [sliceAngle, radius],
  );

  return (
    <group rotation={[RING_TILT_X, 0, RING_TILT_Z]}>
      <group ref={spinRef}>
        {textures.map((texture, i) => (
          <mesh key={i} geometry={geometry} rotation={[0, i * sliceAngle, 0]}>
            {/* Photos read as dull under meshStandardMaterial — they're lit
                (and dimmed/desaturated by tone mapping) like any other PBR
                surface. They're flat printed cards, not reflective objects,
                so meshBasicMaterial + toneMapped=false shows the texture's
                actual color straight through instead. */}
            <meshBasicMaterial
              map={texture}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

interface TrophyProps {
  images: string[];
  ringRadRef: { current: number };
  ballRadRef: { current: number };
  /** Logo doesn't rotate when true (default) — set false to spin it with the ball's counter-rotation. */
  staticLogo?: boolean;
}

export default function Trophy({
  images,
  ringRadRef,
  ballRadRef,
  staticLogo = true,
}: TrophyProps) {
  return (
    // Camera is deliberately far back with a narrow (telephoto-like) fov,
    // rather than close with a wide one — moved further and framed tighter,
    // same on-screen ring size, but flatter perspective. The ring's depth
    // (front-to-back across its radius) is a much smaller fraction of the
    // camera distance this way, so the back cards don't shrink nearly as
    // much relative to the front ones as they did up close.
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 11.5], fov: 30 }}>
      <Environment preset="studio" background={false} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 6, 5]} intensity={1.1} />
      <directionalLight position={[-4, -1, -3]} intensity={0.3} />
      <TrophyUnit ballRadRef={ballRadRef} staticLogo={staticLogo} />
      <Suspense fallback={null}>
        <RingBand images={images} ringRadRef={ringRadRef} />
      </Suspense>
    </Canvas>
  );
}
