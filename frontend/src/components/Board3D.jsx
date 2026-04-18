import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { PLAYER_COLORS } from "../game/logic";

const MARK_SCALE = { 3: 0.32, 4: 0.26 };

function XMark({ color, scale = 0.3 }) {
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[scale * 2.2, scale * 0.38, scale * 0.38]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[scale * 2.2, scale * 0.38, scale * 0.38]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
    </group>
  );
}

function OMark({ color, scale = 0.3 }) {
  return (
    <mesh>
      <torusGeometry args={[scale * 0.85, scale * 0.22, 16, 40]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} />
    </mesh>
  );
}

function TriMark({ color, scale = 0.3 }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <coneGeometry args={[scale * 0.95, scale * 1.4, 3]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} />
    </mesh>
  );
}

function Mark({ playerId, scale }) {
  const color = PLAYER_COLORS[playerId];
  if (playerId === 0) return <XMark color={color} scale={scale} />;
  if (playerId === 1) return <OMark color={color} scale={scale} />;
  return <TriMark color={color} scale={scale} />;
}

function Cell({ position, size, flatIndex, value, currentPlayer, onClick, hovered, setHovered, disabled, markScale, isWinning }) {
  const ref = useRef();
  const hoveredHere = hovered === flatIndex;
  const color = value !== null ? PLAYER_COLORS[value] : "#2B4FFF";

  useFrame((_, dt) => {
    if (!ref.current) return;
    const target = (hoveredHere && value === null && !disabled) ? 1.08 : 1;
    const cur = ref.current.scale.x;
    const next = cur + (target - cur) * Math.min(1, dt * 8);
    ref.current.scale.setScalar(next);
  });

  return (
    <group position={position}>
      <mesh
        ref={ref}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(flatIndex); }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(null); }}
        onClick={(e) => { e.stopPropagation(); if (value === null && !disabled) onClick(flatIndex); }}
      >
        <boxGeometry args={[size, size, size]} />
        <meshPhysicalMaterial
          color={isWinning ? color : "#2B4FFF"}
          transparent
          opacity={value !== null ? 0.08 : hoveredHere ? 0.2 : 0.08}
          emissive={isWinning ? color : "#2B4FFF"}
          emissiveIntensity={isWinning ? 1.1 : hoveredHere ? 0.45 : 0.12}
          roughness={0.25}
          metalness={0.15}
          transmission={0.45}
          thickness={0.4}
          wireframe={false}
        />
      </mesh>
      {/* Frame: inner glowing cube */}
      <mesh>
        <boxGeometry args={[size * 0.995, size * 0.995, size * 0.995]} />
        <meshBasicMaterial color={isWinning ? color : "#2B4FFF"} wireframe transparent opacity={isWinning ? 0.9 : 0.22} toneMapped={false} />
      </mesh>

      {value !== null && <Mark playerId={value} scale={markScale} />}
      {value === null && hoveredHere && !disabled && (
        <group>
          <Mark playerId={currentPlayer} scale={markScale * 0.92} />
          <mesh>
            <boxGeometry args={[0.001, 0.001, 0.001]} />
            <meshBasicMaterial transparent opacity={0.0} />
          </mesh>
        </group>
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

function CubeBoard({ N, board, currentPlayer, onPlay, winningLine, disabled, exploded }) {
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
      {positions.map((pos, fi) => (
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
        />
      ))}
      {winPoints && <WinLine points={winPoints} />}
    </group>
  );
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
      />
      <OrbitControls
        enablePan={false}
        minDistance={4}
        maxDistance={18}
        rotateSpeed={0.9}
        zoomSpeed={0.8}
      />
      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.2} luminanceSmoothing={0.25} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}

function CameraReset({ token }) {
  const prev = useRef(token);
  const target = new THREE.Vector3(6, 5, 7);
  useFrame(({ camera }, dt) => {
    if (prev.current !== token) {
      camera.position.lerp(target, Math.min(1, dt * 4));
      camera.lookAt(0, 0, 0);
      if (camera.position.distanceTo(target) < 0.05) prev.current = token;
    }
  });
  useEffect(() => { /* noop, keep ref */ }, [token]);
  return null;
}
