import { useEffect, useRef, memo } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface Zone {
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  pulsePhase: number;
}

interface Conduit {
  from: number;
  to: number;
  r: number;
  g: number;
  b: number;
}

interface DataPacket {
  conduitIndex: number;
  progress: number;
  speed: number;
}

// Subtle zone colors
const ZONE_CONFIGS = [
  { r: 14, g: 165, b: 233 },   // sky
  { r: 168, g: 85, b: 247 },   // purple
  { r: 34, g: 197, b: 94 },    // green
  { r: 251, g: 146, b: 60 },   // orange
  { r: 236, g: 72, b: 153 },   // pink
  { r: 56, g: 189, b: 248 },   // light blue
  { r: 129, g: 140, b: 248 },  // indigo
  { r: 52, g: 211, b: 153 },   // emerald
];

const DASH_PATTERN = [4, 4] as const;
const EMPTY_DASH: number[] = [];

const NetworkBackground = memo(() => {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const zonesRef = useRef<Zone[]>([]);
  const conduitsRef = useRef<Conduit[]>([]);
  const packetsRef = useRef<DataPacket[]>([]);
  const themeRef = useRef(theme);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Keep theme ref in sync without re-initializing animation
  useEffect(() => {
    themeRef.current = theme;
    // Invalidate cached grid when theme changes
    gridCanvasRef.current = null;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Invalidate cached grid on resize
      gridCanvasRef.current = null;
      initializeNetwork();
    };

    // Check if a new zone overlaps with existing zones
    const checkOverlap = (x: number, y: number, radius: number, zones: Zone[]): boolean => {
      const padding = 15;
      for (const zone of zones) {
        const dx = x - zone.x;
        const dy = y - zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < radius + zone.radius + padding) {
          return true;
        }
      }
      return false;
    };

    const initializeNetwork = () => {
      const w = canvas.width;
      const h = canvas.height;

      // Target number of zones based on screen size (capped to reduce CPU)
      const targetZones = Math.min(40, Math.floor((w * h) / 40000));
      zonesRef.current = [];

      // Place zones without overlap
      let attempts = 0;
      const maxAttempts = targetZones * 50;

      while (zonesRef.current.length < targetZones && attempts < maxAttempts) {
        attempts++;

        const config = ZONE_CONFIGS[zonesRef.current.length % ZONE_CONFIGS.length];
        const radius = 20 + Math.random() * 35;
        const x = radius + Math.random() * (w - radius * 2);
        const y = radius + Math.random() * (h - radius * 2);

        if (!checkOverlap(x, y, radius, zonesRef.current)) {
          zonesRef.current.push({
            x, y, radius,
            r: config.r, g: config.g, b: config.b,
            pulsePhase: Math.random() * Math.PI * 2,
          });
        }
      }

      // Create conduits between nearby zones
      conduitsRef.current = [];
      const zones = zonesRef.current;

      for (let i = 0; i < zones.length; i++) {
        const nearby: { index: number; dist: number }[] = [];

        for (let j = 0; j < zones.length; j++) {
          if (i !== j) {
            const dx = zones[i].x - zones[j].x;
            const dy = zones[i].y - zones[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 200) {
              nearby.push({ index: j, dist });
            }
          }
        }

        nearby.sort((a, b) => a.dist - b.dist);

        const count = Math.min(1 + Math.floor(Math.random() * 2), nearby.length);
        for (let k = 0; k < count; k++) {
          const exists = conduitsRef.current.find(
            c => (c.from === i && c.to === nearby[k].index) ||
                 (c.from === nearby[k].index && c.to === i)
          );

          if (!exists) {
            conduitsRef.current.push({
              from: i,
              to: nearby[k].index,
              r: zones[i].r, g: zones[i].g, b: zones[i].b,
            });
          }
        }
      }

      // Create data packets
      packetsRef.current = [];
      conduitsRef.current.forEach((_, idx) => {
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
          packetsRef.current.push({
            conduitIndex: idx,
            progress: Math.random(),
            speed: 0.002 + Math.random() * 0.003,
          });
        }
      });
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    let time = 0;
    let lastFrameTime = 0;
    const targetInterval = 1000 / 20; // 20fps

    const animate = (now: number) => {
      animationRef.current = requestAnimationFrame(animate);

      // Skip rendering when tab is hidden
      if (document.hidden) return;

      if (now - lastFrameTime < targetInterval) return;
      lastFrameTime = now;

      const w = canvas.width;
      const h = canvas.height;
      const isDark = themeRef.current === 'dark';

      // Draw cached grid background (only recreated on resize/theme change)
      if (!gridCanvasRef.current) {
        const gridCanvas = document.createElement('canvas');
        gridCanvas.width = w;
        gridCanvas.height = h;
        const gCtx = gridCanvas.getContext('2d')!;

        gCtx.fillStyle = isDark ? '#0f172a' : '#f1f5f9';
        gCtx.fillRect(0, 0, w, h);

        gCtx.strokeStyle = isDark ? 'rgba(30, 41, 59, 0.25)' : 'rgba(148, 163, 184, 0.12)';
        gCtx.lineWidth = 0.5;
        const gridSize = 50;

        gCtx.beginPath();
        for (let x = 0; x < w; x += gridSize) {
          gCtx.moveTo(x, 0);
          gCtx.lineTo(x, h);
        }
        for (let y = 0; y < h; y += gridSize) {
          gCtx.moveTo(0, y);
          gCtx.lineTo(w, y);
        }
        gCtx.stroke();
        gridCanvasRef.current = gridCanvas;
      }
      ctx.drawImage(gridCanvasRef.current, 0, 0);

      const zones = zonesRef.current;
      const conduits = conduitsRef.current;
      const packets = packetsRef.current;

      time += 0.012;

      // Opacity multipliers for light vs dark
      const fillOpacity = isDark ? 0.025 : 0.04;
      const borderOpacity = isDark ? 0.2 : 0.25;
      const conduitOpacity = isDark ? 0.12 : 0.15;
      const dotOpacity = isDark ? 0.5 : 0.4;

      // Draw conduits (pre-computed RGB, no regex)
      conduits.forEach(conduit => {
        const from = zones[conduit.from];
        const to = zones[conduit.to];
        if (!from || !to) return;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const nx = dx / dist;
        const ny = dy / dist;

        const startX = from.x + nx * from.radius;
        const startY = from.y + ny * from.radius;
        const endX = to.x - nx * to.radius;
        const endY = to.y - ny * to.radius;

        ctx.strokeStyle = `rgba(${conduit.r},${conduit.g},${conduit.b},${conduitOpacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      });

      // Draw packets (simple filled circles instead of radial gradients)
      packets.forEach(packet => {
        const conduit = conduits[packet.conduitIndex];
        if (!conduit) return;

        const from = zones[conduit.from];
        const to = zones[conduit.to];
        if (!from || !to) return;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const nx = dx / dist;
        const ny = dy / dist;

        const startX = from.x + nx * from.radius;
        const startY = from.y + ny * from.radius;
        const endX = to.x - nx * to.radius;
        const endY = to.y - ny * to.radius;

        const px = startX + (endX - startX) * packet.progress;
        const py = startY + (endY - startY) * packet.progress;

        // Simple filled circle (much cheaper than createRadialGradient per frame)
        ctx.fillStyle = `rgba(${conduit.r},${conduit.g},${conduit.b},${isDark ? 0.8 : 0.5})`;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();

        packet.progress += packet.speed;
        if (packet.progress > 1) packet.progress = 0;
      });

      // Draw zones (pre-computed RGB, cached dash pattern)
      ctx.setLineDash(DASH_PATTERN as unknown as number[]);
      zones.forEach(zone => {
        const pulse = Math.sin(time + zone.pulsePhase) * 0.06 + 1;
        const r = zone.radius * pulse;

        // Subtle fill
        ctx.fillStyle = `rgba(${zone.r},${zone.g},${zone.b},${fillOpacity})`;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Dashed border
        ctx.strokeStyle = `rgba(${zone.r},${zone.g},${zone.b},${borderOpacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Tiny center dot
        ctx.fillStyle = `rgba(${zone.r},${zone.g},${zone.b},${dotOpacity})`;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.setLineDash(EMPTY_DASH);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
});

NetworkBackground.displayName = 'NetworkBackground';

export default NetworkBackground;
