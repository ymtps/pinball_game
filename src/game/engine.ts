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

export function createWalls(config: GameConfig = DEFAULT_CONFIG) {
  const { width, height, wallThickness: t } = config;
  const half = t / 2;

  const walls = [
    // Top wall
    Bodies.rectangle(width / 2, -half, width + t * 2, t, { isStatic: true, label: "wall" }),
    // Left wall
    Bodies.rectangle(-half, height / 2, t, height + t * 2, { isStatic: true, label: "wall" }),
    // Right wall
    Bodies.rectangle(width + half, height / 2, t, height + t * 2, { isStatic: true, label: "wall" }),
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
  const { width, height } = config;
  return Bodies.rectangle(width / 2, height + 30, width + 40, 20, {
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
