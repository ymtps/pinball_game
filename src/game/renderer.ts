import Matter from "matter-js";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG, COLLISION_CATEGORY } from "./types";
import { LAUNCH_LANE, PLAYFIELD_WIDTH } from "./engine";

interface HitEffect { x: number; y: number; radius: number; alpha: number; color: string; }
interface ScorePopup { x: number; y: number; text: string; alpha: number; dy: number; }

const effects: HitEffect[] = [];
const popups: ScorePopup[] = [];

interface TableVisualState {
  spinnerAngle: number;
  kickbackAvailable: boolean;
  topLanesLit: boolean[];
  plungerCharge: number;
  plungerRecoil: number;
}

const visualState: TableVisualState = {
  spinnerAngle: 0,
  kickbackAvailable: true,
  topLanesLit: [false, false, false],
  plungerCharge: 0,
  plungerRecoil: 0,
};

export function updateVisualState(state: Partial<TableVisualState>) { Object.assign(visualState, state); }
export function addHitEffect(x: number, y: number, color: string = "#0ff") { effects.push({ x, y, radius: 5, alpha: 1.0, color }); }
export function addScorePopup(x: number, y: number, points: number) { popups.push({ x, y, text: `+${points}`, alpha: 1.0, dy: -2 }); }

// Pre-generate stars (deterministic)
const STARS: { x: number; y: number; r: number; b: number }[] = [];
for (let i = 0; i < 120; i++) {
  const seed = i * 7919 + 1;
  STARS.push({
    x: (seed * 13) % 340,
    y: (seed * 17) % 700,
    r: 0.3 + (seed % 5) * 0.25,
    b: 0.3 + (seed % 10) * 0.07,
  });
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  engine: Matter.Engine,
  config: GameConfig = DEFAULT_CONFIG
) {
  const { width, height } = config;
  ctx.clearRect(0, 0, width, height);

  renderTableBackground(ctx, width, height);
  renderSpaceDecorations(ctx, width, height);
  renderLaunchLane(ctx, config);

  // (No hardcoded overlays - all elements come from layout)

  const bodies = engine.world.bodies;
  const sorted = [...bodies].sort((a, b) => {
    const order = (l: string) => { if (l === "ball") return 10; if (l.startsWith("flipper")) return 8; if (l === "bumper") return 6; return 1; };
    return order(a.label) - order(b.label);
  });

  for (const body of sorted) {
    if (body.isSensor && body.label !== "drain") continue;
    if (!body.render.visible) continue;
    ctx.save();
    switch (body.label) {
      case "ball": renderBall(ctx, body, config); break;
      case "bumper": renderBumper(ctx, body); break;
      case "flipper-left": case "flipper-right": renderFlipper(ctx, body); break;
      case "drop-target": renderDropTarget(ctx, body); break;
      case "slingshot": renderSlingshot(ctx, body); break;
      case "spinner-post": renderSpinner(ctx, body); break;
      case "standup-target": renderStandupTarget(ctx, body); break;
      case "guide-pin": renderGuidePin(ctx, body); break;
      case "wall": case "lane-wall": renderWall(ctx, body); break;
      case "ramp-wall": renderRampWall(ctx, body); break;
      case "wall-rect": renderWallRect(ctx, body); break;
      case "wall-circle": renderWallCircle(ctx, body); break;
      case "wall-triangle": renderWallTriangle(ctx, body); break;
      default: break;
    }
    ctx.restore();
  }

  renderEffects(ctx);
  renderPopups(ctx);
  renderTableFrame(ctx, width, height);
}

const PF = PLAYFIELD_WIDTH;

// ── Deep space background ──
function renderTableBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#050818");
  g.addColorStop(0.3, "#0a0c20");
  g.addColorStop(0.6, "#080a1a");
  g.addColorStop(1, "#030610");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PF, h);

  // Subtle nebula glow
  const neb1 = ctx.createRadialGradient(PF * 0.3, h * 0.25, 20, PF * 0.3, h * 0.25, 160);
  neb1.addColorStop(0, "rgba(60, 20, 120, 0.12)");
  neb1.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = neb1;
  ctx.fillRect(0, 0, PF, h);

  const neb2 = ctx.createRadialGradient(PF * 0.75, h * 0.6, 20, PF * 0.75, h * 0.6, 140);
  neb2.addColorStop(0, "rgba(20, 60, 120, 0.1)");
  neb2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = neb2;
  ctx.fillRect(0, 0, PF, h);

  // Launch lane
  const lane = ctx.createLinearGradient(PF, 0, w, 0);
  lane.addColorStop(0, "#060a18");
  lane.addColorStop(1, "#030610");
  ctx.fillStyle = lane;
  ctx.fillRect(PF, 0, w - PF, h);

  ctx.strokeStyle = "rgba(80, 140, 220, 0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PF, 0); ctx.lineTo(PF, h); ctx.stroke();
}

// ── Star field + ambient decorations (layout-independent) ──
function renderSpaceDecorations(ctx: CanvasRenderingContext2D, _w: number, h: number) {
  // Stars
  for (const s of STARS) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200, 220, 255, ${s.b})`;
    ctx.fill();
  }

  // Constellation lines (subtle)
  ctx.strokeStyle = "rgba(60, 100, 180, 0.06)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i < STARS.length - 3; i += 4) {
    ctx.beginPath();
    ctx.moveTo(STARS[i].x, STARS[i].y);
    ctx.lineTo(STARS[i + 1].x, STARS[i + 1].y);
    ctx.stroke();
  }

  // Orbit ring
  ctx.strokeStyle = "rgba(80, 160, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(PF / 2, h * 0.45, 130, 80, 0.2, 0, Math.PI * 2);
  ctx.stroke();

  // Small planet
  ctx.beginPath();
  ctx.arc(PF * 0.15, h * 0.12, 6, 0, Math.PI * 2);
  const pg = ctx.createRadialGradient(PF * 0.15 - 2, h * 0.12 - 2, 1, PF * 0.15, h * 0.12, 6);
  pg.addColorStop(0, "rgba(180, 120, 255, 0.4)");
  pg.addColorStop(1, "rgba(60, 20, 100, 0.15)");
  ctx.fillStyle = pg;
  ctx.fill();
}

// ── Frame (metallic blue-silver) ──
function renderTableFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = 10, m = 6;
  ctx.save();
  const outer = ctx.createLinearGradient(0, 0, w, h);
  outer.addColorStop(0, "#4060a0");
  outer.addColorStop(0.4, "#80a0d0");
  outer.addColorStop(1, "#304080");
  ctx.strokeStyle = outer;
  ctx.lineWidth = m;
  ctx.beginPath(); ctx.roundRect(m / 2, m / 2, w - m, h - m, r); ctx.stroke();

  ctx.strokeStyle = "rgba(100, 160, 255, 0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(m + 2, m + 2, w - m * 2 - 4, h - m * 2 - 4, r - 2); ctx.stroke();
  ctx.restore();
}

// ── Ball (chrome with cyan glow) ──
function renderBall(ctx: CanvasRenderingContext2D, body: Matter.Body, config: GameConfig) {
  const { x, y } = body.position;
  const r = config.ballRadius;
  const isOnRamp = body.collisionFilter.category === COLLISION_CATEGORY.RAMP;

  ctx.save();
  if (isOnRamp) { ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 10; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3; }

  // Glow
  ctx.shadowColor = "rgba(0, 200, 255, 0.6)";
  ctx.shadowBlur = 8;

  const drawR = isOnRamp ? r * 0.85 : r;
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.05, x, y, drawR);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.3, "#c0e8ff");
  grad.addColorStop(0.6, "#6090b0");
  grad.addColorStop(1, "#304050");
  ctx.beginPath(); ctx.arc(x, y, drawR, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.restore();
}

// ── Bumper: neon cyan dome ──
function renderBumper(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const { x, y } = body.position;
  const r = body.circleRadius || 20;

  // Glow
  ctx.shadowColor = "rgba(0, 220, 255, 0.5)";
  ctx.shadowBlur = 12;

  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  const base = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r + 2);
  base.addColorStop(0, "#a0f0ff");
  base.addColorStop(0.5, "#2080a0");
  base.addColorStop(1, "#103040");
  ctx.fillStyle = base; ctx.fill();
  ctx.strokeStyle = "rgba(0, 200, 255, 0.6)";
  ctx.lineWidth = 1.5; ctx.stroke();
  ctx.shadowBlur = 0;

  // Star pattern
  const starPts = 6;
  ctx.beginPath();
  for (let i = 0; i < starPts * 2; i++) {
    const rr = i % 2 === 0 ? r * 0.4 : r * 0.18;
    const a = (i / (starPts * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "#00e8ff"; ctx.fill();
}

// ── Flipper: neon orange ──
function renderFlipper(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const v = body.vertices;
  ctx.shadowColor = "rgba(255, 160, 40, 0.5)";
  ctx.shadowBlur = 8;

  const grad = ctx.createLinearGradient(v[0].x, v[0].y, v[2].x, v[2].y);
  grad.addColorStop(0, "#ffb040");
  grad.addColorStop(0.5, "#ff8020");
  grad.addColorStop(1, "#c05010");
  ctx.beginPath(); ctx.moveTo(v[0].x, v[0].y);
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = "#ff6600"; ctx.lineWidth = 2; ctx.stroke();
  ctx.shadowBlur = 0;
}

// ── Drop target: neon rainbow ──
function renderDropTarget(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const v = body.vertices;
  const idx = (body as any).targetIndex || 0;
  const colors = [
    ["#ff4060", "#c01030"], ["#ff8030", "#c04010"],
    ["#ffe030", "#c0a010"], ["#40ff60", "#10c030"], ["#4080ff", "#1040c0"],
  ];
  const [c1, c2] = colors[idx % 5];

  ctx.shadowColor = c1; ctx.shadowBlur = 6;
  const grad = ctx.createLinearGradient(v[0].x, v[0].y, v[2].x, v[2].y);
  grad.addColorStop(0, c1); grad.addColorStop(1, c2);
  ctx.beginPath(); ctx.moveTo(v[0].x, v[0].y);
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.shadowBlur = 0;
}

// ── Slingshot: electric blue ──
function renderSlingshot(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const v = body.vertices;
  ctx.shadowColor = "rgba(60, 120, 255, 0.4)"; ctx.shadowBlur = 6;

  const grad = ctx.createLinearGradient(v[0].x, v[0].y, v[1].x, v[1].y);
  grad.addColorStop(0, "#3060c0"); grad.addColorStop(0.5, "#1840a0"); grad.addColorStop(1, "#102060");
  ctx.beginPath(); ctx.moveTo(v[0].x, v[0].y);
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = "rgba(100, 180, 255, 0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.shadowBlur = 0;
}

// ── Wall: dark metallic with blue edge glow ──
function renderWall(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const v = body.vertices;
  const grad = ctx.createLinearGradient(v[0].x, v[0].y, v[2].x, v[2].y);
  grad.addColorStop(0, "#1a2040"); grad.addColorStop(0.4, "#4060a0"); grad.addColorStop(0.6, "#304080"); grad.addColorStop(1, "#0a1020");
  ctx.beginPath(); ctx.moveTo(v[0].x, v[0].y);
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = "rgba(80, 140, 255, 0.3)"; ctx.lineWidth = 1; ctx.stroke();
}

function renderRampWall(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const v = body.vertices;
  ctx.beginPath(); ctx.moveTo(v[0].x, v[0].y);
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
  ctx.closePath();
  ctx.fillStyle = "rgba(60, 100, 180, 0.15)"; ctx.fill();
  ctx.strokeStyle = "rgba(100, 160, 255, 0.35)"; ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
}

// ── Wall rect (metallic with blue glow) ──
function renderWallRect(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const { x, y } = body.position;
  const w = (body as any).wallWidth || 60, h = (body as any).wallHeight || 10;
  const cr = (body as any).cornerRadius || 0;

  ctx.save();
  ctx.translate(x, y); ctx.rotate(body.angle);
  const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  grad.addColorStop(0, "#1a2040"); grad.addColorStop(0.35, "#4060a0"); grad.addColorStop(0.6, "#304080"); grad.addColorStop(1, "#0a1020");
  ctx.beginPath();
  if (cr > 0) ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(cr, Math.min(w, h) / 2));
  else ctx.rect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = "rgba(80, 160, 255, 0.4)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

// ── Wall triangle (metallic) — centroid-anchored ──
function renderWallTriangle(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const { x, y } = body.position;
  const w = (body as any).wallWidth || 40, h = (body as any).wallHeight || 40;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(body.angle);
  ctx.beginPath();
  ctx.moveTo(0, -2 * h / 3);
  ctx.lineTo(-w / 2, h / 3);
  ctx.lineTo(w / 2, h / 3);
  ctx.closePath();
  const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  grad.addColorStop(0, "#1a2040"); grad.addColorStop(0.35, "#4060a0"); grad.addColorStop(0.6, "#304080"); grad.addColorStop(1, "#0a1020");
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = "rgba(80, 160, 255, 0.45)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

// ── Wall circle ──
function renderWallCircle(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const { x, y } = body.position;
  const r = (body as any).wallRadius || 15;
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
  grad.addColorStop(0, "#4060a0"); grad.addColorStop(0.5, "#204068"); grad.addColorStop(1, "#0a1020");
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = "rgba(80, 160, 255, 0.4)"; ctx.lineWidth = 1; ctx.stroke();
}

// ── Launch lane ──
function renderLaunchLane(ctx: CanvasRenderingContext2D, config: GameConfig) {
  const x = LAUNCH_LANE.centerX;
  const charge = visualState.plungerCharge;
  const recoil = visualState.plungerRecoil;
  const springRestTop = config.height - 62;
  const maxPull = 32; // must match plunger.ts MAX_PULL
  const bottomY = config.height - 10;
  const pullDown = charge * maxPull;
  const recoilUp = recoil * 20;
  const springTop = springRestTop + pullDown - recoilUp;

  ctx.fillStyle = "#0a1028"; ctx.fillRect(x - 4, springRestTop - 10, 8, bottomY - springRestTop + 20);
  ctx.strokeStyle = "#304080"; ctx.lineWidth = 1; ctx.strokeRect(x - 4, springRestTop - 10, 8, bottomY - springRestTop + 20);

  const springLen = bottomY - springTop;
  const coilCount = 8, coilSpacing = springLen / coilCount, coilWidth = 10;
  ctx.strokeStyle = `rgb(${60 + charge * 150},${120 + charge * 40},${220 - charge * 100})`;
  ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x, springTop);
  for (let i = 0; i < coilCount; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    ctx.lineTo(x + coilWidth * dir, springTop + i * coilSpacing + coilSpacing * 0.25);
    ctx.lineTo(x - coilWidth * dir, springTop + i * coilSpacing + coilSpacing * 0.75);
  }
  ctx.lineTo(x, bottomY); ctx.stroke();

  ctx.fillStyle = "#1a2840"; ctx.fillRect(x - 8, bottomY - 2, 16, 6);
  ctx.save();
  if (charge > 0.1) { ctx.shadowColor = `rgba(100, 180, 255, ${charge * 0.8})`; ctx.shadowBlur = 6 + charge * 10; }
  const plateGrad = ctx.createLinearGradient(x - 8, springTop, x + 8, springTop);
  plateGrad.addColorStop(0, "#304080"); plateGrad.addColorStop(0.5, "#80a0d0"); plateGrad.addColorStop(1, "#304080");
  ctx.fillStyle = plateGrad; ctx.fillRect(x - 8, springTop - 4, 16, 4);
  ctx.restore();

  if (charge > 0.01) {
    const meterX = x + 14, meterH = maxPull, meterY = springRestTop, fillH = charge * meterH;
    ctx.fillStyle = "rgba(10, 20, 40, 0.6)"; ctx.fillRect(meterX, meterY, 4, meterH);
    const mGrad = ctx.createLinearGradient(0, meterY + meterH, 0, meterY);
    mGrad.addColorStop(0, "#00c0ff"); mGrad.addColorStop(0.5, "#8040ff"); mGrad.addColorStop(1, "#ff4060");
    ctx.fillStyle = mGrad; ctx.fillRect(meterX, meterY + meterH - fillH, 4, fillH);
  }
}

// ── Guide pin ──
function renderGuidePin(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const { x, y } = body.position;
  const r = (body as any).circleRadius || 4;
  ctx.shadowColor = "rgba(100, 180, 255, 0.3)"; ctx.shadowBlur = 4;
  const grad = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, r);
  grad.addColorStop(0, "#c0d8ff"); grad.addColorStop(1, "#304060");
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.shadowBlur = 0;
}

// ── Spinner ──
function renderSpinner(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const { x, y } = body.position;
  ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#6080c0"; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y);
  ctx.strokeStyle = "#80b0ff"; ctx.lineWidth = 2; ctx.stroke();
}

// ── Standup target: neon pink ──
function renderStandupTarget(ctx: CanvasRenderingContext2D, body: Matter.Body) {
  const v = body.vertices;
  ctx.shadowColor = "rgba(255, 80, 200, 0.4)"; ctx.shadowBlur = 6;
  const grad = ctx.createLinearGradient(v[0].x, v[0].y, v[2].x, v[2].y);
  grad.addColorStop(0, "#ff60c0"); grad.addColorStop(0.5, "#c030a0"); grad.addColorStop(1, "#601060");
  ctx.beginPath(); ctx.moveTo(v[0].x, v[0].y);
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = "rgba(255, 150, 255, 0.4)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.shadowBlur = 0;
}

// ── Effects ──
function renderEffects(ctx: CanvasRenderingContext2D) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    ctx.shadowColor = e.color; ctx.shadowBlur = e.radius * 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${e.alpha * 0.5})`; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(150,220,255,${e.alpha * 0.5})`; ctx.lineWidth = 2; ctx.stroke();
    e.radius += 2.5; e.alpha -= 0.04;
    if (e.alpha <= 0) effects.splice(i, 1);
  }
}

function renderPopups(ctx: CanvasRenderingContext2D) {
  ctx.font = "bold 13px monospace"; ctx.textAlign = "center";
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    ctx.fillStyle = `rgba(0,0,0,${p.alpha * 0.5})`; ctx.fillText(p.text, p.x + 1, p.y + 1);
    ctx.fillStyle = `rgba(100,220,255,${p.alpha})`; ctx.fillText(p.text, p.x, p.y);
    p.y += p.dy; p.alpha -= 0.02;
    if (p.alpha <= 0) popups.splice(i, 1);
  }
}

