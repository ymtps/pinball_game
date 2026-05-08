import Matter from "matter-js";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG, COLLISION_CATEGORY } from "./types";

const { Engine, Bodies, Body, Events } = Matter;

export function createEngine() {
  return Engine.create({
    gravity: { x: 0, y: 1, scale: 0.001 },
    positionIterations: 15,
    velocityIterations: 8,
  });
}

// Launch lane dimensions
export const LAUNCH_LANE = {
  wallX: 355,       // x position of the separator wall
  laneWidth: 45,    // width of the lane (from wallX to right wall)
  centerX: 377,     // center of launch lane for ball spawn
  gateY: 40,        // y position of the top gate/curve
};

export function createWalls(config: GameConfig = DEFAULT_CONFIG) {
  const { width, height, wallThickness: t } = config;
  const half = t / 2;

  const walls = [
    // Top wall (only covers main playfield, not launch lane)
    Bodies.rectangle((LAUNCH_LANE.wallX) / 2, -half, LAUNCH_LANE.wallX + t, t, { isStatic: true, label: "wall" }),
    // Left wall
    Bodies.rectangle(-half, height / 2, t, height + t * 2, { isStatic: true, label: "wall" }),
    // Right wall (outer wall of launch lane)
    Bodies.rectangle(width + half, height / 2, t, height + t * 2, { isStatic: true, label: "wall" }),

    // ── Launch lane ──
    // Separator wall (left wall of launch lane) - from below top curve down to above drain
    Bodies.rectangle(LAUNCH_LANE.wallX, height * 0.45, t * 0.6, height * 0.75, { isStatic: true, label: "wall" }),

    // Top curve piece - angled wall to redirect ball from launch lane into playfield
    Bodies.rectangle(LAUNCH_LANE.wallX + 10, LAUNCH_LANE.gateY, LAUNCH_LANE.laneWidth + 10, t * 0.6, {
      isStatic: true, label: "wall", angle: 0.15,
    }),

    // Small bottom wall for launch lane (keeps ball in lane before launch)
    Bodies.rectangle(LAUNCH_LANE.centerX, height - 30, LAUNCH_LANE.laneWidth, t * 0.6, { isStatic: true, label: "wall" }),
  ];

  // Set collision filter for table layer
  walls.forEach((wall) => {
    wall.collisionFilter = {
      category: COLLISION_CATEGORY.TABLE,
      mask: COLLISION_CATEGORY.TABLE | COLLISION_CATEGORY.RAMP,
    };
  });

  return walls;
}

export function createDrainSensor(config: GameConfig = DEFAULT_CONFIG) {
  const { height } = config;
  // Drain only covers main playfield area (not launch lane)
  return Bodies.rectangle(LAUNCH_LANE.wallX / 2, height + 30, LAUNCH_LANE.wallX + 20, 20, {
    isStatic: true,
    isSensor: true,
    label: "drain",
  });
}

export function createBall(x: number, y: number, config: GameConfig = DEFAULT_CONFIG) {
  return Bodies.circle(x, y, config.ballRadius, {
    restitution: 0.5,
    friction: 0.01,
    density: 0.004,
    label: "ball",
    collisionFilter: {
      category: COLLISION_CATEGORY.TABLE,
      mask: COLLISION_CATEGORY.TABLE,
    },
  });
}

export function setupSpeedLimit(
  engine: Matter.Engine,
  maxSpeed: number = DEFAULT_CONFIG.maxBallSpeed
) {
  Events.on(engine, "beforeUpdate", () => {
    const bodies = engine.world.bodies;
    for (const body of bodies) {
      if (body.label === "ball") {
        const speed = Body.getSpeed(body);
        if (speed > maxSpeed) {
          Body.setSpeed(body, maxSpeed);
        }
      }
    }
  });
}
