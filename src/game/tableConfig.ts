// Data-driven table layout configuration
// Each element has a type, position, and optional properties

export type ElementType =
  | "bumper"
  | "drop-target"
  | "standup-target"
  | "slingshot-left"
  | "slingshot-right"
  | "spinner"
  | "kickout-hole"
  | "guide-pin"
  | "wall-rect"
  | "wall-circle"
  | "wall-triangle";

export interface ElementConfig {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  angle?: number;        // radians
  width?: number;        // wall-rect / wall-triangle width
  height?: number;       // wall-rect / wall-triangle height
  cornerRadius?: number; // wall-rect corner radius
  radius?: number;       // wall-circle radius
}

export interface FlipperConfig {
  pivotX: number;
  pivotY: number;
  width: number;
  height: number;
}

export interface TableLayoutConfig {
  name: string;
  elements: ElementConfig[];
  flippers?: { left: FlipperConfig; right: FlipperConfig };
}

export const DEFAULT_FLIPPERS: { left: FlipperConfig; right: FlipperConfig } = {
  left:  { pivotX: 105, pivotY: 640, width: 65, height: 12 },
  right: { pivotX: 235, pivotY: 640, width: 65, height: 12 },
};

export function getFlipperConfig(layout: TableLayoutConfig, side: "left" | "right"): FlipperConfig {
  return layout.flippers?.[side] ?? DEFAULT_FLIPPERS[side];
}

let nextId = 1;
export function generateId(): string {
  return `el-${nextId++}`;
}

export function resetIdCounter(max?: number) {
  nextId = (max ?? 0) + 1;
}

// Palette definitions: what's available to place
export const ELEMENT_PALETTE: { type: ElementType; label: string; color: string }[] = [
  { type: "bumper", label: "バンパー", color: "#80c8a0" },
  { type: "drop-target", label: "ドロップ", color: "#e03030" },
  { type: "standup-target", label: "スタンド", color: "#e080c0" },
  { type: "slingshot-left", label: "スリング左", color: "#40a878" },
  { type: "slingshot-right", label: "スリング右", color: "#40a878" },
  { type: "spinner", label: "スピナー", color: "#88aa88" },
  { type: "kickout-hole", label: "キックアウト", color: "#222" },
  { type: "guide-pin", label: "ガイドピン", color: "#c0d8c8" },
  { type: "wall-rect", label: "壁(長方形)", color: "#a0b8a8" },
  { type: "wall-circle", label: "壁(円形)", color: "#a0b8a8" },
  { type: "wall-triangle", label: "壁(三角形)", color: "#a0b8a8" },
];

// Default layout
export function getDefaultLayout(): TableLayoutConfig {
  resetIdCounter();
  return {
    name: "Space Pinball",
    flippers: { left: { ...DEFAULT_FLIPPERS.left }, right: { ...DEFAULT_FLIPPERS.right } },
    elements: [
      // ── Launch lane separator (extends nearly to the top to keep ball trapped in lane until deflected) ──
      { id: generateId(), type: "wall-rect" as ElementType, x: 340, y: 425, width: 10, height: 550, cornerRadius: 0 },

      // ── Launch lane top cap: slopes down-right so launched ball deflects DOWN-LEFT into the playfield ──
      { id: generateId(), type: "wall-rect" as ElementType, x: 370, y: 30, width: 70, height: 8, angle: 0.55, cornerRadius: 2 },

      // ── Top lane guide pins (3 lanes between 4 pin columns) ──
      ...[60, 130, 210, 280].flatMap((px) =>
        [105, 130].map((py) => ({
          id: generateId(),
          type: "guide-pin" as ElementType,
          x: px, y: py,
        }))
      ),

      // ── Spinner (upper-left, on the descent path) ──
      { id: generateId(), type: "spinner" as ElementType, x: 55, y: 175 },

      // ── Kick-out hole (below spinner) ──
      { id: generateId(), type: "kickout-hole" as ElementType, x: 50, y: 245 },

      // ── Drop targets (right column) ──
      { id: generateId(), type: "drop-target" as ElementType, x: 295, y: 165 },
      { id: generateId(), type: "drop-target" as ElementType, x: 295, y: 195 },
      { id: generateId(), type: "drop-target" as ElementType, x: 295, y: 225 },
      { id: generateId(), type: "drop-target" as ElementType, x: 295, y: 255 },
      { id: generateId(), type: "drop-target" as ElementType, x: 295, y: 285 },

      // ── Bumpers (triangle pattern, center) ──
      { id: generateId(), type: "bumper" as ElementType, x: 135, y: 340 },
      { id: generateId(), type: "bumper" as ElementType, x: 215, y: 340 },
      { id: generateId(), type: "bumper" as ElementType, x: 175, y: 410 },

      // ── Triangle deflectors flanking the bumper area ──
      { id: generateId(), type: "wall-triangle" as ElementType, x: 45,  y: 390, width: 30, height: 45, angle: 0 },
      { id: generateId(), type: "wall-triangle" as ElementType, x: 295, y: 390, width: 30, height: 45, angle: 0 },

      // ── Standup targets (side rails) ──
      { id: generateId(), type: "standup-target" as ElementType, x: 30,  y: 465, angle: 0.25 },
      { id: generateId(), type: "standup-target" as ElementType, x: 30,  y: 505, angle: 0.25 },
      { id: generateId(), type: "standup-target" as ElementType, x: 310, y: 465, angle: -0.25 },
      { id: generateId(), type: "standup-target" as ElementType, x: 310, y: 505, angle: -0.25 },


      // ── Solid floor walls: block drainage everywhere except the central flipper gap ──
      // Drain can only happen between x=150 and x=190 (where there is no floor wall).
      { id: generateId(), type: "wall-rect" as ElementType, x: 50,  y: 610, width: 90, height: 8, angle: 0.45, cornerRadius: 4 },
      { id: generateId(), type: "wall-rect" as ElementType, x: 290, y: 610, width: 90, height: 8, angle: -0.45, cornerRadius: 4 },
    ],
  };
}
