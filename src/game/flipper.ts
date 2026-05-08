import Matter from "matter-js";
import { COLLISION_CATEGORY } from "./types";
import { TABLE_GEOMETRY, PLAYFIELD_WIDTH } from "./engine";

const { Bodies, Body, Constraint, World } = Matter;

export interface Flipper {
  body: Matter.Body;
  constraint: Matter.Constraint;
  side: "left" | "right";
  restAngle: number;
  activeAngle: number;
}

const FLIPPER_WIDTH = 65;
const FLIPPER_HEIGHT = 12;
const FLIPPER_SLOPE = 0.12;
const ACTIVE_ANGULAR_VELOCITY = 0.35;
const REST_ANGULAR_VELOCITY = 0.1;

export function createFlippers(): Flipper[] {
  const centerX = TABLE_GEOMETRY.drainCenterX; // center of playfield
  const bottomY = TABLE_GEOMETRY.flipperY;
  const spread = TABLE_GEOMETRY.drainGap / 2 + 8; // distance from center to pivot

  // Left flipper: pivot is at the inner end (closer to center)
  const leftPivotX = centerX - spread;
  const leftX = leftPivotX - FLIPPER_WIDTH / 3; // body center offset from pivot
  const leftBody = Bodies.trapezoid(leftX, bottomY, FLIPPER_WIDTH, FLIPPER_HEIGHT, FLIPPER_SLOPE, {
    density: 0.025,
    friction: 0.4,
    restitution: 0.05,
    label: "flipper-left",
    collisionFilter: {
      category: COLLISION_CATEGORY.TABLE,
      mask: COLLISION_CATEGORY.TABLE,
      group: -1,
    },
  });

  const leftConstraint = Constraint.create({
    pointA: { x: leftPivotX, y: bottomY },
    bodyB: leftBody,
    pointB: { x: FLIPPER_WIDTH / 3, y: 0 },
    length: 0,
    stiffness: 0.95,
  });

  // Right flipper: pivot is at the inner end
  const rightPivotX = centerX + spread;
  const rightX = rightPivotX + FLIPPER_WIDTH / 3;
  const rightBody = Bodies.trapezoid(rightX, bottomY, FLIPPER_WIDTH, FLIPPER_HEIGHT, FLIPPER_SLOPE, {
    density: 0.025,
    friction: 0.4,
    restitution: 0.05,
    label: "flipper-right",
    collisionFilter: {
      category: COLLISION_CATEGORY.TABLE,
      mask: COLLISION_CATEGORY.TABLE,
      group: -1,
    },
  });

  const rightConstraint = Constraint.create({
    pointA: { x: rightPivotX, y: bottomY },
    bodyB: rightBody,
    pointB: { x: -FLIPPER_WIDTH / 3, y: 0 },
    length: 0,
    stiffness: 0.95,
  });

  return [
    {
      body: leftBody,
      constraint: leftConstraint,
      side: "left",
      restAngle: 0.45,     // resting down
      activeAngle: -0.55,   // flipped up
    },
    {
      body: rightBody,
      constraint: rightConstraint,
      side: "right",
      restAngle: -0.45,
      activeAngle: 0.55,
    },
  ];
}

export function addFlippersToWorld(world: Matter.World, flippers: Flipper[]) {
  for (const f of flippers) {
    World.add(world, [f.body, f.constraint]);
    Body.setAngle(f.body, f.restAngle);
  }
}

export function updateFlipper(flipper: Flipper, isActive: boolean) {
  const { body, side, restAngle, activeAngle } = flipper;

  if (isActive) {
    Body.setAngularVelocity(body, side === "left" ? -ACTIVE_ANGULAR_VELOCITY : ACTIVE_ANGULAR_VELOCITY);
  } else {
    Body.setAngularVelocity(body, side === "left" ? REST_ANGULAR_VELOCITY : -REST_ANGULAR_VELOCITY);
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
