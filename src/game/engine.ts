import Matter from "matter-js";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG, COLLISION_CATEGORY } from "./types";

const { Engine, Bodies, Body, Events } = Matter;

// Playfield = the area where the ball actually plays (excludes launch lane)
export const PLAYFIELD_WIDTH = 340;

// Launch lane on the right side
export const LAUNCH_LANE = {
  wallX: PLAYFIELD_WIDTH,
  laneWidth: DEFAULT_CONFIG.width - PLAYFIELD_WIDTH,
  centerX: PLAYFIELD_WIDTH + (DEFAULT_CONFIG.width - PLAYFIELD_WIDTH) / 2,
  gateY: 35,
};

// Flipper / drain area geometry
const FLIPPER_Y = 640;
const DRAIN_CENTER_X = PLAYFIELD_WIDTH / 2;  // 170
const DRAIN_GAP = 50; // gap between flippers where ball drains

export const TABLE_GEOMETRY = {
  playfieldWidth: PLAYFIELD_WIDTH,
  flipperY: FLIPPER_Y,
  drainCenterX: DRAIN_CENTER_X,
  drainGap: DRAIN_GAP,
};

export function createEngine() {
  return Engine.create({
    gravity: { x: 0, y: 1, scale: 0.001 },
    positionIterations: 15,
    velocityIterations: 8,
  });
}

export function createWalls(config: GameConfig = DEFAULT_CONFIG) {
  const { height, wallThickness: t } = config;
  const half = t / 2;

  const walls = [
    // Outer boundary walls (non-editable infrastructure)
    Bodies.rectangle(config.width / 2, -half, config.width + t, t, {
      isStatic: true, label: "wall",
    }),
    Bodies.rectangle(-half, height / 2, t, height + t * 2, {
      isStatic: true, label: "wall",
    }),
    Bodies.rectangle(config.width + half, height / 2, t, height + t * 2, {
      isStatic: true, label: "wall",
    }),
    // Launch lane bottom stop (part of plunger mechanism)
    Bodies.rectangle(LAUNCH_LANE.centerX, height - 25, LAUNCH_LANE.laneWidth - 2, t * 0.5, {
      isStatic: true, label: "wall",
    }),
  ];

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
  // Drain sensor below flippers (full width including launch lane)
  return Bodies.rectangle(config.width / 2, height + 20, config.width, 30, {
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
    for (const body of engine.world.bodies) {
      if (body.label === "ball") {
        if (Body.getSpeed(body) > maxSpeed) {
          Body.setSpeed(body, maxSpeed);
        }
      }
    }
  });
}
