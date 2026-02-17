import { useRef, useMemo, memo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Billboard, QuadraticBezierLine, RoundedBox } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useTheme } from '../contexts/ThemeContext';
import type { Project, Zone, Conduit, ZoneType } from '../types/models';
import { ZONE_TYPE_CONFIG, SECURITY_LEVEL_CONFIG } from '../types/models';

interface Zone3DEditorProps {
  project: Project;
  selectedZone?: Zone;
  selectedConduit?: Conduit;
  onSelectZone: (zone: Zone | undefined) => void;
  onSelectConduit: (conduit: Conduit | undefined) => void;
  riskOverlayEnabled?: boolean;
  zoneRisks?: Map<string, { score: number; level: string }>;
  highlightedPath?: { zoneIds: Set<string>; conduitIds: Set<string>; riskLevel: string } | null;
}

// --- Height & Layout ---

const TIER_HEIGHT = 4.0;
const PLATFORM_SIZE = 3.2;

function getZoneHeight(type: ZoneType): number {
  return ZONE_TYPE_CONFIG[type].level * TIER_HEIGHT;
}

// Arrange same-tier zones in a row along X axis, centered
function computeZonePositions(zones: Zone[]): Map<string, [number, number, number]> {
  const tierGroups = new Map<number, Zone[]>();
  for (const zone of zones) {
    const level = ZONE_TYPE_CONFIG[zone.type].level;
    if (!tierGroups.has(level)) tierGroups.set(level, []);
    tierGroups.get(level)!.push(zone);
  }

  const positions = new Map<string, [number, number, number]>();
  const spacing = PLATFORM_SIZE + 1.8;

  for (const [, group] of tierGroups) {
    const y = getZoneHeight(group[0].type);
    const totalWidth = (group.length - 1) * spacing;
    group.forEach((zone, i) => {
      const x = -totalWidth / 2 + i * spacing;
      positions.set(zone.id, [x, y, 0]);
    });
  }
  return positions;
}

// --- Scene Lighting ---

function SceneLighting({ dark }: { dark: boolean }) {
  return (
    <>
      <ambientLight intensity={dark ? 0.35 : 0.65} />
      <directionalLight
        position={[10, 25, 15]}
        intensity={dark ? 0.7 : 0.9}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      {dark && (
        <>
          <pointLight position={[-10, 15, -10]} intensity={0.5} color="#8b5cf6" distance={40} />
          <pointLight position={[10, 8, 10]} intensity={0.4} color="#3b82f6" distance={40} />
          <pointLight position={[0, 20, 0]} intensity={0.3} color="#6366f1" distance={50} />
        </>
      )}
    </>
  );
}

// --- Grid Floor ---

function GridFloor({ dark }: { dark: boolean }) {
  return (
    <group>
      <gridHelper
        args={[60, 30, dark ? '#1e293b' : '#d1d5db', dark ? '#111827' : '#e5e7eb']}
        position={[0, -0.01, 0]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial
          color={dark ? '#0a0f1a' : '#f1f5f9'}
          metalness={dark ? 0.4 : 0.0}
          roughness={dark ? 0.6 : 0.9}
        />
      </mesh>
    </group>
  );
}

// --- Ambient Particles ---

function AmbientParticles({ dark }: { dark: boolean }) {
  const count = 200;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo(() => {
    return Array.from({ length: count }, () => ({
      pos: [
        (Math.random() - 0.5) * 40,
        Math.random() * 30 + 1,
        (Math.random() - 0.5) * 40,
      ] as [number, number, number],
      speed: 0.1 + Math.random() * 0.3,
      offset: Math.random() * Math.PI * 2,
    }));
  }, []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    particles.forEach((p, i) => {
      dummy.position.set(
        p.pos[0] + Math.sin(t * p.speed * 0.3 + p.offset) * 3,
        p.pos[1] + Math.sin(t * p.speed * 0.2 + p.offset) * 1,
        p.pos[2] + Math.cos(t * p.speed * 0.3 + p.offset) * 3
      );
      dummy.scale.setScalar(0.03 + Math.sin(t * 0.5 + p.offset) * 0.015);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        color={dark ? '#818cf8' : '#94a3b8'}
        transparent
        opacity={dark ? 0.6 : 0.25}
      />
    </instancedMesh>
  );
}

// --- Asset Sub-shapes ---

function AssetObject({
  type,
  position,
  color,
}: {
  type: string;
  position: [number, number, number];
  color: string;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.getElapsedTime() * 0.4;
  });

  if (type === 'plc' || type === 'rtu' || type === 'ied' || type === 'dcs') {
    return (
      <mesh ref={ref} position={position} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.35, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
    );
  }

  if (type === 'firewall') {
    return (
      <mesh ref={ref} position={position} castShadow>
        <octahedronGeometry args={[0.22]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
      </mesh>
    );
  }

  return (
    <mesh ref={ref} position={position} castShadow>
      <boxGeometry args={[0.28, 0.22, 0.28]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
    </mesh>
  );
}

// --- Zone Platform ---

const RISK_COLORS_3D: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  minimal: '#22c55e',
};

function ZonePlatform({
  zone,
  position,
  selected,
  onClick,
  dark,
  riskLevel,
  riskOverlay,
  highlighted,
  highlightRiskLevel,
  dimmed,
}: {
  zone: Zone;
  position: [number, number, number];
  selected: boolean;
  onClick: () => void;
  dark: boolean;
  riskLevel?: string;
  riskOverlay?: boolean;
  highlighted?: boolean;
  highlightRiskLevel?: string;
  dimmed?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const config = ZONE_TYPE_CONFIG[zone.type];
  const slConfig = SECURITY_LEVEL_CONFIG[zone.security_level_target] || SECURITY_LEVEL_CONFIG[1];

  // Risk overlay tints the platform color
  const riskColor = riskOverlay && riskLevel ? RISK_COLORS_3D[riskLevel] : undefined;
  const baseColor = riskColor ? new THREE.Color(riskColor) : new THREE.Color(config.color);
  const color = baseColor;

  const emissiveColor = highlighted && highlightRiskLevel
    ? RISK_COLORS_3D[highlightRiskLevel] || config.color
    : config.color;

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 0.4 + position[0]) * 0.1;
    // Pulse the highlight ring
    if (ringRef.current && highlighted) {
      const scale = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.08;
      ringRef.current.scale.set(scale, scale, scale);
    }
  });

  const assetPositions = useMemo(() => {
    return zone.assets.map((_, i) => {
      const count = zone.assets.length;
      if (count === 1) return [0, 0.3, 0] as [number, number, number];
      const radius = Math.min(0.8, 0.35 * count);
      const angle = (i / count) * Math.PI * 2;
      return [
        Math.cos(angle) * radius,
        0.3,
        Math.sin(angle) * radius,
      ] as [number, number, number];
    });
  }, [zone.assets]);

  const s = PLATFORM_SIZE;

  return (
    <group ref={groupRef} position={position}>
      {/* Platform body */}
      <RoundedBox
        args={[s, 0.35, s]}
        radius={0.1}
        smoothness={4}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={dark ? color.clone().multiplyScalar(0.5) : color.clone().multiplyScalar(0.85)}
          emissive={emissiveColor}
          emissiveIntensity={highlighted ? 1.0 : selected ? 0.8 : riskOverlay && riskLevel ? 0.5 : dark ? 0.35 : 0.15}
          metalness={0.4}
          roughness={0.5}
          transparent
          opacity={dimmed ? 0.3 : 0.92}
        />
      </RoundedBox>

      {/* Glass top surface */}
      <mesh position={[0, 0.18, 0]} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <boxGeometry args={[s - 0.1, 0.02, s - 0.1]} />
        <meshStandardMaterial
          color={riskColor || config.color}
          transparent
          opacity={dimmed ? 0.1 : dark ? 0.2 : 0.12}
          metalness={0.9}
          roughness={0.05}
        />
      </mesh>

      {/* Selection ring */}
      {selected && !highlighted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
          <torusGeometry args={[s * 0.55, 0.06, 8, 48]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
      )}

      {/* Attack path highlight ring (pulsing) */}
      {highlighted && (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.22, 0]}>
          <torusGeometry args={[s * 0.6, 0.08, 8, 48]} />
          <meshBasicMaterial color={RISK_COLORS_3D[highlightRiskLevel || 'medium'] || '#3b82f6'} />
        </mesh>
      )}

      {/* Edge glow */}
      {dark && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(s, 0.35, s)]} />
          <lineBasicMaterial color={config.color} transparent opacity={0.5} />
        </lineSegments>
      )}

      {/* Zone name */}
      <Billboard position={[0, 1.0, 0]}>
        <Text
          fontSize={0.38}
          color={dark ? '#f1f5f9' : '#1e293b'}
          anchorX="center"
          anchorY="middle"
          maxWidth={s * 1.2}
          font={undefined}
          outlineWidth={dark ? 0.02 : 0}
          outlineColor="#000000"
        >
          {zone.name}
        </Text>
      </Billboard>

      {/* Type badge */}
      <Billboard position={[0, 0.6, 0]}>
        <Text
          fontSize={0.2}
          color={config.color}
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          {config.label}
        </Text>
      </Billboard>

      {/* Security Level label */}
      <Billboard position={[0, 0.38, 0]}>
        <Text
          fontSize={0.16}
          color={slConfig.bgColor}
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          {slConfig.label} — {slConfig.name}
        </Text>
      </Billboard>

      {/* Assets on platform */}
      {zone.assets.map((asset, i) => (
        <AssetObject
          key={asset.id}
          type={asset.type}
          position={assetPositions[i]}
          color={config.color}
        />
      ))}
    </group>
  );
}

// --- Conduit Data-Flow Particles ---

function FlowParticle({
  curve,
  offset,
  color,
  reverse,
}: {
  curve: THREE.QuadraticBezierCurve3;
  offset: number;
  color: string;
  reverse?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const raw = ((clock.getElapsedTime() * 0.12 + offset) % 1);
    const t = reverse ? 1 - raw : raw;
    const point = curve.getPointAt(t);
    ref.current.position.copy(point);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.1, 8, 8]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

/** Determine overall flow direction for a conduit based on its protocol flows. */
function getConduitDirection(conduit: Conduit): 'outbound' | 'inbound' | 'bidirectional' {
  const dirs = new Set(conduit.flows.map(f => f.direction));
  if (dirs.has('bidirectional')) return 'bidirectional';
  if (dirs.has('inbound') && dirs.has('outbound')) return 'bidirectional';
  if (dirs.has('inbound')) return 'inbound';
  if (dirs.has('outbound')) return 'outbound';
  return 'bidirectional'; // default when no flows
}

// --- Conduit Connection ---

function ConduitConnection({
  conduit,
  fromPos,
  toPos,
  selected,
  onClick,
  dark,
  tierGap,
  conduitIndex,
  highlighted,
  highlightRiskLevel,
  dimmed,
}: {
  conduit: Conduit;
  fromPos: [number, number, number];
  toPos: [number, number, number];
  selected: boolean;
  onClick: () => void;
  dark: boolean;
  tierGap: number;
  conduitIndex: number;
  highlighted?: boolean;
  highlightRiskLevel?: string;
  dimmed?: boolean;
}) {
  // For conduits that skip tiers, arc outward in Z to avoid passing through
  // intermediate platforms. Adjacent tiers get a small arc; skipping tiers
  // get increasingly larger Z offset.
  const skippedTiers = Math.max(0, tierGap - 1);
  const zOffset = skippedTiers * 4.0 * (conduitIndex % 2 === 0 ? 1 : -1);
  // Small upward arc for visual clarity
  const arcUp = 1.0 + tierGap * 0.3;

  const mid: [number, number, number] = [
    (fromPos[0] + toPos[0]) / 2,
    (fromPos[1] + toPos[1]) / 2 + arcUp,
    (fromPos[2] + toPos[2]) / 2 + zOffset,
  ];

  const highlightColor = highlightRiskLevel
    ? (RISK_COLORS_3D[highlightRiskLevel] || '#3b82f6')
    : '#3b82f6';
  const lineColor = highlighted
    ? highlightColor
    : conduit.requires_inspection
      ? '#f97316'
      : selected
        ? '#60a5fa'
        : dark ? '#94a3b8' : '#9ca3af';

  // Extract individual coordinates for stable useMemo dependencies
  const fx = fromPos[0], fy = fromPos[1], fz = fromPos[2];
  const mx = mid[0], my = mid[1], mz = mid[2];
  const tx = toPos[0], ty = toPos[1], tz = toPos[2];

  const curve = useMemo(() => {
    return new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(fx, fy, fz),
      new THREE.Vector3(mx, my, mz),
      new THREE.Vector3(tx, ty, tz)
    );
  }, [fx, fy, fz, mx, my, mz, tx, ty, tz]);

  const particleColor = conduit.requires_inspection ? '#fbbf24' : '#60a5fa';

  const tubeGeo = useMemo(() => {
    return new THREE.TubeGeometry(curve, 32, 0.2, 8, false);
  }, [curve]);

  return (
    <group>
      {/* Main line */}
      <QuadraticBezierLine
        start={fromPos}
        end={toPos}
        mid={mid}
        color={lineColor}
        lineWidth={highlighted ? 5 : selected ? 4 : 2.5}
        transparent={dimmed}
        opacity={dimmed ? 0.2 : 1}
      />

      {/* Outer glow */}
      {(dark || highlighted) && !dimmed && (
        <QuadraticBezierLine
          start={fromPos}
          end={toPos}
          mid={mid}
          color={lineColor}
          lineWidth={highlighted ? 14 : selected ? 10 : 6}
          transparent
          opacity={highlighted ? 0.25 : 0.12}
        />
      )}

      {/* Invisible hit target */}
      <mesh
        geometry={tubeGeo}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        visible={false}
      >
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Flow particles — direction-aware */}
      {(() => {
        const dir = getConduitDirection(conduit);
        if (dir === 'bidirectional') {
          // Half forward, half reverse
          return (
            <>
              {[0, 0.33, 0.67].map((offset, i) => (
                <FlowParticle key={`f${i}`} curve={curve} offset={offset} color={particleColor} />
              ))}
              {[0.17, 0.5, 0.83].map((offset, i) => (
                <FlowParticle key={`r${i}`} curve={curve} offset={offset} color={particleColor} reverse />
              ))}
            </>
          );
        }
        const reverse = dir === 'inbound';
        return [0, 0.17, 0.33, 0.5, 0.67, 0.83].map((offset, i) => (
          <FlowParticle key={i} curve={curve} offset={offset} color={particleColor} reverse={reverse} />
        ));
      })()}

      {/* Protocol label at midpoint */}
      {conduit.flows.length > 0 && (
        <Billboard position={[mid[0], mid[1] + 0.4, mid[2]]}>
          <Text
            fontSize={0.18}
            color={dark ? '#cbd5e1' : '#4b5563'}
            anchorX="center"
            anchorY="middle"
            font={undefined}
            outlineWidth={dark ? 0.015 : 0}
            outlineColor="#000000"
          >
            {conduit.flows.map(f => f.protocol).join(', ')}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

// --- HTML Overlays (rendered outside Canvas for stable positioning) ---

function HtmlOverlays({ zones, dark }: { zones: Zone[]; dark: boolean }) {
  const tiers = useMemo(() => {
    const types = new Set(zones.map(z => z.type));
    return Object.entries(ZONE_TYPE_CONFIG)
      .filter(([key]) => types.has(key as ZoneType))
      .sort((a, b) => b[1].level - a[1].level);
  }, [zones]);

  return (
    <>
      {/* Legend */}
      <div
        className={`absolute bottom-4 left-4 rounded-lg px-3 py-2 text-xs pointer-events-none select-none backdrop-blur-sm ${
          dark
            ? 'bg-gray-900/70 text-gray-300 border border-gray-700/50'
            : 'bg-white/70 text-gray-600 border border-gray-300/50'
        }`}
      >
        <div className="font-semibold mb-1.5 text-[11px] uppercase tracking-wider opacity-70">Purdue Model</div>
        {tiers.map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-2 py-0.5">
            <div
              className="w-3 h-3 rounded-sm shadow-sm"
              style={{ backgroundColor: cfg.color, boxShadow: dark ? `0 0 6px ${cfg.color}40` : 'none' }}
            />
            <span>{cfg.label} <span className="opacity-50">L{cfg.level}</span></span>
          </div>
        ))}
      </div>

      {/* Controls tip */}
      <div
        className={`absolute bottom-4 right-4 rounded-lg px-3 py-2 text-xs pointer-events-none select-none backdrop-blur-sm ${
          dark
            ? 'bg-gray-900/70 text-gray-500 border border-gray-700/50'
            : 'bg-white/70 text-gray-400 border border-gray-300/50'
        }`}
      >
        <span className="opacity-80">Orbit</span> Drag &nbsp;|&nbsp; <span className="opacity-80">Pan</span> Right-drag &nbsp;|&nbsp; <span className="opacity-80">Zoom</span> Scroll
      </div>
    </>
  );
}

// --- Main Scene ---

function Scene({
  project,
  selectedZone,
  selectedConduit,
  onSelectZone,
  onSelectConduit,
  dark,
  bgColor,
  riskOverlayEnabled,
  zoneRisks,
  highlightedPath,
}: Zone3DEditorProps & { dark: boolean; bgColor: string }) {
  const positions = useMemo(
    () => computeZonePositions(project.zones),
    [project.zones]
  );

  return (
    <>
      <color attach="background" args={[bgColor]} />
      <SceneLighting dark={dark} />
      <GridFloor dark={dark} />
      <AmbientParticles dark={dark} />

      {/* Zone platforms */}
      {project.zones.map((zone) => {
        const pos = positions.get(zone.id);
        if (!pos) return null;
        const risk = zoneRisks?.get(zone.id);
        const isInPath = highlightedPath?.zoneIds.has(zone.id) ?? false;
        const hasDimming = highlightedPath != null && !isInPath;
        return (
          <ZonePlatform
            key={zone.id}
            zone={zone}
            position={pos}
            selected={selectedZone?.id === zone.id}
            onClick={() => onSelectZone(zone)}
            dark={dark}
            riskLevel={risk?.level}
            riskOverlay={riskOverlayEnabled}
            highlighted={isInPath}
            highlightRiskLevel={isInPath ? highlightedPath?.riskLevel : undefined}
            dimmed={hasDimming}
          />
        );
      })}

      {/* Conduit connections */}
      {project.conduits.map((conduit, conduitIndex) => {
        const fromPos = positions.get(conduit.from_zone);
        const toPos = positions.get(conduit.to_zone);
        if (!fromPos || !toPos) return null;
        const fromZone = project.zones.find(z => z.id === conduit.from_zone);
        const toZone = project.zones.find(z => z.id === conduit.to_zone);
        const tierGap = (fromZone && toZone)
          ? Math.abs(ZONE_TYPE_CONFIG[fromZone.type].level - ZONE_TYPE_CONFIG[toZone.type].level)
          : 1;
        const isInPath = highlightedPath?.conduitIds.has(conduit.id) ?? false;
        const hasDimming = highlightedPath != null && !isInPath;
        return (
          <ConduitConnection
            key={conduit.id}
            conduit={conduit}
            fromPos={fromPos}
            toPos={toPos}
            selected={selectedConduit?.id === conduit.id}
            onClick={() => onSelectConduit(conduit)}
            dark={dark}
            tierGap={tierGap}
            conduitIndex={conduitIndex}
            highlighted={isInPath}
            highlightRiskLevel={isInPath ? highlightedPath?.riskLevel : undefined}
            dimmed={hasDimming}
          />
        );
      })}

      {/* Controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={5}
        maxDistance={50}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 10, 0]}
      />

      {/* Post-processing */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={dark ? 0.3 : 0.7}
          luminanceSmoothing={0.3}
          intensity={dark ? 1.2 : 0.2}
        />
      </EffectComposer>
    </>
  );
}

// --- Main Component ---

const Zone3DEditor = memo(function Zone3DEditor(props: Zone3DEditorProps) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const bgColor = dark ? '#070b14' : '#f1f5f9';

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [0, 16, 22], fov: 50 }}
        shadows
        onPointerMissed={() => {
          props.onSelectZone(undefined);
          props.onSelectConduit(undefined);
        }}
        style={{ background: bgColor }}
        gl={{ antialias: true, alpha: false }}
      >
        <fog attach="fog" args={[bgColor, 35, 65]} />
        <Scene {...props} dark={dark} bgColor={bgColor} />
      </Canvas>
      <HtmlOverlays zones={props.project.zones} dark={dark} />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-gray-800/80 text-gray-300 text-xs px-3 py-1.5 rounded-full backdrop-blur-sm pointer-events-none">
        3D View — Read Only
      </div>
    </div>
  );
});

export default Zone3DEditor;
