import Matter from "matter-js";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG, COLLISION_CATEGORY } from "./types";
import { LAUNCH_LANE, PLAYFIELD_WIDTH } from "./engine";

// Visual effects queue
interface HitEffect {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: string;
}

interface ScorePopup {
  x: number;
  y: number;
  text: string;
  alpha: number;
  dy: number;
}

const effects: HitEffect[] = [];
const popups: ScorePopup[] = [];

export function addHitEffect(x: number, y: number, color: string = "#ff0") {
  effects.push({ x, y, radius: 5, alpha: 1.0, color });
}

export function addScorePopup(x: number, y: number, points: number) {
  popups.push({ x, y, text: `+${points}`, alpha: 1.0, dy: -2 });
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  engine: Matter.Engine,
  config: GameConfig = DEFAULT_CONFIG
) {
  const { width, height } = config;

  ctx.clearRect(0, 0, width, height);

  // ── Table background ──
  renderTableBackground(ctx, width, height);

  // ── Decorative elements (drawn behind physics objects) ──
  renderDecorations(ctx, width, height);

  const bodies = engine.world.bodies;

  // Sort: walls first, then elements, then ball on top
  const sorted = [...bodies].sort((a, b) => {
    const order = (label: string) => {
      if (label === "ball") return 10;
      if (label.startsWith("flipper")) return 8;
      if (label === "bumper") return 6;
      if (label === "drop-target") return 5;
      return 1;
    };
    return order(a.label) - order(b.label);
  });

  for (const body of sorted) {
    if (body.isSensor && body.label !== "drain") continue;
    if (!body.render.visible) continue;

    ctx.save();
    switch (body.label) {
      case "ball":
        renderBall(ctx, body, config);
        break;
      case "bumper":
        renderBumper(ctx, body);
        break;
      case "flipper-left":
      case "flipper-right":
        renderFlipper(ctx, body);
        break;
      case "drop-target":
        renderDropTarget(ctx, body);
        break;
      case "slingshot":
        renderSlingshot(ctx, body);
        break;
      case "wall":
      case "lane-wall":
        renderWall(ctx, body);
        break;
      case "ramp-wall":
        renderRampWall(ctx, body);
        break;
      default:
        break;
    }
    ctx.restore();
  }

  renderEffects(ctx);
  renderPopups(ctx);
  renderLaunchLane(ctx, config);
  renderTableFrame(ctx, width, height);
}

// ── Table Background ──
function renderTableBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Deep space gradient
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#0a0820");
  bg.addColorStop(0.3, "#12103a");
  bg.addColorStop(0.6, "#1a1048");
  bg.addColorStop(1, "#0a0820");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Purple/blue nebula glow in center
  const nebula = ctx.createRadialGradient(w * 0.4, h * 0.35, 10, w * 0.4, h * 0.35, w * 0.6);
  nebula.addColorStop(0, "rgba(80, 20, 120, 0.25)");
  nebula.addColorStop(0.5, "rgba(40, 10, 80, 0.12)");
  nebula.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = nebula;
  ctx.fillRect(0, 0, w, h);

  // Stars
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  const starPositions = [
    [30, 50], [80, 120], [150, 30], [250, 90], [300, 160],
    [60, 250], [200, 300], [100, 400], [280, 450], [40, 500],
    [180, 550], [320, 350], [140, 180], [230, 220], [50, 620],
  ];
  for (const [sx, sy] of starPositions) {
    const size = Math.random() > 0.7 ? 1.5 : 1;
    ctx.beginPath();
    ctx.arc(sx % w, sy % h, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Decorative overlays ──
function renderDecorations(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Subtle triangular markers near top
  ctx.strokeStyle = "rgba(100, 60, 160, 0.3)";
  ctx.lineWidth = 1;

  // Decorative lines near bumper area
  ctx.beginPath();
  ctx.moveTo(w * 0.15, h * 0.15);
  ctx.lineTo(w * 0.5, h * 0.08);
  ctx.lineTo(w * 0.85, h * 0.15);
  ctx.stroke();

  // Orbit ring decoration around bumper area
  ctx.strokeStyle = "rgba(60, 40, 120, 0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.3, w * 0.3, h * 0.08, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// ── Table frame (beveled metallic border) ──
function renderTableFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const t = 3;
  // Outer highlight
  ctx.strokeStyle = "#4a4a6a";
  ctx.lineWidth = t;
  ctx.strokeRect(t / 2, t / 2, w - t, h - t);
  // Inner shadow
  ctx.strokeStyle = "#1a1a2a";
  ctx.lineWidth = 1;
  ctx.strokeRect(t + 1, t + 1, w - t * 2 - 2, h - t * 2 - 2);
}

// ── Ball ──
function renderBall(ctx: CanvasRenderingContext2D, body: Matter.Body, config: GameConfig) {
  const { x, y } = body.position;
  const r = config.ballRadius;
  const isOnRamp = body.collisionFilter.category === COLLISION_CATEGORY.RAMP;

  ctx.save();
  if (isOnRamp) {
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
  }

  // Shiny metallic ball
  const drawR = isOnRamp ? r * 0.85 : r;
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.05, x, y, drawR);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.2, "#f0f0f0");
  grad.addColorStop(0.5, "#b0b0b0");
  grad.addColorStop(0.8, "#707070");
  grad.addColorStop(1, "#404040");

  ctx.beginPath();
  ctx.arc(x, y, drawR, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Edge highlight ring
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.restore();
}

// ── Bumper ──
function renderBumper(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const { x, y } = body.position;
  const r = body.circleRadius || 20;

  // Outer glow ring
  ctx.shadowColor = "#6644cc";
  ctx.shadowBlur = 20;

  // Base ring (dark metal)
  ctx.beginPath();
  ctx.arc(x, y, r + 3, 0, Math.PI * 2);
  const ringGrad = ctx.createRadialGradient(x, y, r - 2, x, y, r + 3);
  ringGrad.addColorStop(0, "#554488");
  ringGrad.addColorStop(0.5, "#332266");
  ringGrad.addColorStop(1, "#221144");
  ctx.fillStyle = ringGrad;
  ctx.fill();

  ctx.shadowBlur = 0;

  // Inner dome (lit up)
  const domeGrad = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.05, x, y, r);
  domeGrad.addColorStop(0, "#ff9966");
  domeGrad.addColorStop(0.3, "#ee6633");
  domeGrad.addColorStop(0.7, "#aa3311");
  domeGrad.addColorStop(1, "#661100");
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = domeGrad;
  ctx.fill();

  // Chrome ring outline
  ctx.strokeStyle = "#8866aa";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Bright specular highlight
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.25, r * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,220,0.45)";
  ctx.fill();
}

// ── Flipper ──
function renderFlipper(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const vertices = body.vertices;

  const grad = ctx.createLinearGradient(
    vertices[0].x, vertices[0].y,
    vertices[2].x, vertices[2].y
  );
  grad.addColorStop(0, "#8888aa");
  grad.addColorStop(0.2, "#bbbbdd");
  grad.addColorStop(0.4, "#ddddf0");
  grad.addColorStop(0.6, "#bbbbdd");
  grad.addColorStop(1, "#6666888");

  ctx.shadowColor = "rgba(120,140,255,0.6)";
  ctx.shadowBlur = 10;

  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowBlur = 0;
  // Beveled edge
  ctx.strokeStyle = "#aaaacc";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ── Drop target ──
function renderDropTarget(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const vertices = body.vertices;

  ctx.shadowColor = "#00ff88";
  ctx.shadowBlur = 10;

  const grad = ctx.createLinearGradient(
    vertices[0].x, vertices[0].y,
    vertices[2].x, vertices[2].y
  );
  grad.addColorStop(0, "#33ff88");
  grad.addColorStop(0.5, "#22cc66");
  grad.addColorStop(1, "#118844");

  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#44ffaa";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ── Slingshot ──
function renderSlingshot(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const vertices = body.vertices;

  ctx.shadowColor = "#ffaa22";
  ctx.shadowBlur = 8;

  const grad = ctx.createLinearGradient(
    vertices[0].x, vertices[0].y,
    vertices[1].x, vertices[1].y
  );
  grad.addColorStop(0, "#ffcc44");
  grad.addColorStop(0.5, "#cc8800");
  grad.addColorStop(1, "#885500");

  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#ffdd66";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ── Wall ──
function renderWall(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const vertices = body.vertices;

  // Beveled metallic wall
  const grad = ctx.createLinearGradient(
    vertices[0].x, vertices[0].y,
    vertices[2].x, vertices[2].y
  );
  grad.addColorStop(0, "#3d3d60");
  grad.addColorStop(0.3, "#505078");
  grad.addColorStop(0.5, "#5a5a85");
  grad.addColorStop(0.7, "#505078");
  grad.addColorStop(1, "#2d2d48");

  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Beveled edge highlights
  ctx.strokeStyle = "#6a6a90";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ── Ramp wall ──
function renderRampWall(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const vertices = body.vertices;

  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(80,60,140,0.3)";
  ctx.fill();
  ctx.strokeStyle = "rgba(120,100,200,0.5)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ── Launch lane ──
function renderLaunchLane(ctx: CanvasRenderingContext2D, config: GameConfig) {
  const laneX = LAUNCH_LANE.wallX;
  const laneW = config.width - laneX;

  // Dark lane background
  const laneGrad = ctx.createLinearGradient(laneX, 0, laneX + laneW, 0);
  laneGrad.addColorStop(0, "rgba(15,10,30,0.7)");
  laneGrad.addColorStop(0.5, "rgba(20,15,40,0.5)");
  laneGrad.addColorStop(1, "rgba(15,10,30,0.7)");
  ctx.fillStyle = laneGrad;
  ctx.fillRect(laneX, 0, laneW, config.height);

  // Plunger track
  const x = LAUNCH_LANE.centerX;
  const trackY = config.height - 120;
  const trackH = 80;
  const trackW = 8;

  // Track groove
  ctx.fillStyle = "#151525";
  ctx.fillRect(x - trackW / 2, trackY, trackW, trackH);
  ctx.strokeStyle = "#2a2a45";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - trackW / 2, trackY, trackW, trackH);

  // Plunger head
  ctx.fillStyle = "#666688";
  ctx.fillRect(x - 6, config.height - 50, 12, 16);
  ctx.strokeStyle = "#8888aa";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 6, config.height - 50, 12, 16);
}

// ── Effects ──
function renderEffects(ctx: CanvasRenderingContext2D) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];

    // Glow ring
    ctx.shadowColor = e.color;
    ctx.shadowBlur = e.radius * 1.5;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${e.alpha * 0.4})`;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Expanding ring
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,200,${e.alpha * 0.5})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    e.radius += 2.5;
    e.alpha -= 0.04;
    if (e.alpha <= 0) effects.splice(i, 1);
  }
}

// ── Score popups ──
function renderPopups(ctx: CanvasRenderingContext2D) {
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";

  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    // Shadow
    ctx.fillStyle = `rgba(0,0,0,${p.alpha * 0.5})`;
    ctx.fillText(p.text, p.x + 1, p.y + 1);
    // Text
    ctx.fillStyle = `rgba(255,255,120,${p.alpha})`;
    ctx.fillText(p.text, p.x, p.y);

    p.y += p.dy;
    p.alpha -= 0.02;
    if (p.alpha <= 0) popups.splice(i, 1);
  }
}
