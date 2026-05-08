import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { createEngine, createWalls, createDrainSensor, setupSpeedLimit } from "../game/engine";
import type { GameLoop } from "../game/gameLoop";
import { createGameLoop } from "../game/gameLoop";
import { BallManager } from "../game/ball";
import { createFlippers, addFlippersToWorld, updateFlipper } from "../game/flipper";
import type { Flipper } from "../game/flipper";
import { createInputHandler } from "../game/input";
import { Plunger } from "../game/plunger";
import { GameState } from "../game/gameState";
import type { GamePhase } from "../game/types";
import { DEFAULT_CONFIG } from "../game/types";

const { World, Events } = Matter;

export function PinballGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const gameLoopRef = useRef<GameLoop | null>(null);
  const ballManagerRef = useRef<BallManager | null>(null);
  const gameStateRef = useRef<GameState>(new GameState());
  const plungerRef = useRef<Plunger>(new Plunger());

  const [phase, setPhase] = useState<GamePhase>("title");
  const [score, setScore] = useState(0);
  const [ballInfo, setBallInfo] = useState({ current: 1, remaining: 3 });

  // Track whether ball is in play (launched from plunger)
  const ballLaunchedRef = useRef(false);
  // Track if we're waiting for plunger launch
  const waitingForLaunchRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gameState = gameStateRef.current;
    const plunger = plungerRef.current;

    // Set up callbacks from game state to React
    gameState.setCallbacks({
      onScoreChange: (s) => setScore(s),
      onBallChange: (current, remaining) => setBallInfo({ current, remaining }),
      onGameOver: () => setPhase("gameOver"),
      onGameStart: () => setPhase("playing"),
    });

    // Create engine
    const engine = createEngine();
    engineRef.current = engine;

    // Create walls and drain sensor
    const walls = createWalls();
    const drain = createDrainSensor();
    World.add(engine.world, [...walls, drain]);

    // Setup speed limit
    setupSpeedLimit(engine);

    // Create flippers
    const flippers: Flipper[] = createFlippers();
    addFlippersToWorld(engine.world, flippers);

    // Create ball manager
    const ballManager = new BallManager(engine.world);
    ballManagerRef.current = ballManager;

    // Setup input
    const input = createInputHandler();
    input.attach();

    // Drain detection
    Events.on(engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        if (labels.includes("drain") && labels.includes("ball")) {
          const ballBody = pair.bodyA.label === "ball" ? pair.bodyA : pair.bodyB;

          // Queue removal for next frame
          setTimeout(() => {
            ballManager.removeBall(ballBody);
            ballLaunchedRef.current = false;

            if (gameState.phase === "playing") {
              const continueGame = gameState.drainBall();
              if (continueGame) {
                // Spawn new ball at plunger
                waitingForLaunchRef.current = true;
                spawnBallAtPlunger();
              }
            }
          }, 0);
        }
      }
    });

    function spawnBallAtPlunger() {
      ballManager.removeAllBalls();
      ballManager.addBall(plunger.launchX, plunger.launchY);
      ballLaunchedRef.current = false;
      plunger.reset();
    }

    // Game loop with input processing
    const gameLoop = createGameLoop(engine, ctx, DEFAULT_CONFIG, () => {
      // Update flippers
      for (const flipper of flippers) {
        const isActive =
          flipper.side === "left"
            ? input.keyState.leftFlipper
            : input.keyState.rightFlipper;
        updateFlipper(flipper, isActive);
      }

      // Plunger logic - only when ball hasn't been launched yet
      if (gameState.phase === "playing" && !ballLaunchedRef.current) {
        const balls = ballManager.getBalls();
        const currentBall = balls.length > 0 ? balls[0] : null;
        const launched = plunger.update(input.keyState.plunger, currentBall);
        if (launched) {
          ballLaunchedRef.current = true;
        }
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

  function handleStart() {
    const gameState = gameStateRef.current;
    const ballManager = ballManagerRef.current;
    const plunger = plungerRef.current;

    if (!ballManager) return;

    gameState.startGame();
    ballManager.removeAllBalls();
    ballManager.addBall(plunger.launchX, plunger.launchY);
    ballLaunchedRef.current = false;
    waitingForLaunchRef.current = true;
  }

  function handleRestart() {
    const gameState = gameStateRef.current;
    gameState.reset();
    setPhase("title");
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#0a0a1a", position: "relative" }}>
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={DEFAULT_CONFIG.width}
          height={DEFAULT_CONFIG.height}
          style={{ border: "2px solid #333", display: "block" }}
        />

        {/* HUD */}
        {phase === "playing" && (
          <div style={{
            position: "absolute", top: 10, left: 10, right: 10,
            display: "flex", justifyContent: "space-between",
            color: "#fff", fontFamily: "monospace", fontSize: "14px",
            pointerEvents: "none",
          }}>
            <span>SCORE: {score.toLocaleString()}</span>
            <span>BALL {ballInfo.current}/{gameStateRef.current.totalBalls}</span>
          </div>
        )}

        {/* Title Screen */}
        {phase === "title" && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.8)", color: "#fff",
          }}>
            <h1 style={{ fontSize: "32px", marginBottom: "20px", fontFamily: "monospace" }}>PINBALL</h1>
            <button
              onClick={handleStart}
              style={{
                padding: "12px 32px", fontSize: "18px", cursor: "pointer",
                backgroundColor: "#333", color: "#fff", border: "2px solid #666",
                fontFamily: "monospace",
              }}
            >
              START
            </button>
            <p style={{ marginTop: "20px", fontSize: "12px", opacity: 0.6, fontFamily: "monospace" }}>
              Arrow Keys / Z,X: Flippers | Space: Launch
            </p>
          </div>
        )}

        {/* Game Over Screen */}
        {phase === "gameOver" && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.8)", color: "#fff",
          }}>
            <h1 style={{ fontSize: "28px", marginBottom: "10px", fontFamily: "monospace" }}>GAME OVER</h1>
            <p style={{ fontSize: "20px", marginBottom: "5px", fontFamily: "monospace" }}>
              SCORE: {score.toLocaleString()}
            </p>
            <p style={{ fontSize: "14px", marginBottom: "20px", fontFamily: "monospace", opacity: 0.7 }}>
              HIGH SCORE: {gameStateRef.current.highScore.toLocaleString()}
            </p>
            <button
              onClick={handleRestart}
              style={{
                padding: "12px 32px", fontSize: "18px", cursor: "pointer",
                backgroundColor: "#333", color: "#fff", border: "2px solid #666",
                fontFamily: "monospace",
              }}
            >
              REPLAY
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
