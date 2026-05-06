import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { TrackballControls, PerspectiveCamera } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { PLAYER_COLORS } from "../game/logic";

const MARK_SCALE = { 3: 0.32, 4: 0.26 };

function XMark({ color, scale = 0.3, intensity = 2.2 }) {
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[scale * 2.2, scale * 0.38, scale * 0.38]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[scale * 2.2, scale * 0.38, scale * 0.38]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />
      </mesh>
    </group>
  );
}

function OMark({ color, scale = 0.3, intensity = 2.2 }) {
  return (
    <mesh>
      <torusGeometry args={[scale * 0.85, scale * 0.22, 16, 40]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />
    </mesh>
  );
}

function TriMark({ color, scale = 0.3, intensity = 2.2 }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <coneGeometry args={[scale * 0.95, scale * 1.4, 3]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />
    </mesh>
  );
}

function Mark({ playerId, scale, intensity }) {
  const color = PLAYER_COLORS[playerId];
  if (playerId === 0) return <XMark color={color} scale={scale} intensity={intensity} />;
  if (playerId === 1) return <OMark color={color} scale={scale} intensity={intensity} />;
  return <TriMark color={color} scale={scale} intensity={intensity} />;
}

// Visual-state computation for a Cell — separated so the main component stays small.
function computeCellVisuals({ value, hoveredHere, isWinning, dim }) {
  let baseOpacity;
  if (value !== null) baseOpacity = 0.08;
  else if (hoveredHere) baseOpacity = 0.22;
  else baseOpacity = 0.09;

  let baseEmissive;
  if (isWinning) baseEmissive = 1.1;
  else if (hoveredHere) baseEmissive = 0.5;
  else baseEmissive = 0.14;

  const baseFrameOpacity = isWinning ? 0.95 : 0.24;

  return {
    opacity:      dim ? baseOpacity * 0.35   : baseOpacity,
    emissive:     dim ? 0.04                  : baseEmissive,
    frameOpacity: dim ? 0.07                  : baseFrameOpacity,
    markIntensity: dim ? 0.6                  : 2.4,
  };
}

function Cell({
  position, size, flatIndex, value, currentPlayer, onClick,
  hovered, setHovered, disabled, markScale, isWinning, isActiveLevel,
}) {
  const ref = useRef();
  const hoveredHere = hovered === flatIndex;
  const dim = !isActiveLevel;
  const color = value !== null ? PLAYER_COLORS[value] : "#2B4FFF";
  const visuals = computeCellVisuals({ value, hoveredHere, isWinning, dim });

  useFrame((_, dt) => {
    if (!ref.current) return;
    const target = (hoveredHere && value === null && !disabled && isActiveLevel) ? 1.08 : 1;
    const cur = ref.current.scale.x;
    ref.current.scale.setScalar(cur + (target - cur) * Math.min(1, dt * 8));
  });

  const handleOver  = isActiveLevel ? (e) => { e.stopPropagation(); setHovered(flatIndex); } : undefined;
  const handleOut   = isActiveLevel ? (e) => { e.stopPropagation(); setHovered(null); }     : undefined;
  const handleClick = isActiveLevel
    ? (e) => { e.stopPropagation(); if (value === null && !disabled) onClick(flatIndex); }
    : undefined;

  return (
    <group position={position}>
      <mesh
        ref={ref}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
        raycast={isActiveLevel ? undefined : () => null}
      >
        <boxGeometry args={[size, size, size]} />
        <meshPhysicalMaterial
          color={isWinning ? color : "#2B4FFF"}
          transparent
          opacity={visuals.opacity}
          emissive={isWinning ? color : "#2B4FFF"}
          emissiveIntensity={visuals.emissive}
          roughness={0.25}
          metalness={0.15}
          transmission={0.5}
          thickness={0.4}
        />
      </mesh>
      <mesh>
        <boxGeometry args={[size * 0.995, size * 0.995, size * 0.995]} />
        <meshBasicMaterial
          color={isWinning ? color : "#2B4FFF"}
          wireframe
          transparent
          opacity={visuals.frameOpacity}
          toneMapped={false}
        />
      </mesh>

      {value !== null && <Mark playerId={value} scale={markScale} intensity={visuals.markIntensity} />}
      {value === null && hoveredHere && !disabled && isActiveLevel && (
        <Mark playerId={currentPlayer} scale={markScale * 0.92} intensity={visuals.markIntensity} />
      )}
    </group>
  );
}

function WinLine({ points }) {
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))),
    [points]
  );
  return (
    <mesh>
      <tubeGeometry args={[curve, 64, 0.09, 16, false]} />
      <meshStandardMaterial color="#2B4FFF" emissive="#2B4FFF" emissiveIntensity={2.4} toneMapped={false} />
    </mesh>
  );
}

function CubeBoard({ N, board, currentPlayer, onPlay, winningLine, disabled, exploded, activeLevel }) {
  const [hovered, setHovered] = useState(null);
  const cellSize = N === 3 ? 1.1 : 0.9;
  const gap = N === 3 ? 0.25 : 0.2;
  const step = cellSize + gap;
  const explodeExtra = exploded ? (N === 3 ? 1.2 : 1.0) : 0;
  const origin = -((N - 1) * step) / 2;

  const positions = useMemo(() => {
    const arr = [];
    for (let l = 0; l < N; l++)
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          const x = origin + c * step;
          const y = origin + l * (step + explodeExtra);
          const z = origin + r * step;
          arr.push([x, y, z]);
        }
    return arr;
  }, [N, step, origin, explodeExtra]);

  const winSet = useMemo(() => new Set(winningLine || []), [winningLine]);
  const markScale = MARK_SCALE[N] * cellSize;

  const winPoints = useMemo(() => {
    if (!winningLine) return null;
    return winningLine.map((fi) => {
      const p = positions[fi];
      return [p[0], p[1], p[2]];
    });
  }, [winningLine, positions]);

  return (
    <group>
      {positions.map((pos, fi) => {
        const level = Math.floor(fi / (N * N));
        const isActiveLevel = activeLevel == null || activeLevel === level;
        return (
          <Cell
            key={`cell-${fi}`}
            position={pos}
            size={cellSize}
            flatIndex={fi}
            value={board[fi]}
            currentPlayer={currentPlayer}
            onClick={onPlay}
            hovered={hovered}
            setHovered={setHovered}
            disabled={disabled}
            markScale={markScale}
            isWinning={winSet.has(fi)}
            isActiveLevel={isActiveLevel}
          />
        );
      })}
      {winPoints && <WinLine points={winPoints} />}
    </group>
  );
}

function CameraReset({ token }) {
  const prev = useRef(token);
  const controls = useThree((s) => s.controls);
  useFrame(() => {
    if (prev.current !== token) {
      if (controls && typeof controls.reset === "function") {
        controls.reset();
      }
      prev.current = token;
    }
  });
  return null;
}

export default function Board3D({
  N,
  board,
  currentPlayer,
  onPlay,
  winningLine,
  disabled,
  exploded,
  resetToken,
  activeLevel = null,
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
      data-testid="board-canvas"
    >
      <PerspectiveCamera makeDefault position={[6, 5, 7]} fov={42} />
      <ambientLight intensity={0.35} />
      <pointLight position={[10, 10, 10]} intensity={1.2} color="#2B4FFF" />
      <pointLight position={[-10, -6, -10]} intensity={0.8} color="#1E40FF" />
      <CameraReset token={resetToken} />
      <CubeBoard
        N={N}
        board={board}
        currentPlayer={currentPlayer}
        onPlay={onPlay}
        winningLine={winningLine}
        disabled={disabled}
        exploded={exploded}
        activeLevel={activeLevel}
      />
      {/* TrackballControls: full 3-axis rotation including roll (z-axis). Pinch + scroll zoom. */}
      <TrackballControls
        makeDefault
        rotateSpeed={3.5}
        zoomSpeed={1.2}
        panSpeed={0.4}
        noPan={false}
        minDistance={4}
        maxDistance={20}
        dynamicDampingFactor={0.15}
        staticMoving={false}
      />
      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.2} luminanceSmoothing={0.25} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
