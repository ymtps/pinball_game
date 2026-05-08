import Matter from "matter-js";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG, COLLISION_CATEGORY } from "./types";

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

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Background - dark blue/purple gradient (Space Cadet style)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, "#0d0d2b");
  bgGrad.addColorStop(0.5, "#1a1a3e");
  bgGrad.addColorStop(1, "#0d0d2b");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Draw subtle grid lines for depth
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let y = 0; y < height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

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
    if (body.isSensor && body.label !== "drain") {
      // Don't render sensors (except for debug)
      continue;
    }
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

  // Render effects
  renderEffects(ctx);
  renderPopups(ctx);

  // Render plunger charge indicator
  renderPlungerGuide(ctx, config);
}

function renderBall(ctx: CanvasRenderingContext2D, body: Matter.Body, config: GameConfig) {
  const { x, y } = body.position;
  const r = config.ballRadius;
  const isOnRamp = body.collisionFilter.category === COLLISION_CATEGORY.RAMP;

  ctx.save();

  if (isOnRamp) {
    // Slightly smaller + shadow for elevation effect
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
  }

  // Metallic ball gradient
  const ballGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  ballGrad.addColorStop(0, "#ffffff");
  ballGrad.addColorStop(0.3, "#e0e0e0");
  ballGrad.addColorStop(0.7, "#a0a0a0");
  ballGrad.addColorStop(1, "#606060");

  ctx.beginPath();
  const drawR = isOnRamp ? r * 0.85 : r;
  ctx.arc(x, y, drawR, 0, Math.PI * 2);
  ctx.fillStyle = ballGrad;
  ctx.fill();

  ctx.restore();
}

function renderBumper(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const { x, y } = body.position;
  const r = body.circleRadius || 20;

  // Outer glow
  ctx.shadowColor = "#ff4444";
  ctx.shadowBlur = 15;

  // Metallic bumper gradient
  const grad = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r);
  grad.addColorStop(0, "#ff6666");
  grad.addColorStop(0.4, "#cc3333");
  grad.addColorStop(0.8, "#881111");
  grad.addColorStop(1, "#440000");

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Chrome ring
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#ff8888";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner highlight
  ctx.beginPath();
  ctx.arc(x - r * 0.15, y - r * 0.15, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fill();
}

function renderFlipper(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const vertices = body.vertices;
  const pos = body.position;

  // Metallic flipper gradient
  const grad = ctx.createLinearGradient(
    vertices[0].x, vertices[0].y,
    vertices[2].x, vertices[2].y
  );
  grad.addColorStop(0, "#c0c0c0");
  grad.addColorStop(0.3, "#e8e8e8");
  grad.addColorStop(0.5, "#ffffff");
  grad.addColorStop(0.7, "#c0c0c0");
  grad.addColorStop(1, "#808080");

  ctx.shadowColor = "rgba(100,200,255,0.5)";
  ctx.shadowBlur = 8;

  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function renderDropTarget(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const vertices = body.vertices;

  const grad = ctx.createLinearGradient(
    vertices[0].x, vertices[0].y,
    vertices[2].x, vertices[2].y
  );
  grad.addColorStop(0, "#44ff44");
  grad.addColorStop(0.5, "#22aa22");
  grad.addColorStop(1, "#116611");

  ctx.shadowColor = "#44ff44";
  ctx.shadowBlur = 8;

  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#66ff66";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function renderSlingshot(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const vertices = body.vertices;

  ctx.shadowColor = "#ffaa00";
  ctx.shadowBlur = 6;

  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();

  const grad = ctx.createLinearGradient(
    vertices[0].x, vertices[0].y,
    vertices[1].x, vertices[1].y
  );
  grad.addColorStop(0, "#ffcc00");
  grad.addColorStop(0.5, "#cc9900");
  grad.addColorStop(1, "#886600");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#ffdd44";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function renderWall(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const vertices = body.vertices;

  const grad = ctx.createLinearGradient(
    vertices[0].x, vertices[0].y,
    vertices[2].x, vertices[2].y
  );
  grad.addColorStop(0, "#3a3a5c");
  grad.addColorStop(0.5, "#4a4a6c");
  grad.addColorStop(1, "#2a2a4c");

  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "#5a5a7c";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function renderRampWall(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const vertices = body.vertices;

  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(100,100,200,0.3)";
  ctx.fill();
  ctx.strokeStyle = "rgba(150,150,255,0.5)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function renderPlungerGuide(ctx: CanvasRenderingContext2D, config: GameConfig) {
  const x = config.width - 30;
  const barY = config.height - 150;
  const barHeight = 80;
  const barWidth = 10;

  // Plunger track
  ctx.fillStyle = "#222";
  ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);
}

function renderEffects(ctx: CanvasRenderingContext2D) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 0, ${effect.alpha * 0.3})`;
    ctx.fill();

    ctx.shadowColor = effect.color;
    ctx.shadowBlur = effect.radius;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${effect.alpha * 0.5})`;
    ctx.fill();
    ctx.shadowBlur = 0;

    effect.radius += 2;
    effect.alpha -= 0.05;

    if (effect.alpha <= 0) {
      effects.splice(i, 1);
    }
  }
}

function renderPopups(ctx: CanvasRenderingContext2D) {
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";

  for (let i = popups.length - 1; i >= 0; i--) {
    const popup = popups[i];
    ctx.fillStyle = `rgba(255, 255, 100, ${popup.alpha})`;
    ctx.fillText(popup.text, popup.x, popup.y);

    popup.y += popup.dy;
    popup.alpha -= 0.02;

    if (popup.alpha <= 0) {
      popups.splice(i, 1);
    }
  }
}
