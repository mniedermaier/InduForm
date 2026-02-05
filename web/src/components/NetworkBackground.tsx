import { useEffect, useRef, memo } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface Zone {
  x: number;
  y: number;
  radius: number;
  color: string;
  borderColor: string;
  pulsePhase: number;
}

interface Conduit {
  from: number;
  to: number;
  color: string;
}

interface DataPacket {
  conduitIndex: number;
  progress: number;
  speed: number;
}

// Subtle zone colors (used for both themes, with opacity adjustments at render time)
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

const NetworkBackground = memo(() => {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const zonesRef = useRef<Zone[]>([]);
  const conduitsRef = useRef<Conduit[]>([]);
  const packetsRef = useRef<DataPacket[]>([]);
  const themeRef = useRef(theme);

  // Keep theme ref in sync without re-initializing animation
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initializeNetwork();
    };

    // Check if a new zone overlaps with existing zones
    const checkOverlap = (x: number, y: number, radius: number, zones: Zone[]): boolean => {
      const padding = 15; // Minimum gap between zones
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

      // Target number of zones based on screen size
      const targetZones = Math.floor((w * h) / 25000);
      zonesRef.current = [];

      // Place zones without overlap
      let attempts = 0;
      const maxAttempts = targetZones * 50;

      while (zonesRef.current.length < targetZones && attempts < maxAttempts) {
        attempts++;

        const config = ZONE_CONFIGS[zonesRef.current.length % ZONE_CONFIGS.length];
        const radius = 20 + Math.random() * 35; // 20-55px radius
        const x = radius + Math.random() * (w - radius * 2);
        const y = radius + Math.random() * (h - radius * 2);

        if (!checkOverlap(x, y, radius, zonesRef.current)) {
          zonesRef.current.push({
            x,
            y,
            radius,
            color: `rgba(${config.r}, ${config.g}, ${config.b}, 0.025)`,
            borderColor: `rgba(${config.r}, ${config.g}, ${config.b}, 0.2)`,
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

        // Connect to 1-2 nearest
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
              color: zones[i].borderColor,
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

    const animate = () => {
      const w = canvas.width;
      const h = canvas.height;
      const isDark = themeRef.current === 'dark';

      // Theme-aware background
      ctx.fillStyle = isDark ? '#0f172a' : '#f1f5f9';
      ctx.fillRect(0, 0, w, h);

      // Theme-aware grid
      ctx.strokeStyle = isDark ? 'rgba(30, 41, 59, 0.25)' : 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 0.5;
      const gridSize = 50;

      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const zones = zonesRef.current;
      const conduits = conduitsRef.current;
      const packets = packetsRef.current;

      time += 0.012;

      // Opacity multipliers for light vs dark
      const fillOpacity = isDark ? 0.025 : 0.04;
      const borderOpacity = isDark ? 0.2 : 0.25;
      const conduitOpacity = isDark ? 0.12 : 0.15;
      const dotOpacity = isDark ? 0.5 : 0.4;

      // Draw conduits
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

        // Extract RGB from border color and apply theme opacity
        const rgb = conduit.color.match(/\d+/g);
        if (rgb) {
          ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${conduitOpacity})`;
        }
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      });

      // Draw packets
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

        // Small glowing packet - adjust for theme
        const rgb = conduit.color.match(/\d+/g);
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 5);
        if (isDark) {
          glow.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        } else {
          glow.addColorStop(0, 'rgba(100, 100, 120, 0.6)');
        }
        if (rgb) {
          glow.addColorStop(0.4, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.4)`);
        }
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();

        packet.progress += packet.speed;
        if (packet.progress > 1) packet.progress = 0;
      });

      // Draw zones
      zones.forEach(zone => {
        const pulse = Math.sin(time + zone.pulsePhase) * 0.06 + 1;
        const r = zone.radius * pulse;

        // Extract RGB from zone colors
        const rgb = zone.borderColor.match(/\d+/g);

        // Subtle fill with theme-aware opacity
        if (rgb) {
          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${fillOpacity})`;
        } else {
          ctx.fillStyle = zone.color;
        }
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Dashed border with theme-aware opacity
        if (rgb) {
          ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${borderOpacity})`;
        } else {
          ctx.strokeStyle = zone.borderColor;
        }
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tiny center dot
        if (rgb) {
          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${dotOpacity})`;
        } else {
          ctx.fillStyle = zone.borderColor.replace('0.2', '0.5');
        }
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

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
