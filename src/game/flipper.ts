import Matter from "matter-js";
import { DEFAULT_CONFIG, COLLISION_CATEGORY } from "./types";
import type { GameConfig } from "./types";

const { Bodies, Body, Constraint, World } = Matter;

export interface Flipper {
  body: Matter.Body;
  constraint: Matter.Constraint;
  side: "left" | "right";
  restAngle: number;
  activeAngle: number;
}

const FLIPPER_WIDTH = 70;
const FLIPPER_HEIGHT = 14;
const FLIPPER_SLOPE = 0.15;
const ACTIVE_ANGULAR_VELOCITY = 0.3;
const REST_ANGULAR_VELOCITY = 0.08;

export function createFlippers(
  config: GameConfig = DEFAULT_CONFIG
): Flipper[] {
  const { width, height } = config;
  const bottomY = height - 80;
  const gap = 10;
  const centerX = width / 2;

  // Left flipper
  const leftX = centerX - gap - FLIPPER_WIDTH / 2 + 15;
  const leftPivotX = centerX - gap - FLIPPER_WIDTH / 2 + 15;
  const leftBody = Bodies.trapezoid(leftX, bottomY, FLIPPER_WIDTH, FLIPPER_HEIGHT, FLIPPER_SLOPE, {
    density: 0.02,
    friction: 0.5,
    restitution: 0.1,
    label: "flipper-left",
    collisionFilter: {
      category: COLLISION_CATEGORY.TABLE,
      mask: COLLISION_CATEGORY.TABLE,
      group: -1,
    },
  });

  const leftConstraint = Constraint.create({
    pointA: { x: leftPivotX - FLIPPER_WIDTH / 3, y: bottomY },
    bodyB: leftBody,
    pointB: { x: -FLIPPER_WIDTH / 3, y: 0 },
    length: 0,
    stiffness: 0.9,
  });

  // Right flipper
  const rightX = centerX + gap + FLIPPER_WIDTH / 2 - 15;
  const rightPivotX = centerX + gap + FLIPPER_WIDTH / 2 - 15;
  const rightBody = Bodies.trapezoid(rightX, bottomY, FLIPPER_WIDTH, FLIPPER_HEIGHT, FLIPPER_SLOPE, {
    density: 0.02,
    friction: 0.5,
    restitution: 0.1,
    label: "flipper-right",
    collisionFilter: {
      category: COLLISION_CATEGORY.TABLE,
      mask: COLLISION_CATEGORY.TABLE,
      group: -1,
    },
  });

  const rightConstraint = Constraint.create({
    pointA: { x: rightPivotX + FLIPPER_WIDTH / 3, y: bottomY },
    bodyB: rightBody,
    pointB: { x: FLIPPER_WIDTH / 3, y: 0 },
    length: 0,
    stiffness: 0.9,
  });

  return [
    {
      body: leftBody,
      constraint: leftConstraint,
      side: "left",
      restAngle: 0.5,
      activeAngle: -0.6,
    },
    {
      body: rightBody,
      constraint: rightConstraint,
      side: "right",
      restAngle: -0.5,
      activeAngle: 0.6,
    },
  ];
}

export function addFlippersToWorld(
  world: Matter.World,
  flippers: Flipper[]
): void {
  for (const f of flippers) {
    World.add(world, [f.body, f.constraint]);
    Body.setAngle(f.body, f.restAngle);
  }
}

export function updateFlipper(
  flipper: Flipper,
  isActive: boolean
): void {
  const { body, side, restAngle, activeAngle } = flipper;

  if (isActive) {
    const direction = side === "left" ? -ACTIVE_ANGULAR_VELOCITY : ACTIVE_ANGULAR_VELOCITY;
    Body.setAngularVelocity(body, direction);
  } else {
    const direction = side === "left" ? REST_ANGULAR_VELOCITY : -REST_ANGULAR_VELOCITY;
    Body.setAngularVelocity(body, direction);
  }

  // Clamp angle
  if (side === "left") {
    if (body.angle < activeAngle) Body.setAngle(body, activeAngle);
    if (body.angle > restAngle) Body.setAngle(body, restAngle);
  } else {
    if (body.angle > activeAngle) Body.setAngle(body, activeAngle);
    if (body.angle < restAngle) Body.setAngle(body, restAngle);
  }
}
