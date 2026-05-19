import { useRef, useState, useCallback, useEffect } from "react";
import { DEFAULT_CONFIG } from "../game/types";
import { PLAYFIELD_WIDTH, LAUNCH_LANE } from "../game/engine";
import type { TableLayoutConfig, ElementConfig, ElementType, FlipperConfig } from "../game/tableConfig";
import { ELEMENT_PALETTE, generateId, getDefaultLayout, resetIdCounter, DEFAULT_FLIPPERS } from "../game/tableConfig";

interface TableEditorProps {
  layout: TableLayoutConfig;
  onLayoutChange: (layout: TableLayoutConfig) => void;
  onPlay: () => void;
}

const PF = PLAYFIELD_WIDTH;
const W = DEFAULT_CONFIG.width;
const H = DEFAULT_CONFIG.height;
const GRID = 5;
const HANDLE_R = 5;
const STORAGE_KEY = "pinball-layouts";

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

// Hit-test sizes
function getHitSize(el: ElementConfig): { type: "circle"; r: number } | { type: "rect"; w: number; h: number } {
  switch (el.type) {
    case "bumper": return { type: "circle", r: 22 };
    case "kickout-hole": return { type: "circle", r: 14 };
    case "guide-pin": return { type: "circle", r: 6 };
    case "spinner": return { type: "circle", r: 12 };
    case "wall-circle": return { type: "circle", r: (el.radius ?? 15) + 2 };
    case "wall-rect":
      return { type: "rect", w: (el.width ?? 60) / 2 + 4, h: (el.height ?? 10) / 2 + 4 };
    case "wall-triangle":
      // centroid-anchored triangle: peak at -2h/3, base at +h/3 relative to el.y
      return { type: "rect", w: (el.width ?? 40) / 2 + 4, h: ((el.height ?? 40) * 2 / 3) + 4 };
    default: return { type: "rect", w: 12, h: 16 };
  }
}

function getDefaults(type: ElementType): Partial<ElementConfig> {
  switch (type) {
    case "wall-rect": return { width: 60, height: 10, cornerRadius: 0 };
    case "wall-circle": return { radius: 15 };
    case "wall-triangle": return { width: 40, height: 40 };
    default: return {};
  }
}

type DragMode = "none" | "move" | "resize" | "flipper";

const FLIPPER_REST_ANGLE = 0.45;

interface ResizeHandle { corner: number; } // 0=TL,1=TR,2=BR,3=BL,4=T,5=R,6=B,7=L

export function TableEditor({ layout, onLayoutChange, onPlay }: TableEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placingType, setPlacingType] = useState<ElementType | null>(null);
  const [tableName, setTableName] = useState(layout.name);

  // Drag state
  const [dragMode, setDragMode] = useState<DragMode>("none");
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const [, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0, r: 0 });

  // Selected flipper side (mutually exclusive with selectedId)
  const [selectedFlipperSide, setSelectedFlipperSide] = useState<"left" | "right" | null>(null);

  // localStorage saved layouts
  const [savedLayouts, setSavedLayouts] = useState<Record<string, TableLayoutConfig>>(() => loadStoredLayouts());
  const [loadSelection, setLoadSelection] = useState<string>("");
  const [saveName, setSaveName] = useState<string>(layout.name);

  const selectedEl = layout.elements.find((e) => e.id === selectedId) ?? null;

  // ── Flipper helpers ──
  const flippers = {
    left: layout.flippers?.left ?? DEFAULT_FLIPPERS.left,
    right: layout.flippers?.right ?? DEFAULT_FLIPPERS.right,
  };
  const selectedFlipper = selectedFlipperSide ? flippers[selectedFlipperSide] : null;

  function updateFlipper(side: "left" | "right", patch: Partial<FlipperConfig>) {
    onLayoutChange({
      ...layout,
      flippers: { ...flippers, [side]: { ...flippers[side], ...patch } },
    });
  }

  function flipperBodyCenter(cfg: FlipperConfig, side: "left" | "right") {
    const sign = side === "left" ? 1 : -1;
    const angle = sign * FLIPPER_REST_ANGLE;
    const r = sign * (cfg.width / 3);
    return {
      cx: cfg.pivotX + r * Math.cos(angle),
      cy: cfg.pivotY + r * Math.sin(angle),
      angle,
    };
  }

  function hitTestFlipper(px: number, py: number): "left" | "right" | null {
    for (const side of ["left", "right"] as const) {
      const cfg = flippers[side];
      const { cx, cy, angle } = flipperBodyCenter(cfg, side);
      const dx = px - cx, dy = py - cy;
      const lx = dx * Math.cos(-angle) - dy * Math.sin(-angle);
      const ly = dx * Math.sin(-angle) + dy * Math.cos(-angle);
      if (Math.abs(lx) <= cfg.width / 2 + 3 && Math.abs(ly) <= cfg.height / 2 + 4) return side;
      // Also accept clicks near the pivot
      const pd2 = (px - cfg.pivotX) ** 2 + (py - cfg.pivotY) ** 2;
      if (pd2 <= 64) return side;
    }
    return null;
  }

  // ── Helpers ──
  function updateElement(id: string, patch: Partial<ElementConfig>) {
    onLayoutChange({
      ...layout,
      elements: layout.elements.map((el) => el.id === id ? { ...el, ...patch } : el),
    });
  }

  // ── Get resize handle positions for wall-rect ──
  function getRectHandles(el: ElementConfig): { x: number; y: number }[] {
    const w = (el.width ?? 60) / 2;
    const h = (el.height ?? 10) / 2;
    const a = el.angle ?? 0;
    const cos = Math.cos(a), sin = Math.sin(a);
    const corners = [
      [-w, -h], [w, -h], [w, h], [-w, h], // TL TR BR BL
      [0, -h], [w, 0], [0, h], [-w, 0],   // T R B L
    ];
    return corners.map(([lx, ly]) => ({
      x: el.x + lx * cos - ly * sin,
      y: el.y + lx * sin + ly * cos,
    }));
  }

  // Radius handle for wall-circle
  function getCircleHandle(el: ElementConfig): { x: number; y: number } {
    const r = el.radius ?? 15;
    return { x: el.x + r, y: el.y };
  }

  // World → local (relative to element center, un-rotated)
  function worldToLocal(el: ElementConfig, wx: number, wy: number): { x: number; y: number } {
    const dx = wx - el.x, dy = wy - el.y;
    const a = -(el.angle ?? 0);
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  }

  // ── Drawing ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#050818"); bg.addColorStop(0.5, "#0a0c20"); bg.addColorStop(1, "#030610");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, PF, H);
    ctx.fillStyle = "#060a18"; ctx.fillRect(PF, 0, W - PF, H);
    ctx.strokeStyle = "rgba(80,140,220,0.2)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PF, 0); ctx.lineTo(PF, H); ctx.stroke();

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 0.5;
    for (let x = 0; x <= W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(PF, y); ctx.stroke(); }

    drawFixedElements(ctx);

    // Draw elements
    for (const el of layout.elements) {
      drawElement(ctx, el, el.id === selectedId);
    }

    // Draw flippers
    drawFlipper(ctx, flippers.left, "left", selectedFlipperSide === "left");
    drawFlipper(ctx, flippers.right, "right", selectedFlipperSide === "right");

    // Draw resize handles for selected element
    if (selectedEl) {
      if (selectedEl.type === "wall-rect") {
        const handles = getRectHandles(selectedEl);
        for (let i = 0; i < handles.length; i++) {
          const h = handles[i];
          ctx.fillStyle = i < 4 ? "#ffe060" : "#c0a040";
          ctx.strokeStyle = "#806020";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.rect(h.x - HANDLE_R, h.y - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
          ctx.fill(); ctx.stroke();
        }
      } else if (selectedEl.type === "wall-circle") {
        const h = getCircleHandle(selectedEl);
        ctx.fillStyle = "#ffe060"; ctx.strokeStyle = "#806020"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.rect(h.x - HANDLE_R, h.y - HANDLE_R, HANDLE_R * 2, HANDLE_R * 2);
        ctx.fill(); ctx.stroke();
      }
    }

    // Placing indicator
    if (placingType) {
      ctx.font = "bold 11px sans-serif"; ctx.fillStyle = "rgba(255,255,200,0.7)";
      ctx.textAlign = "center"; ctx.fillText(`クリックで配置: ${placingType}`, PF / 2, H - 15);
    }

    // Frame
    ctx.strokeStyle = "#3060a0"; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4);
  }, [layout, selectedId, placingType, selectedFlipperSide]);

  useEffect(() => { draw(); }, [draw]);

  function drawFixedElements(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(255,60,60,0.1)"; ctx.fillRect(0, 660, PF, 40);
    ctx.fillStyle = "rgba(255,60,60,0.4)"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("ドレイン", PF / 2, 680);
    ctx.fillStyle = "rgba(100,200,255,0.08)"; ctx.fillRect(0, 0, PF, 30);
    ctx.fillStyle = "rgba(100,200,255,0.35)"; ctx.font = "bold 8px sans-serif"; ctx.fillText("トップレーン (固定)", PF / 2, 18);
    // Launch lane indicator
    ctx.fillStyle = "rgba(60,120,200,0.08)";
    ctx.fillRect(PF, 0, W - PF, H);
    ctx.strokeStyle = "rgba(80,140,220,0.15)"; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(PF, 0); ctx.lineTo(PF, H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(100,180,255,0.25)"; ctx.font = "bold 8px sans-serif"; ctx.fillText("発射台", LAUNCH_LANE.centerX, H / 2);
  }

  function drawElement(ctx: CanvasRenderingContext2D, el: ElementConfig, selected: boolean) {
    ctx.save();
    const { x, y, type } = el;
    if (selected) { ctx.shadowColor = "#ffe060"; ctx.shadowBlur = 12; }

    switch (type) {
      case "bumper": {
        ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, 22);
        g.addColorStop(0, "#a0f0ff"); g.addColorStop(0.5, "#2080a0"); g.addColorStop(1, "#103040");
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = selected ? "#ffe060" : "rgba(0,200,255,0.5)"; ctx.lineWidth = selected ? 2.5 : 1.2; ctx.stroke();
        ctx.font = "bold 9px sans-serif"; ctx.fillStyle = "#00e8ff"; ctx.textAlign = "center"; ctx.fillText("1000", x, y + 3);
        break;
      }
      case "drop-target": {
        const colors = ["#e03030", "#e87020", "#e0c020", "#40b050", "#3060d0"];
        const idx = layout.elements.filter((e) => e.type === "drop-target").indexOf(el);
        ctx.save(); ctx.translate(x, y); ctx.rotate(el.angle ?? 0);
        ctx.fillStyle = colors[idx % 5]; ctx.fillRect(-3.5, -9, 7, 18);
        ctx.strokeStyle = selected ? "#ffe060" : "rgba(255,255,255,0.4)"; ctx.lineWidth = selected ? 2 : 1; ctx.strokeRect(-3.5, -9, 7, 18);
        ctx.restore(); break;
      }
      case "standup-target": {
        ctx.save(); ctx.translate(x, y); ctx.rotate(el.angle ?? 0);
        ctx.fillStyle = "#c050a0"; ctx.fillRect(-3.5, -10, 7, 20);
        ctx.strokeStyle = selected ? "#ffe060" : "rgba(255,255,255,0.35)"; ctx.lineWidth = selected ? 2 : 1; ctx.strokeRect(-3.5, -10, 7, 20);
        ctx.restore(); break;
      }
      case "slingshot-left": case "slingshot-right": {
        const dir = type === "slingshot-left" ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(x, y - 28); ctx.lineTo(x + dir * 22, y + 20); ctx.lineTo(x, y + 28); ctx.closePath();
        ctx.fillStyle = "rgba(48,96,192,0.6)"; ctx.fill();
        ctx.strokeStyle = selected ? "#ffe060" : "rgba(255,255,255,0.3)"; ctx.lineWidth = selected ? 2 : 1.5; ctx.stroke();
        break;
      }
      case "spinner": {
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = "#6080c0"; ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y);
        ctx.strokeStyle = selected ? "#ffe060" : "#80b0ff"; ctx.lineWidth = 2; ctx.stroke(); break;
      }
      case "kickout-hole": {
        ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fillStyle = "#0a0a0a"; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.strokeStyle = selected ? "#ffe060" : "rgba(80,160,255,0.4)"; ctx.lineWidth = selected ? 2.5 : 2; ctx.stroke(); break;
      }
      case "guide-pin": {
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
        const g2 = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, 4);
        g2.addColorStop(0, "#c0d8ff"); g2.addColorStop(1, "#304060");
        ctx.fillStyle = g2; ctx.fill();
        ctx.strokeStyle = selected ? "#ffe060" : "rgba(80,140,255,0.3)"; ctx.lineWidth = selected ? 1.5 : 0.5; ctx.stroke(); break;
      }
      case "wall-rect": {
        const w = el.width ?? 60, h = el.height ?? 10, cr = el.cornerRadius ?? 0;
        ctx.save(); ctx.translate(x, y); ctx.rotate(el.angle ?? 0);
        const grd = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
        grd.addColorStop(0, "#1a2040"); grd.addColorStop(0.35, "#4060a0"); grd.addColorStop(0.55, "#304080"); grd.addColorStop(1, "#0a1020");
        ctx.beginPath();
        if (cr > 0) ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(cr, Math.min(w, h) / 2));
        else ctx.rect(-w / 2, -h / 2, w, h);
        ctx.fillStyle = grd; ctx.fill();
        ctx.strokeStyle = selected ? "#ffe060" : "rgba(80,160,255,0.4)"; ctx.lineWidth = selected ? 2 : 1; ctx.stroke();
        if (selected) {
          ctx.rotate(-(el.angle ?? 0));
          ctx.font = "bold 8px sans-serif"; ctx.fillStyle = "#ffe060"; ctx.textAlign = "center";
          ctx.fillText(`${w}x${h} r${cr}`, 0, -h / 2 - 8);
        }
        ctx.restore();
        break;
      }
      case "wall-triangle": {
        const w = el.width ?? 40, h = el.height ?? 40;
        ctx.save(); ctx.translate(x, y); ctx.rotate(el.angle ?? 0);
        const grd = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
        grd.addColorStop(0, "#1a2040"); grd.addColorStop(0.35, "#4060a0"); grd.addColorStop(0.55, "#304080"); grd.addColorStop(1, "#0a1020");
        ctx.beginPath();
        // centroid-anchored isoceles triangle (matches physics body)
        ctx.moveTo(0, -2 * h / 3);
        ctx.lineTo(-w / 2, h / 3);
        ctx.lineTo(w / 2, h / 3);
        ctx.closePath();
        ctx.fillStyle = grd; ctx.fill();
        ctx.strokeStyle = selected ? "#ffe060" : "rgba(80,160,255,0.4)"; ctx.lineWidth = selected ? 2 : 1; ctx.stroke();
        if (selected) {
          ctx.rotate(-(el.angle ?? 0));
          ctx.font = "bold 8px sans-serif"; ctx.fillStyle = "#ffe060"; ctx.textAlign = "center";
          ctx.fillText(`${w}x${h}`, 0, -2 * h / 3 - 6);
        }
        ctx.restore();
        break;
      }
      case "wall-circle": {
        const r = el.radius ?? 15;
        const grd = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
        grd.addColorStop(0, "#4060a0"); grd.addColorStop(0.5, "#204068"); grd.addColorStop(1, "#0a1020");
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
        ctx.strokeStyle = selected ? "#ffe060" : "rgba(80,160,255,0.4)"; ctx.lineWidth = selected ? 2 : 1; ctx.stroke();
        if (selected) {
          ctx.font = "bold 8px sans-serif"; ctx.fillStyle = "#ffe060"; ctx.textAlign = "center";
          ctx.fillText(`r${r}`, x, y - r - 5);
        }
        break;
      }
    }
    ctx.restore();
  }

  function drawFlipper(ctx: CanvasRenderingContext2D, cfg: FlipperConfig, side: "left" | "right", selected: boolean) {
    const { cx, cy, angle } = flipperBodyCenter(cfg, side);
    ctx.save();
    if (selected) { ctx.shadowColor = "#ffe060"; ctx.shadowBlur = 12; }
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const w = cfg.width, h = cfg.height;
    // Trapezoid-ish shape: outer (pivot) end wider
    const sign = side === "left" ? 1 : -1;
    const slope = 0.12 * h;
    ctx.beginPath();
    // pivot end (outer)
    const ox = -sign * w / 2;
    const ix =  sign * w / 2;
    ctx.moveTo(ox, -h / 2 - slope);
    ctx.lineTo(ix, -h / 2 + slope);
    ctx.lineTo(ix,  h / 2 - slope);
    ctx.lineTo(ox,  h / 2 + slope);
    ctx.closePath();
    const grd = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    grd.addColorStop(0, "#604020"); grd.addColorStop(0.5, "#d09030"); grd.addColorStop(1, "#604020");
    ctx.fillStyle = grd; ctx.fill();
    ctx.strokeStyle = selected ? "#ffe060" : "rgba(255,200,80,0.6)";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.stroke();
    ctx.restore();
    // Pivot marker
    ctx.beginPath();
    ctx.arc(cfg.pivotX, cfg.pivotY, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#ff8060" : "rgba(255,120,80,0.85)";
    ctx.fill();
    ctx.strokeStyle = "#401010"; ctx.lineWidth = 1; ctx.stroke();
    if (selected) {
      ctx.font = "bold 8px sans-serif"; ctx.fillStyle = "#ffe060"; ctx.textAlign = "center";
      ctx.fillText(`${w}x${h}`, cfg.pivotX, cfg.pivotY - 10);
    }
  }

  // ── Mouse interaction ──
  function getCanvasPos(e: React.MouseEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
  }

  function hitTestHandle(pos: { x: number; y: number }): { type: "resize"; handle: ResizeHandle } | { type: "circle-resize" } | null {
    if (!selectedEl) return null;

    if (selectedEl.type === "wall-rect") {
      const handles = getRectHandles(selectedEl);
      for (let i = 0; i < handles.length; i++) {
        if (Math.abs(pos.x - handles[i].x) <= HANDLE_R + 3 && Math.abs(pos.y - handles[i].y) <= HANDLE_R + 3) {
          return { type: "resize", handle: { corner: i } };
        }
      }
    }

    if (selectedEl.type === "wall-circle") {
      const h = getCircleHandle(selectedEl);
      if (Math.abs(pos.x - h.x) <= HANDLE_R + 3 && Math.abs(pos.y - h.y) <= HANDLE_R + 3) {
        return { type: "circle-resize" };
      }
    }

    return null;
  }

  function hitTestElement(px: number, py: number): ElementConfig | null {
    for (let i = layout.elements.length - 1; i >= 0; i--) {
      const el = layout.elements[i];
      const hit = getHitSize(el);
      if (hit.type === "circle") {
        if ((px - el.x) ** 2 + (py - el.y) ** 2 <= hit.r ** 2) return el;
      } else {
        if (Math.abs(px - el.x) < hit.w && Math.abs(py - el.y) < hit.h) return el;
      }
    }
    return null;
  }

  function handleMouseDown(e: React.MouseEvent) {
    const pos = getCanvasPos(e);

    // Place mode
    if (placingType) {
      const newEl: ElementConfig = { id: generateId(), type: placingType, x: snap(pos.x), y: snap(pos.y), angle: 0, ...getDefaults(placingType) };
      onLayoutChange({ ...layout, elements: [...layout.elements, newEl] });
      setSelectedId(newEl.id);
      setPlacingType(null);
      return;
    }

    // Check handles first (for selected element)
    const handleHit = hitTestHandle(pos);
    if (handleHit) {
      if (handleHit.type === "resize") {
        setDragMode("resize");
        setResizeHandle(handleHit.handle);
        setResizeStart({ x: pos.x, y: pos.y, w: selectedEl!.width ?? 60, h: selectedEl!.height ?? 10, r: 0 });
        return;
      }
      if (handleHit.type === "circle-resize") {
        setDragMode("resize");
        setResizeHandle({ corner: -1 }); // special: circle resize
        setResizeStart({ x: pos.x, y: pos.y, w: 0, h: 0, r: selectedEl!.radius ?? 15 });
        return;
      }
    }

    // Hit test elements
    const hit = hitTestElement(pos.x, pos.y);
    if (hit) {
      setSelectedId(hit.id);
      setSelectedFlipperSide(null);
      setDragMode("move");
      setDragOffset({ x: pos.x - hit.x, y: pos.y - hit.y });
      return;
    }

    // Hit test flippers
    const flipperHit = hitTestFlipper(pos.x, pos.y);
    if (flipperHit) {
      const cfg = flippers[flipperHit];
      setSelectedFlipperSide(flipperHit);
      setSelectedId(null);
      setDragMode("flipper");
      setDragOffset({ x: pos.x - cfg.pivotX, y: pos.y - cfg.pivotY });
      return;
    }

    setSelectedId(null);
    setSelectedFlipperSide(null);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (dragMode === "none") return;
    const pos = getCanvasPos(e);

    if (dragMode === "move" && selectedId) {
      const nx = snap(pos.x - dragOffset.x);
      const ny = snap(pos.y - dragOffset.y);
      updateElement(selectedId, { x: Math.max(5, Math.min(W - 5, nx)), y: Math.max(5, Math.min(H - 60, ny)) });
    }

    if (dragMode === "resize" && selectedId && resizeHandle) {
      if (resizeHandle.corner === -1) {
        // Circle resize
        const dist = Math.sqrt((pos.x - selectedEl!.x) ** 2 + (pos.y - selectedEl!.y) ** 2);
        updateElement(selectedId, { radius: Math.max(5, Math.min(50, Math.round(dist))) });
      } else {
        // Rect resize
        const el = selectedEl!;
        const local = worldToLocal(el, pos.x, pos.y);
        const c = resizeHandle.corner;
        let w = el.width ?? 60, h = el.height ?? 10;
        if (c === 0 || c === 3 || c === 7) { w = Math.max(10, snap(Math.abs(local.x) * 2)); }
        if (c === 1 || c === 2 || c === 5) { w = Math.max(10, snap(Math.abs(local.x) * 2)); }
        if (c === 0 || c === 1 || c === 4) { h = Math.max(4, snap(Math.abs(local.y) * 2)); }
        if (c === 2 || c === 3 || c === 6) { h = Math.max(4, snap(Math.abs(local.y) * 2)); }
        if (c >= 4) {
          if (c === 4 || c === 6) { w = el.width ?? 60; }
          if (c === 5 || c === 7) { h = el.height ?? 10; }
        }
        updateElement(selectedId, { width: Math.min(W, w), height: Math.min(H, h) });
      }
    }

    if (dragMode === "flipper" && selectedFlipperSide) {
      const nx = snap(pos.x - dragOffset.x);
      const ny = snap(pos.y - dragOffset.y);
      updateFlipper(selectedFlipperSide, {
        pivotX: Math.max(5, Math.min(PF - 5, nx)),
        pivotY: Math.max(5, Math.min(H - 5, ny)),
      });
    }
  }

  function handleMouseUp() {
    setDragMode("none");
    setResizeHandle(null);
  }

  // ── Actions ──
  function handleDelete() {
    if (!selectedId) return;
    onLayoutChange({ ...layout, elements: layout.elements.filter((e) => e.id !== selectedId) });
    setSelectedId(null);
  }

  function handleRotate(delta: number) {
    if (!selectedId) return;
    updateElement(selectedId, { angle: (selectedEl?.angle ?? 0) + delta });
  }

  function handlePropChange(prop: keyof ElementConfig, value: number) {
    if (!selectedId) return;
    updateElement(selectedId, { [prop]: value });
  }

  function handleClear() { onLayoutChange({ name: tableName, elements: [] }); setSelectedId(null); }
  function handleLoadDefault() { const d = getDefaultLayout(); onLayoutChange(d); setTableName(d.name); setSelectedId(null); }

  // ── localStorage ──
  function handleSaveToStorage() {
    const name = saveName.trim();
    if (!name) { alert("保存名を入力してください"); return; }
    if (savedLayouts[name] && !confirm(`「${name}」は既に存在します。上書きしますか?`)) return;
    const snapshot: TableLayoutConfig = JSON.parse(JSON.stringify({ ...layout, name }));
    const next = { ...savedLayouts, [name]: snapshot };
    persistStoredLayouts(next);
    setSavedLayouts(next);
    setTableName(name);
    setLoadSelection(name);
  }

  function handleLoadFromStorage(name: string) {
    if (!name) return;
    const data = savedLayouts[name];
    if (!data) return;
    const maxId = data.elements.reduce((max, el) => Math.max(max, parseInt(el.id.replace("el-", ""), 10) || 0), 0);
    resetIdCounter(maxId);
    onLayoutChange(JSON.parse(JSON.stringify(data)));
    setTableName(data.name);
    setSaveName(data.name);
    setSelectedId(null);
    setSelectedFlipperSide(null);
    setLoadSelection(name);
  }

  function handleDeleteFromStorage() {
    if (!loadSelection) return;
    if (!confirm(`「${loadSelection}」を削除しますか?`)) return;
    const next = { ...savedLayouts };
    delete next[loadSelection];
    persistStoredLayouts(next);
    setSavedLayouts(next);
    setLoadSelection("");
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") handleDelete();
      if (e.key === "Escape") { setPlacingType(null); setSelectedId(null); setSelectedFlipperSide(null); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const isRectMode = selectedEl?.type === "wall-rect";
  const isTriangleMode = selectedEl?.type === "wall-triangle";
  const cursorStyle = placingType ? "crosshair" : dragMode !== "none" ? "grabbing" : "default";
  const sideW = 220;

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#030610" }}>
      <div style={{ display: "flex", border: "3px solid #3060a0", backgroundColor: "#080c1a", borderRadius: "12px", overflow: "hidden" }}>
        {/* Canvas */}
        <div style={{ position: "relative", cursor: cursorStyle }}>
          <canvas ref={canvasRef} width={W} height={H} style={{ display: "block" }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          />
        </div>

        {/* Sidebar */}
        <div style={{ width: sideW, display: "flex", flexDirection: "column", backgroundColor: "#080c1a", fontFamily: "monospace", borderLeft: "2px solid #1a3060", overflow: "auto" }}>
          {/* Header */}
          <div style={{ padding: "10px 10px 8px", borderBottom: "2px solid #1a3060", background: "linear-gradient(180deg, #0c1530 0%, #060a18 100%)", textAlign: "center" }}>
            <div style={{ fontSize: "9px", color: "#4070a0", letterSpacing: "3px" }}>テーブル</div>
            <div style={{ fontSize: "18px", fontWeight: "bold", color: "#c0d8ff", letterSpacing: "2px" }}>エディタ</div>
          </div>

          {/* Table name */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #2a5840", background: "#060a18" }}>
            <div style={{ fontSize: "9px", color: "#4070a0", marginBottom: "4px" }}>テーブル名</div>
            <input value={tableName} onChange={(e) => setTableName(e.target.value)}
              style={{ width: "100%", padding: "4px 6px", fontSize: "12px", backgroundColor: "#0c1830", color: "#a0c0e0", border: "1px solid #1a3060", fontFamily: "monospace", boxSizing: "border-box" }}
            />
          </div>

          {/* Palette */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #2a5840", background: "#060a18" }}>
            <div style={{ fontSize: "9px", color: "#4070a0", marginBottom: "6px" }}>パーツ一覧</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {ELEMENT_PALETTE.map((item) => (
                <button key={item.type} onClick={() => setPlacingType(placingType === item.type ? null : item.type)}
                  style={{ padding: "4px 8px", fontSize: "9px", cursor: "pointer",
                    backgroundColor: placingType === item.type ? "#1a3870" : "#1a3828",
                    color: placingType === item.type ? "#ffe060" : "#80a0c8",
                    border: `1px solid ${placingType === item.type ? "#ffe060" : "#2a5840"}`,
                    fontFamily: "monospace", borderRadius: "3px" }}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Selected element info */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #2a5840", background: "#060a18", minHeight: "80px" }}>
            <div style={{ fontSize: "9px", color: "#4070a0", marginBottom: "4px" }}>選択中</div>
            {selectedFlipper && selectedFlipperSide ? (
              <div style={{ fontSize: "10px", color: "#a0c0e0", lineHeight: "1.6" }}>
                <div>種類: <span style={{ color: "#ffe060" }}>フリッパー ({selectedFlipperSide === "left" ? "左" : "右"})</span></div>
                <div>ピボット X: {selectedFlipper.pivotX} Y: {selectedFlipper.pivotY}</div>
                <div style={{ marginTop: "4px" }}>
                  {renderSlider("X", selectedFlipper.pivotX, 5, PF - 5, 5, (v) => updateFlipper(selectedFlipperSide, { pivotX: v }))}
                  {renderSlider("Y", selectedFlipper.pivotY, 5, H - 5, 5, (v) => updateFlipper(selectedFlipperSide, { pivotY: v }))}
                  {renderSlider("幅", selectedFlipper.width, 20, 120, 1, (v) => updateFlipper(selectedFlipperSide, { width: v }))}
                  {renderSlider("高さ", selectedFlipper.height, 6, 24, 1, (v) => updateFlipper(selectedFlipperSide, { height: v }))}
                  <button
                    onClick={() => updateFlipper(selectedFlipperSide, { ...DEFAULT_FLIPPERS[selectedFlipperSide] })}
                    style={{ ...smallBtnStyle, marginTop: "4px", color: "#c0a060" }}
                  >
                    初期値に戻す
                  </button>
                </div>
              </div>
            ) : selectedEl ? (
              <div style={{ fontSize: "10px", color: "#a0c0e0", lineHeight: "1.6" }}>
                <div>種類: <span style={{ color: "#ffe060" }}>{selectedEl.type}</span></div>
                <div>X: {selectedEl.x} Y: {selectedEl.y}</div>

                {/* Rect mode: size sliders */}
                {isRectMode && (
                  <div style={{ marginTop: "4px" }}>
                    {renderSlider("幅", selectedEl.width ?? 60, 4, W, 5, (v) => handlePropChange("width", v))}
                    {renderSlider("高さ", selectedEl.height ?? 10, 4, H, 2, (v) => handlePropChange("height", v))}
                    {renderSlider("角丸", selectedEl.cornerRadius ?? 0, 0, 50, 1, (v) => handlePropChange("cornerRadius", v))}
                  </div>
                )}

                {/* Triangle mode: size sliders */}
                {isTriangleMode && (
                  <div style={{ marginTop: "4px" }}>
                    {renderSlider("幅", selectedEl.width ?? 40, 10, W, 2, (v) => handlePropChange("width", v))}
                    {renderSlider("高さ", selectedEl.height ?? 40, 10, H, 2, (v) => handlePropChange("height", v))}
                  </div>
                )}

                {/* Circle: radius slider */}
                {selectedEl.type === "wall-circle" && (
                  <div style={{ marginTop: "4px" }}>
                    {renderSlider("半径", selectedEl.radius ?? 15, 5, Math.floor(W / 2), 1, (v) => handlePropChange("radius", v))}
                  </div>
                )}

                {/* Common controls */}
                <div style={{ display: "flex", gap: "4px", marginTop: "6px", flexWrap: "wrap" }}>
                  <button onClick={() => handleRotate(-0.1)} style={smallBtnStyle}>左回転</button>
                  <button onClick={() => handleRotate(0.1)} style={smallBtnStyle}>右回転</button>
                  <button onClick={handleDelete} style={{ ...smallBtnStyle, color: "#ff6060", borderColor: "#ff6060" }}>削除</button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: "10px", color: "#3a5878" }}>
                {placingType ? "キャンバスをクリックして配置" : "要素/フリッパーをクリックで選択"}
              </div>
            )}
          </div>

          {/* Stats */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #2a5840", background: "#060a18" }}>
            <div style={{ fontSize: "9px", color: "#4070a0", marginBottom: "4px" }}>統計</div>
            <div style={{ fontSize: "10px", color: "#80a0c8" }}>{layout.elements.length} 個の要素</div>
          </div>

          {/* Actions */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #2a5840", background: "#060a18", display: "flex", flexDirection: "column", gap: "4px" }}>
            <button onClick={onPlay} style={actionBtnStyle("#40a060", "#c0d8ff")}>プレイ</button>
            <button onClick={handleLoadDefault} style={actionBtnStyle("#2a5840", "#80a0c8")}>初期配置に戻す</button>
            <button onClick={handleClear} style={actionBtnStyle("#2a5840", "#ff8060")}>全削除</button>
          </div>

          {/* localStorage save/load */}
          <div style={{ padding: "8px 10px", background: "#040810", borderTop: "1px solid #1a2848", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ fontSize: "9px", color: "#4070a0" }}>保存スロット (ローカル)</div>
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="保存名"
              style={{ width: "100%", padding: "3px 5px", fontSize: "10px", backgroundColor: "#0c1830", color: "#a0c0e0", border: "1px solid #1a3060", fontFamily: "monospace", boxSizing: "border-box" }}
            />
            <button onClick={handleSaveToStorage} disabled={!saveName.trim()}
              style={{ ...actionBtnStyle("#2a5840", "#80c8a0"), padding: "4px 8px", fontSize: "10px", opacity: saveName.trim() ? 1 : 0.4 }}>
              この名前で保存
            </button>
            <select
              value={loadSelection}
              onChange={(e) => setLoadSelection(e.target.value)}
              style={{ width: "100%", padding: "3px 4px", fontSize: "10px", backgroundColor: "#0c1830", color: "#a0c0e0", border: "1px solid #1a3060", fontFamily: "monospace", boxSizing: "border-box" }}
            >
              <option value="">— 保存済みを選択 —</option>
              {Object.keys(savedLayouts).sort().map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <div style={{ display: "flex", gap: "4px" }}>
              <button onClick={() => handleLoadFromStorage(loadSelection)} disabled={!loadSelection}
                style={{ ...actionBtnStyle("#2a5840", "#80a0c8"), flex: 1, padding: "4px 6px", fontSize: "10px", opacity: loadSelection ? 1 : 0.4 }}>
                読み込み
              </button>
              <button onClick={handleDeleteFromStorage} disabled={!loadSelection}
                style={{ ...actionBtnStyle("#2a5840", "#ff8060"), flex: 1, padding: "4px 6px", fontSize: "10px", opacity: loadSelection ? 1 : 0.4 }}>
                削除
              </button>
            </div>
          </div>

          {/* Help */}
          <div style={{ padding: "8px 10px", background: "#040810", borderTop: "1px solid #1a2848", fontSize: "9px", color: "#2a4868", lineHeight: "1.5" }}>
            <div>角をドラッグ: サイズ変更</div>
            <div>フリッパー: クリックで選択/ドラッグで移動</div>
            <div>Del/Backspace: 削除</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slider helper ──
function renderSlider(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "3px" }}>
      <span style={{ width: "32px", fontSize: "9px", color: "#6088b0" }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ flex: 1, accentColor: "#3070c0", height: "14px" }}
      />
      <span style={{ width: "28px", textAlign: "right", fontSize: "9px", color: "#a0c0e0" }}>{value}</span>
    </div>
  );
}

const smallBtnStyle: React.CSSProperties = {
  padding: "2px 6px", fontSize: "9px", cursor: "pointer",
  backgroundColor: "#0c1830", color: "#80a0c8",
  border: "1px solid #1a3060", fontFamily: "monospace", borderRadius: "3px",
};

function actionBtnStyle(bg: string, color: string): React.CSSProperties {
  return { padding: "6px 10px", fontSize: "11px", cursor: "pointer", backgroundColor: bg, color,
    border: `1px solid ${color}40`, fontFamily: "monospace", borderRadius: "3px", letterSpacing: "1px" };
}

function loadStoredLayouts(): Record<string, TableLayoutConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

function persistStoredLayouts(layouts: Record<string, TableLayoutConfig>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch (e) {
    console.error("Failed to save layouts to localStorage", e);
    alert("ローカルストレージへの保存に失敗しました");
  }
}
