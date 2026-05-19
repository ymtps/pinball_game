import Matter from "matter-js";
import { COLLISION_CATEGORY } from "./types";
import type { FlipperConfig } from "./tableConfig";
import { DEFAULT_FLIPPERS } from "./tableConfig";

const { Bodies, Body, Constraint, World } = Matter;

export interface Flipper {
  body: Matter.Body;
  constraint: Matter.Constraint;
  side: "left" | "right";
  restAngle: number;
  activeAngle: number;
}

const FLIPPER_SLOPE = 0.12;
const ACTIVE_ANGULAR_VELOCITY = 0.35;
const REST_ANGULAR_VELOCITY = 0.1;

function makeFlipper(cfg: FlipperConfig, side: "left" | "right"): Flipper {
  const { pivotX, pivotY, width, height } = cfg;
  // Sign: +1 = body sits to the right of pivot (left flipper), -1 = body to the left (right flipper)
  const sign = side === "left" ? 1 : -1;
  const bodyCenterX = pivotX + sign * (width / 3);

  const body = Bodies.trapezoid(bodyCenterX, pivotY, width, height, FLIPPER_SLOPE, {
    density: 0.025,
    friction: 0.4,
    restitution: 0.05,
    label: `flipper-${side}`,
    collisionFilter: {
      category: COLLISION_CATEGORY.TABLE,
      mask: COLLISION_CATEGORY.TABLE,
      group: -1,
    },
  });

  const constraint = Constraint.create({
    pointA: { x: pivotX, y: pivotY },
    bodyB: body,
    pointB: { x: -sign * (width / 3), y: 0 },
    length: 0,
    stiffness: 0.95,
  });

  return {
    body,
    constraint,
    side,
    restAngle: sign * 0.45,
    activeAngle: -sign * 0.55,
  };
}

export function createFlippers(config?: { left: FlipperConfig; right: FlipperConfig }): Flipper[] {
  const left = config?.left ?? DEFAULT_FLIPPERS.left;
  const right = config?.right ?? DEFAULT_FLIPPERS.right;
  return [makeFlipper(left, "left"), makeFlipper(right, "right")];
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
