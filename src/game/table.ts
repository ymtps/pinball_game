import Matter from "matter-js";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG, COLLISION_CATEGORY } from "./types";
import { PLAYFIELD_WIDTH, TABLE_GEOMETRY } from "./engine";

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

let removalQueue: Matter.Body[] = [];

export function processRemovalQueue(world: Matter.World) {
  for (const body of removalQueue) {
    World.remove(world, body);
  }
  removalQueue = [];
}

export function createTableElements(config: GameConfig = DEFAULT_CONFIG): TableElements {
  const { height } = config;
  const pW = PLAYFIELD_WIDTH; // playfield width (excludes launch lane)
  const cx = pW / 2;          // playfield center x
  const allBodies: Matter.Body[] = [];

  const tableFilter = {
    category: COLLISION_CATEGORY.TABLE,
    mask: COLLISION_CATEGORY.TABLE,
  };

  // ── Bumpers (R5) ── three bumpers in a triangle formation
  const bumpers = [
    { x: cx - 60, y: 190 },
    { x: cx + 60, y: 190 },
    { x: cx,      y: 270 },
  ].map((pos) =>
    Bodies.circle(pos.x, pos.y, 22, {
      isStatic: true, restitution: 0.8, label: "bumper",
      collisionFilter: tableFilter,
    })
  );
  allBodies.push(...bumpers);

  // ── Slingshots (R6) ── triangular kickers above flippers
  const slingY = 560;
  const slingshots = [
    { x: 55,      side: "left" },
    { x: pW - 55, side: "right" },
  ].map((data) => {
    const dir = data.side === "left" ? 1 : -1;
    const body = Bodies.fromVertices(data.x, slingY, [[
      { x: 0, y: -28 },
      { x: dir * 22, y: 20 },
      { x: 0, y: 28 },
    ]], {
      isStatic: true, label: "slingshot",
      collisionFilter: tableFilter,
    });
    const sensor = Bodies.circle(data.x + dir * 10, slingY, 22, {
      isStatic: true, isSensor: true, label: "slingshot-sensor",
      collisionFilter: tableFilter,
    });
    (sensor as any).slingshotSide = data.side;
    allBodies.push(body, sensor);
    return { body, sensor };
  });

  // ── Lanes (R7) ── two lanes on left and right upper area
  const laneWalls: Matter.Body[] = [];

  // Left lane (pair of parallel walls)
  laneWalls.push(
    Bodies.rectangle(30, 340, 6, 110, {
      isStatic: true, label: "lane-wall", angle: 0.08,
      collisionFilter: tableFilter,
    }),
    Bodies.rectangle(55, 340, 6, 110, {
      isStatic: true, label: "lane-wall", angle: 0.08,
      collisionFilter: tableFilter,
    }),
  );

  // Right lane
  laneWalls.push(
    Bodies.rectangle(pW - 30, 340, 6, 110, {
      isStatic: true, label: "lane-wall", angle: -0.08,
      collisionFilter: tableFilter,
    }),
    Bodies.rectangle(pW - 55, 340, 6, 110, {
      isStatic: true, label: "lane-wall", angle: -0.08,
      collisionFilter: tableFilter,
    }),
  );

  // Lane scoring sensors
  laneWalls.push(
    Bodies.rectangle(42, 400, 20, 5, {
      isStatic: true, isSensor: true, label: "lane-sensor",
      collisionFilter: tableFilter,
    }),
    Bodies.rectangle(pW - 42, 400, 20, 5, {
      isStatic: true, isSensor: true, label: "lane-sensor",
      collisionFilter: tableFilter,
    }),
  );
  allBodies.push(...laneWalls);

  // ── Drop Targets (R8) ── row of 4 across the middle
  const dropY = 420;
  const dropSpacing = 40;
  const dropStartX = cx - (dropSpacing * 1.5);
  const dropTargets = [0, 1, 2, 3].map((i) => {
    const target = Bodies.rectangle(dropStartX + i * dropSpacing, dropY, 22, 7, {
      isStatic: true, label: "drop-target",
      collisionFilter: tableFilter,
    });
    (target as any).targetIndex = i;
    return target;
  });
  allBodies.push(...dropTargets);

  // ── Ramp (R9) ── left side ramp entrance, exits top right
  const rampEntrance = Bodies.rectangle(cx - 80, 460, 28, 5, {
    isStatic: true, isSensor: true, label: "ramp-entrance",
    collisionFilter: tableFilter,
  });
  const rampExit = Bodies.rectangle(cx + 80, 140, 28, 5, {
    isStatic: true, isSensor: true, label: "ramp-exit",
    collisionFilter: { category: COLLISION_CATEGORY.RAMP, mask: COLLISION_CATEGORY.RAMP },
  });
  const rampWalls = [
    Bodies.rectangle(cx - 55, 320, 6, 280, {
      isStatic: true, label: "ramp-wall", angle: -0.12,
      collisionFilter: { category: COLLISION_CATEGORY.RAMP, mask: COLLISION_CATEGORY.RAMP },
    }),
    Bodies.rectangle(cx - 25, 320, 6, 280, {
      isStatic: true, label: "ramp-wall", angle: -0.12,
      collisionFilter: { category: COLLISION_CATEGORY.RAMP, mask: COLLISION_CATEGORY.RAMP },
    }),
  ];
  allBodies.push(rampEntrance, rampExit, ...rampWalls);

  // ── Guide walls / inlane walls ──
  // These guide the ball from slingshot area down to flippers
  // Left inlane wall
  allBodies.push(
    Bodies.rectangle(75, 605, 6, 60, {
      isStatic: true, label: "wall", angle: 0.15,
      collisionFilter: { ...tableFilter, mask: COLLISION_CATEGORY.TABLE | COLLISION_CATEGORY.RAMP },
    }),
  );
  // Right inlane wall
  allBodies.push(
    Bodies.rectangle(pW - 75, 605, 6, 60, {
      isStatic: true, label: "wall", angle: -0.15,
      collisionFilter: { ...tableFilter, mask: COLLISION_CATEGORY.TABLE | COLLISION_CATEGORY.RAMP },
    }),
  );

  return {
    bumpers, slingshots, lanes: laneWalls, dropTargets,
    rampEntrance, rampExit, rampWalls, allBodies,
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
      const ballBody = pair.bodyA.label === "ball" ? pair.bodyA
        : pair.bodyB.label === "ball" ? pair.bodyB : null;
      if (!ballBody) continue;
      const other = ballBody === pair.bodyA ? pair.bodyB : pair.bodyA;

      try {
        if (other.label === "bumper") {
          const dx = ballBody.position.x - other.position.x;
          const dy = ballBody.position.y - other.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          Body.applyForce(ballBody, ballBody.position, {
            x: (dx / dist) * 0.008,
            y: (dy / dist) * 0.008,
          });
          onScore(100, "bumper", other.position);
        }

        if (other.label === "slingshot-sensor") {
          const side = (other as any).slingshotSide;
          Body.applyForce(ballBody, ballBody.position, {
            x: side === "left" ? 0.005 : -0.005,
            y: -0.003,
          });
          onScore(50, "slingshot", other.position);
        }

        if (other.label === "lane-sensor") {
          onScore(200, "lane", other.position);
        }

        if (other.label === "drop-target") {
          removalQueue.push(other);
          onScore(500, "drop-target", other.position);
          onDropTargetHit((other as any).targetIndex);
        }

        if (other.label === "ramp-entrance") {
          ballBody.collisionFilter.category = COLLISION_CATEGORY.RAMP;
          ballBody.collisionFilter.mask = COLLISION_CATEGORY.RAMP;
          onScore(300, "ramp", other.position);
        }

        if (other.label === "ramp-exit") {
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
