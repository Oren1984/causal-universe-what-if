import type { VarId, WorldState } from "./types";

type RGB = [number, number, number];

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number, alpha = 1): string => {
  const k = clamp01(t);
  return `rgba(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))},${alpha})`;
};

/** Small deterministic PRNG so both worlds get the same layout. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HORIZON = 0.5;
const POND = { x: 0.3, y: 0.79, rx: 0.2, ry: 0.085 };
const MAX_CREATURES = 20;
const CREATURE_COLORS: RGB[] = [[255, 196, 87], [110, 220, 200], [244, 143, 177], [170, 190, 255]];

// Where the highlight ring is drawn when a variable is intervened on.
const ANCHORS: Record<VarId, { x: number; y: number; r: number }> = {
  sunlight: { x: 0.82, y: 0.17, r: 0.1 },
  rainfall: { x: 0.45, y: 0.2, r: 0.22 },
  water: { x: POND.x, y: POND.y, r: 0.2 },
  vegetation: { x: 0.68, y: 0.68, r: 0.2 },
  food: { x: 0.68, y: 0.66, r: 0.17 },
  creatures: { x: 0.55, y: 0.86, r: 0.2 },
  health: { x: 0.5, y: 0.5, r: 0.3 },
};

interface Plant { x: number; y: number; thr: number; kind: 0 | 1 | 2; size: number; phase: number }
interface Berry { plant: number; dx: number; dy: number; thr: number }
interface Creature { x: number; y: number; speed: number; phase: number; color: RGB }

export interface DrawOptions {
  /** Ambient animation clock in seconds. Frozen when motion is reduced. */
  clock: number;
  /** Variable to ring with the intervention highlight, if any. */
  pulse: VarId | null;
}

/**
 * Draws one ecosystem. Everything that carries scientific meaning (rain
 * density, pond size, plant cover, fruit, creature count, overall tint) is a
 * function of the WorldState passed in; layout and wandering paths are fixed
 * decoration shared by both worlds.
 */
export class WorldRenderer {
  private ctx: CanvasRenderingContext2D | null;
  private plants: Plant[] = [];
  private berries: Berry[] = [];
  private creatures: Creature[] = [];
  private drops: { x: number; y: number; speed: number }[] = [];
  private clouds: { x: number; y: number; size: number; speed: number }[] = [];

  constructor(private canvas: HTMLCanvasElement, layoutSeed = 7) {
    this.ctx = canvas.getContext("2d");
    const rand = mulberry32(layoutSeed);
    while (this.plants.length < 46) {
      const x = 0.03 + rand() * 0.94;
      const y = HORIZON + 0.07 + rand() * 0.4;
      const inPond = ((x - POND.x) / (POND.rx + 0.03)) ** 2 + ((y - POND.y) / (POND.ry + 0.04)) ** 2 < 1;
      if (inPond) continue;
      const roll = rand();
      this.plants.push({ x, y, thr: rand(), kind: roll < 0.22 ? 0 : roll < 0.55 ? 1 : 2, size: 0.7 + rand() * 0.6, phase: rand() * 6.28 });
    }
    this.plants.sort((a, b) => a.y - b.y);
    this.plants.forEach((plant, index) => {
      if (plant.kind === 2) return;
      for (let k = 0; k < 3; k++) this.berries.push({ plant: index, dx: rand() - 0.5, dy: rand(), thr: rand() });
    });
    for (let k = 0; k < MAX_CREATURES; k++) {
      this.creatures.push({
        x: 0.1 + rand() * 0.8,
        y: HORIZON + 0.2 + rand() * 0.26,
        speed: 0.6 + rand() * 0.8,
        phase: rand() * 6.28,
        color: CREATURE_COLORS[k % CREATURE_COLORS.length],
      });
    }
    for (let k = 0; k < 150; k++) this.drops.push({ x: rand(), y: rand(), speed: 0.9 + rand() * 0.6 });
    for (let k = 0; k < 7; k++) this.clouds.push({ x: rand(), y: 0.06 + rand() * 0.2, size: 0.7 + rand() * 0.7, speed: 0.004 + rand() * 0.006 });
  }

  /** Match the backing store to the displayed size. */
  resize(): void {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(this.canvas.clientWidth * ratio);
    const height = Math.round(this.canvas.clientHeight * ratio);
    if (width && height && (this.canvas.width !== width || this.canvas.height !== height)) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  draw(s: WorldState, { clock, pulse }: DrawOptions): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ellipse = (x: number, y: number, rx: number, ry: number): void => {
      ctx.beginPath();
      ctx.ellipse(x * W, y * H, Math.max(0.1, rx * W), Math.max(0.1, ry * H), 0, 0, Math.PI * 2);
    };

    // Sky: brighter with sunlight, heavier with rain.
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON * H);
    sky.addColorStop(0, mix([9, 14, 38], [34, 92, 168], s.sunlight));
    sky.addColorStop(1, mix([34, 42, 74], [128, 190, 226], s.sunlight));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(22,28,44,${s.rainfall * s.rainfall * 0.5})`;
    ctx.fillRect(0, 0, W, HORIZON * H);

    // Sun.
    const sun = ctx.createRadialGradient(0.82 * W, 0.17 * H, 0, 0.82 * W, 0.17 * H, 0.16 * W);
    sun.addColorStop(0, `rgba(255,236,170,${0.25 + 0.75 * s.sunlight})`);
    sun.addColorStop(0.25, `rgba(255,214,120,${0.12 + 0.5 * s.sunlight})`);
    sun.addColorStop(1, "rgba(255,214,120,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, HORIZON * H);

    // Distant hills, greener with vegetation.
    for (const [base, amp, shade] of [[0.42, 0.05, 0.55], [0.47, 0.035, 0.75]] as const) {
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= 1.001; x += 0.02) ctx.lineTo(x * W, (base - amp * Math.sin(x * 7 + base * 40) - amp * 0.5 * Math.sin(x * 17)) * H);
      ctx.lineTo(W, H);
      ctx.fillStyle = mix([58 * shade, 50 * shade, 52 * shade], [30 * shade, 104 * shade, 84 * shade], s.vegetation * 1.2);
      ctx.fill();
    }

    // Ground: dry tan to lush green.
    const lush = s.vegetation * 0.75 + s.water * 0.25;
    const ground = ctx.createLinearGradient(0, HORIZON * H, 0, H);
    ground.addColorStop(0, mix([128, 104, 70], [44, 110, 66], lush));
    ground.addColorStop(1, mix([78, 60, 42], [20, 62, 44], lush));
    ctx.fillStyle = ground;
    ctx.fillRect(0, HORIZON * H, W, H);

    // Pond: the dry bed marks its full extent, the water area tracks the state.
    ellipse(POND.x, POND.y, POND.rx, POND.ry);
    ctx.fillStyle = "rgba(64,50,38,0.85)";
    ctx.fill();
    const level = Math.sqrt(clamp01(s.water));
    if (level > 0.02) {
      ellipse(POND.x, POND.y, POND.rx * level, POND.ry * level);
      const water = ctx.createLinearGradient(0, (POND.y - POND.ry) * H, 0, (POND.y + POND.ry) * H);
      water.addColorStop(0, mix([40, 92, 150], [96, 190, 236], s.sunlight));
      water.addColorStop(1, "rgb(24,70,140)");
      ctx.fillStyle = water;
      ctx.fill();
      ctx.strokeStyle = "rgba(220,240,255,0.5)";
      ctx.lineWidth = Math.max(1, W * 0.0025);
      for (let k = 0; k < 3; k++) {
        const offset = Math.sin(clock * 0.8 + k * 2.1) * 0.25;
        ctx.beginPath();
        ctx.ellipse(POND.x * W + offset * POND.rx * level * W, (POND.y + (k - 1) * 0.3 * POND.ry * level) * H, POND.rx * level * 0.3 * W, POND.ry * level * 0.12 * H, 0, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    }

    // Plants: how many have sprouted, and how tall, depends on vegetation.
    const leaf: RGB = [lerp(156, 62, clamp01(s.water * 1.4)), lerp(138, 192, clamp01(s.water * 1.4)), lerp(64, 96, clamp01(s.water * 1.4))];
    const tops: ({ x: number; y: number; r: number } | null)[] = [];
    for (const plant of this.plants) {
      const grown = clamp01((s.vegetation - plant.thr * 0.75) / 0.2);
      if (grown <= 0.01) {
        tops.push(null);
        continue;
      }
      const depth = 0.55 + (plant.y - HORIZON) * 1.1;
      const unit = 0.045 * W * plant.size * depth * (0.35 + 0.65 * grown);
      const sway = Math.sin(clock * 1.4 + plant.phase) * unit * 0.06;
      const x = plant.x * W;
      const y = plant.y * H;
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(x, y, unit * 0.7, unit * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      if (plant.kind === 0) {
        ctx.fillStyle = "rgb(92,66,48)";
        ctx.fillRect(x - unit * 0.09, y - unit * 1.2, unit * 0.18, unit * 1.2);
        for (const [dx, dy, r, light] of [[-0.42, -1.3, 0.55, 0.78], [0.42, -1.35, 0.5, 0.88], [0, -1.8, 0.62, 1]] as const) {
          ctx.fillStyle = mix([0, 0, 0], leaf, light);
          ctx.beginPath();
          ctx.arc(x + dx * unit + sway, y + dy * unit, r * unit, 0, Math.PI * 2);
          ctx.fill();
        }
        tops.push({ x: x + sway, y: y - unit * 1.6, r: unit * 0.85 });
      } else if (plant.kind === 1) {
        for (const [dx, dy, r, light] of [[-0.3, -0.35, 0.42, 0.8], [0.3, -0.38, 0.4, 0.9], [0, -0.6, 0.45, 1]] as const) {
          ctx.fillStyle = mix([0, 0, 0], leaf, light);
          ctx.beginPath();
          ctx.arc(x + dx * unit + sway * 0.5, y + dy * unit, r * unit, 0, Math.PI * 2);
          ctx.fill();
        }
        tops.push({ x: x + sway * 0.5, y: y - unit * 0.45, r: unit * 0.55 });
      } else {
        ctx.strokeStyle = mix([0, 0, 0], leaf, 0.95);
        ctx.lineWidth = Math.max(1, unit * 0.07);
        ctx.lineCap = "round";
        for (let b = -2; b <= 2; b++) {
          ctx.beginPath();
          ctx.moveTo(x + b * unit * 0.1, y);
          ctx.quadraticCurveTo(x + b * unit * 0.16, y - unit * 0.35, x + b * unit * 0.26 + sway, y - unit * (0.62 - Math.abs(b) * 0.09));
          ctx.stroke();
        }
        tops.push(null);
      }
    }

    // Fruit: more of it appears as food rises.
    for (const berry of this.berries) {
      const top = tops[berry.plant];
      if (!top || s.food <= berry.thr * 0.7) continue;
      const ripe = clamp01((s.food - berry.thr * 0.7) / 0.08);
      ctx.fillStyle = `rgba(255,112,96,${ripe})`;
      ctx.beginPath();
      ctx.arc(top.x + berry.dx * top.r * 1.5, top.y + (berry.dy - 0.5) * top.r, Math.max(1.5, W * 0.0055), 0, Math.PI * 2);
      ctx.fill();
    }

    // Creatures: the number alive is creatures * 20; they hop more when fed.
    const alive = s.creatures * MAX_CREATURES;
    this.creatures.forEach((c, k) => {
      const alpha = clamp01(alive - k);
      if (alpha <= 0) return;
      const drift = clock * 0.35 * c.speed + c.phase;
      const x = (c.x + 0.07 * Math.sin(drift)) * W;
      const hop = Math.abs(Math.sin(clock * 3.2 * c.speed + c.phase)) * 0.012 * H * (0.4 + s.food);
      const groundY = (c.y + 0.018 * Math.sin(drift * 0.7 + 1)) * H;
      const r = W * 0.016 * (0.7 + (c.y - HORIZON) * 0.9);
      const facing = Math.cos(drift) >= 0 ? 1 : -1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(x, groundY + r * 0.9, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mix(c.color, c.color, 1);
      ctx.beginPath();
      ctx.ellipse(x, groundY - hop, r, r * 0.86, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - facing * r * 0.5, groundY - hop - r * 0.95, r * 0.22, r * 0.5, facing * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#10151f";
      ctx.beginPath();
      ctx.arc(x + facing * r * 0.45, groundY - hop - r * 0.2, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Clouds and rain: cover and drop count follow rainfall.
    this.clouds.forEach((cloud, k) => {
      const alpha = clamp01((s.rainfall - 0.12) * 1.7 - k * 0.13) * 0.85;
      if (alpha <= 0) return;
      const x = ((cloud.x + clock * cloud.speed) % 1.3) - 0.15;
      ctx.fillStyle = mix([226, 232, 244], [108, 118, 140], s.rainfall, alpha);
      for (const [dx, dy, r] of [[-0.05, 0.008, 0.035], [0, -0.01, 0.048], [0.05, 0.006, 0.038], [0.02, 0.018, 0.04]] as const) {
        ellipse(x + dx * cloud.size, cloud.y + dy, r * cloud.size, r * cloud.size * 0.9 * (W / H));
        ctx.fill();
      }
    });
    const dropCount = Math.floor(s.rainfall ** 1.6 * this.drops.length);
    ctx.strokeStyle = "rgba(176,214,255,0.55)";
    ctx.lineWidth = Math.max(1, W * 0.0018);
    ctx.beginPath();
    for (let k = 0; k < dropCount; k++) {
      const drop = this.drops[k];
      const y = ((drop.y + clock * drop.speed) % 1) * 0.9 + 0.08;
      const x = (drop.x + y * 0.06) % 1;
      ctx.moveTo(x * W, y * H);
      ctx.lineTo((x + 0.004) * W, (y + 0.035) * H);
    }
    ctx.stroke();

    // Overall tint: an unhealthy world looks washed out.
    ctx.fillStyle = `rgba(58,46,40,${(1 - s.health) * 0.38})`;
    ctx.fillRect(0, 0, W, H);

    if (pulse) {
      const anchor = ANCHORS[pulse];
      const beat = (clock * 0.9) % 1;
      for (const phase of [beat, (beat + 0.5) % 1]) {
        ctx.strokeStyle = `rgba(255,170,110,${0.9 * (1 - phase)})`;
        ctx.lineWidth = Math.max(2, W * 0.005);
        ctx.beginPath();
        ctx.arc(anchor.x * W, anchor.y * H, anchor.r * W * (0.55 + 0.6 * phase), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
