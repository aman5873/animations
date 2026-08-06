"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import type { Group } from "three";
import { mulberry32 } from "@/lib/motion";

// No trophy.glb / studio.hdr supplied yet. The ball's pentagon/hexagon seams
// are faked with a CPU-generated bump map (a Voronoi cell field evaluated
// directly in 3D over the sphere's surface, not in UV space — that's what
// keeps the panels from pinching at the poles the way a naive image-space
// pattern would) instead of hand-authoring real geometry. Swap in a real
// useGLTF("/models/trophy.glb") here once one exists; Environment's
// "studio" preset is already a real HDRI (fetched from drei's asset CDN),
// so the gold reflections are genuine even though the panel texture is not.
function smoothstep01(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function fibonacciSpherePoints(count: number, seed: number) {
  const rand = mulberry32(seed);
  const points: [number, number, number][] = [];
  const offset = 2 / count;
  const increment = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = i * offset - 1 + offset / 2 + (rand() - 0.5) * 0.03;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * increment;
    points.push([Math.cos(phi) * r, y, Math.sin(phi) * r]);
  }
  return points;
}

function createPanelBumpTexture(seed = 7) {
  const width = 768;
  const height = 384;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);

  const sites = fibonacciSpherePoints(30, seed);
  const shadeRand = mulberry32(seed + 1);
  const cellShade = sites.map(() => 195 + shadeRand() * 40);

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const phi = v * Math.PI;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const theta = u * Math.PI * 2;
      const px = -Math.cos(theta) * sinPhi;
      const py = cosPhi;
      const pz = Math.sin(theta) * sinPhi;

      let nearest = Infinity;
      let secondNearest = Infinity;
      let nearestIdx = 0;
      for (let s = 0; s < sites.length; s++) {
        const [sx, sy, sz] = sites[s];
        const dx = px - sx;
        const dy = py - sy;
        const dz = pz - sz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < nearest) {
          secondNearest = nearest;
          nearest = d;
          nearestIdx = s;
        } else if (d < secondNearest) {
          secondNearest = d;
        }
      }

      const gap = Math.sqrt(secondNearest) - Math.sqrt(nearest);
      const seam = 1 - smoothstep01(0, 0.014, gap);
      const value = Math.round(cellShade[nearestIdx] * (1 - seam * 0.95));

      const idx = (y * width + x) * 4;
      image.data[idx] = value;
      image.data[idx + 1] = value;
      image.data[idx + 2] = value;
      image.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

// Ball + base rotate together as one rigid trophy — a single group/ref
// carries both, driven from ballRadRef, rather than the ball spinning on
// its own while the base sits fixed underneath it.
function TrophyUnit({ ballRadRef }: { ballRadRef: { current: number } }) {
  const groupRef = useRef<Group>(null);
  const bumpMap = useMemo(() => createPanelBumpTexture(), []);

  useFrame(() => {
    if (groupRef.current) groupRef.current.rotation.y = ballRadRef.current;
  });

  return (
    <group ref={groupRef}>
      <mesh castShadow>
        <sphereGeometry args={[0.62, 96, 96]} />
        <meshStandardMaterial
          color="#d9ab3e"
          metalness={0.95}
          roughness={0.32}
          envMapIntensity={1.2}
          bumpMap={bumpMap}
          bumpScale={0.09}
        />
      </mesh>
      <SpikyBase />
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
            <meshStandardMaterial color="#caa03f" metalness={1} roughness={0.25} envMapIntensity={1.3} />
          </mesh>
        </group>
      ))}
      <mesh>
        <cylinderGeometry args={[0.42, 0.5, 0.14, 48]} />
        <meshStandardMaterial color="#b3872f" metalness={1} roughness={0.3} envMapIntensity={1.2} />
      </mesh>
    </group>
  );
}

const RING_RADIUS = 1.2;
const RING_BAND_HEIGHT = 0.58;
// Tilts only the ring's own group, not the ball/base — the ball stays
// upright (a real trophy would), while the ring reads as a halo seen from
// slightly above, the same way Saturn's rings tilt independent of the
// planet. Positive X here is the front (the +Z side, nearest the camera)
// dipping down and the back lifting up; combining it with a roll (Z) is
// what makes the tilt read as diagonal rather than symmetric front-to-back.
const RING_TILT_X = 0.16;
const RING_TILT_Z = 0.1;

function RingBand({ images, ringRadRef }: { images: string[]; ringRadRef: { current: number } }) {
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
  const geometry = useMemo(
    () => new THREE.CylinderGeometry(RING_RADIUS, RING_RADIUS, RING_BAND_HEIGHT, 12, 1, true, 0, sliceAngle * 0.98),
    [sliceAngle],
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
            <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
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
}

export default function Trophy({ images, ringRadRef, ballRadRef }: TrophyProps) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 5.6], fov: 26 }}>
      <Environment preset="studio" background={false} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 6, 5]} intensity={1.1} />
      <directionalLight position={[-4, -1, -3]} intensity={0.3} />
      <TrophyUnit ballRadRef={ballRadRef} />
      <Suspense fallback={null}>
        <RingBand images={images} ringRadRef={ringRadRef} />
      </Suspense>
    </Canvas>
  );
}
