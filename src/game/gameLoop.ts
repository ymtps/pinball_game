import Matter from "matter-js";
import { renderGame } from "./renderer";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG } from "./types";

const { Engine } = Matter;

export interface GameLoop {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

export function createGameLoop(
  engine: Matter.Engine,
  ctx: CanvasRenderingContext2D,
  config: GameConfig = DEFAULT_CONFIG,
  onUpdate?: (delta: number) => void
): GameLoop {
  let rafId: number | null = null;
  let lastTime = 0;
  let running = false;

  function loop(timestamp: number) {
    if (!running) return;

    const delta = Math.min(timestamp - lastTime, 33); // Cap at ~30fps minimum
    lastTime = timestamp;

    if (delta > 0) {
      // Call update callback (for input processing, etc.)
      onUpdate?.(delta);

      // Substep physics for tunneling prevention
      const subDelta = delta / config.substeps;
      for (let i = 0; i < config.substeps; i++) {
        Engine.update(engine, subDelta);
      }

      // Render
      renderGame(ctx, engine, config);
    }

    rafId = requestAnimationFrame(loop);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTime = performance.now();
      rafId = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    isRunning() {
      return running;
    },
  };
}
