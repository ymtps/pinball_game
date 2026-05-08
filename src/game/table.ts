import Matter from "matter-js";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG, COLLISION_CATEGORY } from "./types";

const { Bodies, Body, World, Events } = Matter;

export interface TableElements {
  bumpers: Matter.Body[];
  slingshots: { body: Matter.Body; sensor: Matter.Body }[];
  lanes: Matter.Body[];
  dropTargets: Matter.Body[];
  rampEntrance: Matter.Body;
  rampExit: Matter.Body;
  rampWalls: Matter.Body[];
  allBodies: Matter.Body[];
}

// Bodies queued for removal (deferred from collisionStart)
let removalQueue: Matter.Body[] = [];

export function processRemovalQueue(world: Matter.World) {
  for (const body of removalQueue) {
    World.remove(world, body);
  }
  removalQueue = [];
}

export function createTableElements(config: GameConfig = DEFAULT_CONFIG): TableElements {
  const { width, height } = config;
  const allBodies: Matter.Body[] = [];

  // ── Bumpers (R5) ──
  const bumperPositions = [
    { x: width * 0.3, y: height * 0.25 },
    { x: width * 0.7, y: height * 0.25 },
    { x: width * 0.5, y: height * 0.35 },
  ];
  const bumpers = bumperPositions.map((pos) => {
    const bumper = Bodies.circle(pos.x, pos.y, 20, {
      isStatic: true,
      restitution: 0.8,
      label: "bumper",
      collisionFilter: {
        category: COLLISION_CATEGORY.TABLE,
        mask: COLLISION_CATEGORY.TABLE,
      },
    });
    return bumper;
  });
  allBodies.push(...bumpers);

  // ── Slingshots (R6) ──
  const slingshotData = [
    { x: width * 0.18, y: height * 0.72, side: "left" },
    { x: width * 0.82, y: height * 0.72, side: "right" },
  ];
  const slingshots = slingshotData.map((data) => {
    const body = Bodies.fromVertices(data.x, data.y, [[
      { x: 0, y: -30 },
      { x: data.side === "left" ? 25 : -25, y: 30 },
      { x: 0, y: 30 },
    ]], {
      isStatic: true,
      label: "slingshot",
      collisionFilter: {
        category: COLLISION_CATEGORY.TABLE,
        mask: COLLISION_CATEGORY.TABLE,
      },
    });
    const sensor = Bodies.circle(data.x + (data.side === "left" ? 12 : -12), data.y, 25, {
      isStatic: true,
      isSensor: true,
      label: "slingshot-sensor",
      collisionFilter: {
        category: COLLISION_CATEGORY.TABLE,
        mask: COLLISION_CATEGORY.TABLE,
      },
    });
    (sensor as any).slingshotSide = data.side;
    allBodies.push(body, sensor);
    return { body, sensor };
  });

  // ── Lanes (R7) ──
  const laneWalls: Matter.Body[] = [];

  // Left lane
  laneWalls.push(
    Bodies.rectangle(width * 0.08, height * 0.4, 8, 120, {
      isStatic: true, label: "lane-wall", angle: 0.1,
      collisionFilter: { category: COLLISION_CATEGORY.TABLE, mask: COLLISION_CATEGORY.TABLE },
    }),
    Bodies.rectangle(width * 0.16, height * 0.4, 8, 120, {
      isStatic: true, label: "lane-wall", angle: 0.1,
      collisionFilter: { category: COLLISION_CATEGORY.TABLE, mask: COLLISION_CATEGORY.TABLE },
    }),
  );

  // Right lane
  laneWalls.push(
    Bodies.rectangle(width * 0.84, height * 0.4, 8, 120, {
      isStatic: true, label: "lane-wall", angle: -0.1,
      collisionFilter: { category: COLLISION_CATEGORY.TABLE, mask: COLLISION_CATEGORY.TABLE },
    }),
    Bodies.rectangle(width * 0.92, height * 0.4, 8, 120, {
      isStatic: true, label: "lane-wall", angle: -0.1,
      collisionFilter: { category: COLLISION_CATEGORY.TABLE, mask: COLLISION_CATEGORY.TABLE },
    }),
  );

  // Lane sensors at bottom of each lane
  const laneSensorLeft = Bodies.rectangle(width * 0.12, height * 0.48, 25, 5, {
    isStatic: true, isSensor: true, label: "lane-sensor",
    collisionFilter: { category: COLLISION_CATEGORY.TABLE, mask: COLLISION_CATEGORY.TABLE },
  });
  const laneSensorRight = Bodies.rectangle(width * 0.88, height * 0.48, 25, 5, {
    isStatic: true, isSensor: true, label: "lane-sensor",
    collisionFilter: { category: COLLISION_CATEGORY.TABLE, mask: COLLISION_CATEGORY.TABLE },
  });
  laneWalls.push(laneSensorLeft, laneSensorRight);
  allBodies.push(...laneWalls);

  // ── Drop Targets (R8) ──
  const dropTargetPositions = [
    { x: width * 0.35, y: height * 0.5 },
    { x: width * 0.45, y: height * 0.48 },
    { x: width * 0.55, y: height * 0.48 },
    { x: width * 0.65, y: height * 0.5 },
  ];
  const dropTargets = dropTargetPositions.map((pos, i) => {
    const target = Bodies.rectangle(pos.x, pos.y, 20, 8, {
      isStatic: true,
      label: "drop-target",
      collisionFilter: {
        category: COLLISION_CATEGORY.TABLE,
        mask: COLLISION_CATEGORY.TABLE,
      },
    });
    (target as any).targetIndex = i;
    return target;
  });
  allBodies.push(...dropTargets);

  // ── Ramp (R9) - layer switching approach ──
  const rampEntrance = Bodies.rectangle(width * 0.25, height * 0.55, 30, 5, {
    isStatic: true,
    isSensor: true,
    label: "ramp-entrance",
    collisionFilter: { category: COLLISION_CATEGORY.TABLE, mask: COLLISION_CATEGORY.TABLE },
  });

  const rampExit = Bodies.rectangle(width * 0.75, height * 0.2, 30, 5, {
    isStatic: true,
    isSensor: true,
    label: "ramp-exit",
    collisionFilter: { category: COLLISION_CATEGORY.RAMP, mask: COLLISION_CATEGORY.RAMP },
  });

  // Ramp walls (only collide on RAMP layer)
  const rampWalls = [
    Bodies.rectangle(width * 0.3, height * 0.38, 8, 200, {
      isStatic: true, label: "ramp-wall", angle: -0.2,
      collisionFilter: { category: COLLISION_CATEGORY.RAMP, mask: COLLISION_CATEGORY.RAMP },
    }),
    Bodies.rectangle(width * 0.45, height * 0.38, 8, 200, {
      isStatic: true, label: "ramp-wall", angle: -0.2,
      collisionFilter: { category: COLLISION_CATEGORY.RAMP, mask: COLLISION_CATEGORY.RAMP },
    }),
  ];

  allBodies.push(rampEntrance, rampExit, ...rampWalls);

  // ── Guide walls for the bottom area ──
  // Left guide wall (angled to funnel ball toward flippers)
  allBodies.push(
    Bodies.rectangle(width * 0.08, height * 0.85, 8, 100, {
      isStatic: true, label: "wall", angle: 0.4,
      collisionFilter: { category: COLLISION_CATEGORY.TABLE, mask: COLLISION_CATEGORY.TABLE | COLLISION_CATEGORY.RAMP },
    }),
  );
  // Right guide wall (angled toward drain, ends before launch lane)
  allBodies.push(
    Bodies.rectangle(width * 0.82, height * 0.85, 8, 100, {
      isStatic: true, label: "wall", angle: -0.4,
      collisionFilter: { category: COLLISION_CATEGORY.TABLE, mask: COLLISION_CATEGORY.TABLE | COLLISION_CATEGORY.RAMP },
    }),
  );

  return {
    bumpers,
    slingshots,
    lanes: laneWalls,
    dropTargets,
    rampEntrance,
    rampExit,
    rampWalls,
    allBodies,
  };
}

export function setupTableCollisions(
  engine: Matter.Engine,
  elements: TableElements,
  onScore: (points: number, label: string, position: { x: number; y: number }) => void,
  onDropTargetHit: (targetIndex: number) => void
) {
  Events.on(engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const bodyA = pair.bodyA;
      const bodyB = pair.bodyB;
      const labels = [bodyA.label, bodyB.label];
      const ballBody = bodyA.label === "ball" ? bodyA : bodyB.label === "ball" ? bodyB : null;
      if (!ballBody) continue;
      const otherBody = ballBody === bodyA ? bodyB : bodyA;

      try {
        // Bumper hit
        if (otherBody.label === "bumper") {
          // Apply force away from bumper
          const dx = ballBody.position.x - otherBody.position.x;
          const dy = ballBody.position.y - otherBody.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const forceMag = 0.008;
          Body.applyForce(ballBody, ballBody.position, {
            x: (dx / dist) * forceMag,
            y: (dy / dist) * forceMag,
          });
          onScore(100, "bumper", otherBody.position);
        }

        // Slingshot hit
        if (otherBody.label === "slingshot-sensor") {
          const side = (otherBody as any).slingshotSide;
          const forceX = side === "left" ? 0.005 : -0.005;
          Body.applyForce(ballBody, ballBody.position, { x: forceX, y: -0.003 });
          onScore(50, "slingshot", otherBody.position);
        }

        // Lane sensor
        if (otherBody.label === "lane-sensor") {
          onScore(200, "lane", otherBody.position);
        }

        // Drop target
        if (otherBody.label === "drop-target") {
          const targetIndex = (otherBody as any).targetIndex;
          removalQueue.push(otherBody);
          onScore(500, "drop-target", otherBody.position);
          onDropTargetHit(targetIndex);
        }

        // Ramp entrance - switch ball to RAMP layer
        if (otherBody.label === "ramp-entrance") {
          ballBody.collisionFilter.category = COLLISION_CATEGORY.RAMP;
          ballBody.collisionFilter.mask = COLLISION_CATEGORY.RAMP;
          onScore(300, "ramp", otherBody.position);
        }

        // Ramp exit - switch ball back to TABLE layer
        if (otherBody.label === "ramp-exit") {
          ballBody.collisionFilter.category = COLLISION_CATEGORY.TABLE;
          ballBody.collisionFilter.mask = COLLISION_CATEGORY.TABLE;
        }
      } catch (e) {
        console.error("Collision handler error:", e);
      }
    }
  });
}

export function resetDropTargets(world: Matter.World, dropTargets: Matter.Body[]) {
  for (const target of dropTargets) {
    if (!world.bodies.includes(target)) {
      World.add(world, target);
    }
  }
}
