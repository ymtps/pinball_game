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
import { addHitEffect, addScorePopup, updateVisualState } from "../game/renderer";
import { initAudio, playSound } from "../game/soundManager";
import type { SoundType } from "../game/soundManager";
import type { GamePhase } from "../game/types";
import { DEFAULT_CONFIG } from "../game/types";
import type { TableLayoutConfig } from "../game/tableConfig";

const { World, Events, Body } = Matter;

interface PinballGameProps {
  layout?: TableLayoutConfig;
  onBackToEditor?: () => void;
}

export function PinballGame({ layout, onBackToEditor }: PinballGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const gameLoopRef = useRef<GameLoop | null>(null);
  const ballManagerRef = useRef<BallManager | null>(null);
  const gameStateRef = useRef<GameState>(new GameState());
  const plungerRef = useRef<Plunger>(new Plunger());

  const [phase, setPhase] = useState<GamePhase>("title");
  const [score, setScore] = useState(0);
  const [ballInfo, setBallInfo] = useState({ current: 1, remaining: 3 });
  const [statusText, setStatusText] = useState("STARTを押してね");

  const ballLaunchedRef = useRef(false);
  const waitingForLaunchRef = useRef(false);
  const spinnerAngleRef = useRef(0);
  const plungerRecoilRef = useRef(0);

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
      onGameOver: () => { setPhase("gameOver"); setStatusText("ゲームオーバー"); },
      onGameStart: () => { setPhase("playing"); setStatusText("発射せよ!"); },
    });

    const engine = createEngine();
    engineRef.current = engine;

    const walls = createWalls();
    const drain = createDrainSensor();
    World.add(engine.world, [...walls, drain]);
    setupSpeedLimit(engine);
    plunger.addToWorld(engine.world);

    const flippers: Flipper[] = createFlippers(
      layout?.flippers ? { left: layout.flippers.left, right: layout.flippers.right } : undefined
    );
    addFlippersToWorld(engine.world, flippers);

    const tableElements = createTableElements(DEFAULT_CONFIG, layout);
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
            bumper: "#ff6633", slingshot: "#ffaa00",
            lane: "#4488ff", "drop-target": "#44ff44",
            ramp: "#aa44ff", spinner: "#ffff44",
            "standup-target": "#44ccff", "kickout-hole": "#ff44ff",
            "top-lane": "#ffdd00", "inlane": "#4488ff",
          };
          addHitEffect(position.x, position.y, colors[label] || "#ff0");
          const soundMap: Record<string, SoundType> = {
            bumper: "bumper", slingshot: "slingshot",
            "drop-target": "dropTarget", lane: "score", ramp: "score",
            spinner: "spinner", "standup-target": "standupTarget",
            "kickout-hole": "kickout", "top-lane": "score",
            "inlane": "score",
          };
          playSound(soundMap[label] || "score");

          if (label === "ramp") setStatusText("ランプボーナス!");
          else if (label === "top-lane") setStatusText("トップレーン!");
          else if (label === "spinner") setStatusText("スピナー!");
          else if (label === "standup-target") setStatusText("ターゲット命中!");
          else if (label === "kickout-hole") setStatusText("キックアウト!");
        }
      },
      (targetIndex) => {
        dropTargetState.add(targetIndex);
        if (dropTargetState.size >= 5 && !gameState.multiballActive) {
          gameState.activateMultiball();
          ballManager.addBall(PLAYFIELD_WIDTH / 2, 50);
          gameState.addScore(1000);
          addScorePopup(PLAYFIELD_WIDTH / 2, 50, 1000);
          addHitEffect(PLAYFIELD_WIDTH / 2, 50, "#ff00ff");
          setStatusText("マルチボール!");
        }
      },
      (type: string, data: any) => {
        if (type === "kickout-hole" && data.ballBody) {
          const ballBody = data.ballBody as Matter.Body;
          Body.setStatic(ballBody, true);
          playSound("kickout");
          setTimeout(() => {
            if (ballBody.isStatic) {
              Body.setStatic(ballBody, false);
              Body.setVelocity(ballBody, { x: 3, y: -8 });
            }
          }, 500);
        }
        if (type === "spinner-sensor") {
          spinnerAngleRef.current += 0.5;
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
                setStatusText("発射せよ!");
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
      // Update plunger visual state
      updateVisualState({ plungerCharge: plunger.getChargePercent() });
      // Decay recoil animation
      if (plungerRecoilRef.current > 0.01) {
        plungerRecoilRef.current *= 0.85;
        updateVisualState({ plungerRecoil: plungerRecoilRef.current });
      } else if (plungerRecoilRef.current > 0) {
        plungerRecoilRef.current = 0;
        updateVisualState({ plungerRecoil: 0 });
      }
      if (gameState.phase === "playing") {
        const balls = ballManager.getBalls();
        const currentBall = balls.length > 0 ? balls[0] : null;
        // Re-engage plunger if ball returned to launch lane
        if (ballLaunchedRef.current && currentBall) {
          const bx = currentBall.position.x;
          const by = currentBall.position.y;
          const speed = Math.sqrt(currentBall.velocity.x ** 2 + currentBall.velocity.y ** 2);
          if (bx > 340 && by > 600 && speed < 2) {
            ballLaunchedRef.current = false;
            setStatusText("発射せよ!");
          }
        }
        if (!ballLaunchedRef.current) {
          const launched = plunger.update(input.keyState.plunger, currentBall);
          if (launched) {
            ballLaunchedRef.current = true;
            plungerRecoilRef.current = 1.0;
            updateVisualState({ plungerRecoil: 1.0 });
            playSound("launch");
            setStatusText("頑張れ!");
          }
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
  }, [layout]);

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
    setStatusText("STARTを押してね");
  }

  const sidebarW = 200;

  return (
    <div style={{
      display: "flex", justifyContent: "center", alignItems: "center",
      height: "100vh", backgroundColor: "#030610",
    }}>
      <div style={{ display: "flex", border: "3px solid #3060a0", backgroundColor: "#080c1a", borderRadius: "12px", overflow: "hidden" }}>
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
              <div style={{ fontSize: "28px", fontWeight: "bold", color: "#c0d8ff", textShadow: "0 2px 0 #0a1020, 0 0 24px rgba(80,160,255,0.5)", letterSpacing: "3px" }}>
                カスタムピンボール
              </div>
              <button onClick={handleStart} style={buttonStyle}>
                ゲームスタート
              </button>
              <div style={{ fontSize: "11px", color: "#555", marginTop: "15px" }}>
                Z/X または 矢印キー: フリッパー
              </div>
              <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>
                スペース: ボール発射
              </div>
            </div>
          )}

          {/* Game over overlay */}
          {phase === "gameOver" && (
            <div style={overlayStyle}>
              <div style={{ fontSize: "28px", fontWeight: "bold", color: "#ff8844", textShadow: "0 0 15px #cc5522" }}>
                ゲームオーバー
              </div>
              <div style={{ fontSize: "22px", color: "#ffe060", marginTop: "10px" }}>
                {score.toLocaleString()} 点
              </div>
              <div style={{ fontSize: "12px", color: "#5080a8", marginTop: "5px" }}>
                ハイスコア: {gameStateRef.current.highScore.toLocaleString()}
              </div>
              <button onClick={handleRestart} style={buttonStyle}>
                もう一回
              </button>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div style={{
          width: sidebarW, display: "flex", flexDirection: "column",
          backgroundColor: "#080c1a", fontFamily: "monospace",
          borderLeft: "2px solid #1a3060",
        }}>
          <div style={{
            padding: "15px 10px",
            borderBottom: "2px solid #1a3060",
            textAlign: "center",
            background: "linear-gradient(180deg, #0c1530 0%, #060a18 100%)",
          }}>
            <div style={{
              fontSize: "18px", fontWeight: "bold", color: "#c0d8ff",
              lineHeight: "1.2", letterSpacing: "1px",
              textShadow: "0 1px 0 #0a1830, 0 0 12px rgba(80,160,255,0.3)",
            }}>
              カスタムピンボール
            </div>
            {/* Ball counter */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              marginTop: "10px", gap: "6px",
            }}>
              <span style={{ fontSize: "13px", color: "#888" }}>ボール</span>
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
            borderBottom: "2px solid #1a3060",
            background: "#060a18",
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
            borderBottom: "2px solid #1a3060",
            background: "#060a18",
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
                マルチボール発動中
              </div>
            )}
          </div>

          {/* Controls help */}
          <div style={{
            padding: "10px 12px",
            background: "#040810",
            fontSize: "10px", color: "#304868",
            lineHeight: "1.6",
          }}>
            <div>Z / 左矢印: 左フリッパー</div>
            <div>X / 右矢印: 右フリッパー</div>
            <div>スペース: ボール発射</div>
          </div>

          {/* High score */}
          <div style={{
            padding: "8px 12px",
            background: "#040810",
            borderTop: "1px solid #1a2848",
            fontSize: "10px", color: "#405880",
          }}>
            ハイスコア: {gameStateRef.current.highScore.toLocaleString()}
          </div>

          {onBackToEditor && (
            <div style={{ padding: "8px 12px", background: "#040810", borderTop: "1px solid #1a3828" }}>
              <button onClick={onBackToEditor} style={{
                ...buttonStyle, width: "100%", marginTop: 0, padding: "6px 0", fontSize: "11px",
              }}>
                盤面編集
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "absolute", inset: 0,
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
  backgroundColor: "rgba(3,6,16,0.9)",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 28px", fontSize: "14px", cursor: "pointer",
  backgroundColor: "#0c1830", color: "#c0d8ff",
  border: "2px solid #3060a0", fontFamily: "monospace",
  marginTop: "20px", letterSpacing: "2px",
  transition: "all 0.2s",
};
