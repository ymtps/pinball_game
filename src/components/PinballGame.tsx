import { useEffect, useRef } from "react";
import Matter from "matter-js";
import { createEngine, createWalls, setupSpeedLimit } from "../game/engine";
import type { GameLoop } from "../game/gameLoop";
import { createGameLoop } from "../game/gameLoop";
import { BallManager } from "../game/ball";
import { createFlippers, addFlippersToWorld, updateFlipper } from "../game/flipper";
import type { Flipper } from "../game/flipper";
import { createInputHandler } from "../game/input";
import { DEFAULT_CONFIG } from "../game/types";

const { World } = Matter;

export function PinballGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const gameLoopRef = useRef<GameLoop | null>(null);
  const ballManagerRef = useRef<BallManager | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Create engine
    const engine = createEngine();
    engineRef.current = engine;

    // Create walls
    const walls = createWalls();
    World.add(engine.world, walls);

    // Setup speed limit
    setupSpeedLimit(engine);

    // Create flippers
    const flippers: Flipper[] = createFlippers();
    addFlippersToWorld(engine.world, flippers);

    // Create ball manager and add a ball
    const ballManager = new BallManager(engine.world);
    ballManagerRef.current = ballManager;
    ballManager.addBall(DEFAULT_CONFIG.width / 2, 100);

    // Setup input
    const input = createInputHandler();
    input.attach();

    // Create and start game loop with input processing
    const gameLoop = createGameLoop(engine, ctx, DEFAULT_CONFIG, () => {
      // Update flippers based on input state
      for (const flipper of flippers) {
        const isActive =
          flipper.side === "left"
            ? input.keyState.leftFlipper
            : input.keyState.rightFlipper;
        updateFlipper(flipper, isActive);
      }
    });
    gameLoopRef.current = gameLoop;
    gameLoop.start();

    return () => {
      gameLoop.stop();
      input.detach();
      Matter.Engine.clear(engine);
      engineRef.current = null;
      gameLoopRef.current = null;
      ballManagerRef.current = null;
    };
  }, []);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#0a0a1a" }}>
      <canvas
        ref={canvasRef}
        width={DEFAULT_CONFIG.width}
        height={DEFAULT_CONFIG.height}
        style={{ border: "2px solid #333" }}
      />
    </div>
  );
}
