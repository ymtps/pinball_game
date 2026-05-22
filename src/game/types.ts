export interface GameCallbacks {
  onScoreChange?: (score: number) => void;
  onBallChange?: (ballNumber: number, ballsRemaining: number) => void;
  onGameOver?: (finalScore: number) => void;
  onGameStart?: () => void;
}

export interface GameConfig {
  width: number;
  height: number;
  wallThickness: number;
  ballRadius: number;
  substeps: number;
  maxBallSpeed: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  width: 400,
  height: 700,
  wallThickness: 20,
  ballRadius: 8,
  substeps: 3,
  maxBallSpeed: 32,
};

export const COLLISION_CATEGORY = {
  TABLE: 0x0001,
  RAMP: 0x0002,
} as const;

export type GamePhase = "title" | "playing" | "gameOver";
