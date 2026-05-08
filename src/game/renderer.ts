import Matter from "matter-js";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG } from "./types";

export function renderGame(
  ctx: CanvasRenderingContext2D,
  engine: Matter.Engine,
  config: GameConfig = DEFAULT_CONFIG
) {
  const { width, height } = config;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, width, height);

  const bodies = engine.world.bodies;

  for (const body of bodies) {
    if (!body.render.visible) continue;

    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);

    if (body.label === "ball") {
      renderBall(ctx, body, config);
    } else if (body.circleRadius) {
      renderCircle(ctx, body);
    } else {
      renderPolygon(ctx, body);
    }

    ctx.restore();
  }
}

function renderBall(
  ctx: CanvasRenderingContext2D,
  body: Matter.Body,
  config: GameConfig
) {
  const r = config.ballRadius;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = "#c0c0c0";
  ctx.fill();
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function renderCircle(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const r = body.circleRadius!;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = "#444";
  ctx.fill();
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function renderPolygon(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const vertices = body.vertices;
  const pos = body.position;

  ctx.beginPath();
  ctx.moveTo(vertices[0].x - pos.x, vertices[0].y - pos.y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x - pos.x, vertices[i].y - pos.y);
  }
  ctx.closePath();

  if (body.label === "wall") {
    ctx.fillStyle = "#333";
  } else {
    ctx.fillStyle = "#555";
  }
  ctx.fill();
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 1;
  ctx.stroke();
}
