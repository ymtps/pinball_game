import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { createEngine, createWalls, createDrainSensor, setupSpeedLimit, PLAYFIELD_WIDTH } from "../game/engine";
import type { GameLoop } from "../game/gameLoop";
import { createGameLoop } from "../game/gameLoop";
import { BallManager } from "../game/ball";
import { createFlippers, addFlippersToWorld, updateFlipper } from "../game/flipper";
import type { Flipper } from "../game/flipper";
import { createInputHandler } from "../game/input";
import { Plunger } from "../game/plunger";
import { GameState } from "../game/gameState";
import { createTableElements, setupTableCollisions, processRemovalQueue, resetDropTargets } from "../game/table";
import { addHitEffect, addScorePopup } from "../game/renderer";
import { initAudio, playSound } from "../game/soundManager";
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
  const [statusText, setStatusText] = useState("Press START");

  const ballLaunchedRef = useRef(false);
  const waitingForLaunchRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gameState = gameStateRef.current;
    const plunger = plungerRef.current;

    gameState.setCallbacks({
      onScoreChange: (s) => setScore(s),
      onBallChange: (current, remaining) => setBallInfo({ current, remaining }),
      onGameOver: () => { setPhase("gameOver"); setStatusText("GAME OVER"); },
      onGameStart: () => { setPhase("playing"); setStatusText("Launch Ball!"); },
    });

    const engine = createEngine();
    engineRef.current = engine;

    const walls = createWalls();
    const drain = createDrainSensor();
    World.add(engine.world, [...walls, drain]);
    setupSpeedLimit(engine);

    const flippers: Flipper[] = createFlippers();
    addFlippersToWorld(engine.world, flippers);

    const tableElements = createTableElements();
    World.add(engine.world, tableElements.allBodies);

    const dropTargetState = new Set<number>();

    setupTableCollisions(
      engine,
      tableElements,
      (points, label, position) => {
        if (gameState.phase === "playing") {
          gameState.addScore(points);
          addScorePopup(position.x, position.y, points);
          const colors: Record<string, string> = {
            bumper: "#ff6633",
            slingshot: "#ffaa00",
            lane: "#4488ff",
            "drop-target": "#44ff44",
            ramp: "#aa44ff",
          };
          addHitEffect(position.x, position.y, colors[label] || "#ff0");
          const soundMap: Record<string, "bumper" | "slingshot" | "dropTarget" | "score"> = {
            bumper: "bumper", slingshot: "slingshot",
            "drop-target": "dropTarget", lane: "score", ramp: "score",
          };
          playSound(soundMap[label] || "score");

          if (label === "ramp") setStatusText("Ramp Bonus!");
          else if (label === "lane") setStatusText("Lane Complete!");
        }
      },
      (targetIndex) => {
        dropTargetState.add(targetIndex);
        if (dropTargetState.size >= 4 && !gameState.multiballActive) {
          gameState.activateMultiball();
          ballManager.addBall(PLAYFIELD_WIDTH / 2, 50);
          gameState.addScore(1000);
          addScorePopup(PLAYFIELD_WIDTH / 2, 50, 1000);
          addHitEffect(PLAYFIELD_WIDTH / 2, 50, "#ff00ff");
          setStatusText("MULTIBALL!");
        }
      }
    );

    const ballManager = new BallManager(engine.world);
    ballManagerRef.current = ballManager;

    const input = createInputHandler();
    input.attach();

    Events.on(engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        if (labels.includes("drain") && labels.includes("ball")) {
          const ballBody = pair.bodyA.label === "ball" ? pair.bodyA : pair.bodyB;
          setTimeout(() => {
            ballManager.removeBall(ballBody);
            ballLaunchedRef.current = false;
            playSound("drain");
            if (gameState.phase === "playing") {
              const result = gameState.drainBall();
              if (result === "continue") {
                resetDropTargets(engine.world, tableElements.dropTargets);
                dropTargetState.clear();
                waitingForLaunchRef.current = true;
                spawnBallAtPlunger();
                setStatusText("Launch Ball!");
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

    const gameLoop = createGameLoop(engine, ctx, DEFAULT_CONFIG, () => {
      processRemovalQueue(engine.world);
      for (const flipper of flippers) {
        const isActive = flipper.side === "left"
          ? input.keyState.leftFlipper : input.keyState.rightFlipper;
        const wasAtRest = flipper.side === "left"
          ? flipper.body.angle >= flipper.restAngle - 0.05
          : flipper.body.angle <= flipper.restAngle + 0.05;
        updateFlipper(flipper, isActive);
        if (isActive && wasAtRest) playSound("flipper");
      }
      if (gameState.phase === "playing" && !ballLaunchedRef.current) {
        const balls = ballManager.getBalls();
        const currentBall = balls.length > 0 ? balls[0] : null;
        const launched = plunger.update(input.keyState.plunger, currentBall);
        if (launched) {
          ballLaunchedRef.current = true;
          playSound("launch");
          setStatusText("Good Luck!");
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
    initAudio();
    gameState.startGame();
    ballManager.removeAllBalls();
    ballManager.addBall(plunger.launchX, plunger.launchY);
    ballLaunchedRef.current = false;
    waitingForLaunchRef.current = true;
  }

  function handleRestart() {
    gameStateRef.current.reset();
    setPhase("title");
    setStatusText("Press START");
  }

  const sidebarW = 200;

  return (
    <div style={{
      display: "flex", justifyContent: "center", alignItems: "center",
      height: "100vh", backgroundColor: "#0a0a0a",
    }}>
      <div style={{ display: "flex", border: "3px solid #2a2a3a", backgroundColor: "#111118" }}>
        {/* ── Table ── */}
        <div style={{ position: "relative" }}>
          <canvas
            ref={canvasRef}
            width={DEFAULT_CONFIG.width}
            height={DEFAULT_CONFIG.height}
            style={{ display: "block" }}
          />

          {/* Title overlay */}
          {phase === "title" && (
            <div style={overlayStyle}>
              <div style={{ fontSize: "36px", fontWeight: "bold", color: "#cc88ff", textShadow: "0 0 20px #8844cc", letterSpacing: "4px" }}>
                PINBALL
              </div>
              <div style={{ fontSize: "12px", color: "#8866aa", marginTop: "5px", letterSpacing: "2px" }}>
                SPACE MISSION
              </div>
              <button onClick={handleStart} style={buttonStyle}>
                START GAME
              </button>
              <div style={{ fontSize: "11px", color: "#555", marginTop: "15px" }}>
                Z/X or Arrow Keys: Flippers
              </div>
              <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>
                Space: Launch Ball
              </div>
            </div>
          )}

          {/* Game over overlay */}
          {phase === "gameOver" && (
            <div style={overlayStyle}>
              <div style={{ fontSize: "28px", fontWeight: "bold", color: "#ff6644", textShadow: "0 0 15px #cc3322" }}>
                GAME OVER
              </div>
              <div style={{ fontSize: "22px", color: "#ffcc44", marginTop: "10px" }}>
                {score.toLocaleString()}
              </div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "5px" }}>
                HIGH SCORE: {gameStateRef.current.highScore.toLocaleString()}
              </div>
              <button onClick={handleRestart} style={buttonStyle}>
                PLAY AGAIN
              </button>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div style={{
          width: sidebarW, display: "flex", flexDirection: "column",
          backgroundColor: "#111118", fontFamily: "monospace",
          borderLeft: "2px solid #2a2a3a",
        }}>
          {/* Logo area */}
          <div style={{
            padding: "15px 10px",
            borderBottom: "2px solid #2a2a3a",
            textAlign: "center",
            background: "linear-gradient(180deg, #151528 0%, #0d0d1a 100%)",
          }}>
            <div style={{ fontSize: "12px", color: "#6655aa", letterSpacing: "2px" }}>
              3D Pinball
            </div>
            <div style={{
              fontSize: "28px", fontWeight: "bold",
              background: "linear-gradient(180deg, #cc88ff, #8844cc)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              lineHeight: "1.1", marginTop: "2px",
            }}>
              Space
            </div>
            <div style={{
              fontSize: "20px", fontStyle: "italic", color: "#ff8844",
              textShadow: "0 0 8px rgba(255,136,68,0.5)",
            }}>
              Mission
            </div>
            {/* Ball counter */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              marginTop: "10px", gap: "6px",
            }}>
              <span style={{ fontSize: "13px", color: "#888" }}>BALL</span>
              <span style={{
                fontSize: "18px", fontWeight: "bold", color: "#ffcc00",
                backgroundColor: "#222", padding: "2px 8px",
                border: "1px solid #444",
              }}>
                {ballInfo.current}
              </span>
            </div>
          </div>

          {/* Score area */}
          <div style={{
            padding: "12px 10px",
            borderBottom: "2px solid #2a2a3a",
            background: "#0e0e18",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{
                fontSize: "16px", fontWeight: "bold", color: "#ffcc00",
                minWidth: "16px",
              }}>
                1
              </span>
              <span style={{
                fontSize: "18px", fontWeight: "bold", color: "#ffdd44",
                textShadow: "0 0 6px rgba(255,220,68,0.3)",
                letterSpacing: "1px",
              }}>
                {score.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Status area */}
          <div style={{
            padding: "15px 12px",
            borderBottom: "2px solid #2a2a3a",
            background: "#0e0e18",
            flex: 1,
          }}>
            <div style={{
              fontSize: "15px", fontWeight: "bold", color: "#ddd",
              lineHeight: "1.4",
            }}>
              {statusText}
            </div>

            {phase === "playing" && gameStateRef.current.multiballActive && (
              <div style={{
                marginTop: "10px", fontSize: "13px", color: "#ff44ff",
                textShadow: "0 0 8px rgba(255,68,255,0.5)",
              }}>
                MULTIBALL ACTIVE
              </div>
            )}
          </div>

          {/* Controls help */}
          <div style={{
            padding: "10px 12px",
            background: "#0a0a14",
            fontSize: "10px", color: "#444",
            lineHeight: "1.6",
          }}>
            <div>Z / Left Arrow: Left Flipper</div>
            <div>X / Right Arrow: Right Flipper</div>
            <div>Space: Launch Ball</div>
          </div>

          {/* High score */}
          <div style={{
            padding: "8px 12px",
            background: "#0a0a14",
            borderTop: "1px solid #1a1a2a",
            fontSize: "10px", color: "#555",
          }}>
            HIGH SCORE: {gameStateRef.current.highScore.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "absolute", inset: 0,
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
  backgroundColor: "rgba(5,5,15,0.85)",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 28px", fontSize: "14px", cursor: "pointer",
  backgroundColor: "#1a1a30", color: "#cc88ff",
  border: "2px solid #4a3a6a", fontFamily: "monospace",
  marginTop: "20px", letterSpacing: "2px",
  transition: "all 0.2s",
};
