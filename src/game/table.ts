import Matter from "matter-js";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG, COLLISION_CATEGORY } from "./types";
import { PLAYFIELD_WIDTH } from "./engine";
import type { TableLayoutConfig } from "./tableConfig";
import { getDefaultLayout } from "./tableConfig";

const { Bodies, Body, World, Events } = Matter;

export interface TableElements {
  bumpers: Matter.Body[];
  slingshots: { body: Matter.Body; sensor: Matter.Body }[];
  dropTargets: Matter.Body[];
  allBodies: Matter.Body[];
}

let removalQueue: Matter.Body[] = [];

export function processRemovalQueue(world: Matter.World) {
  for (const body of removalQueue) {
    World.remove(world, body);
  }
  removalQueue = [];
}

export function createTableElements(
  config: GameConfig = DEFAULT_CONFIG,
  layout?: TableLayoutConfig
): TableElements {
  const allBodies: Matter.Body[] = [];

  const tableFilter = {
    category: COLLISION_CATEGORY.TABLE,
    mask: COLLISION_CATEGORY.TABLE,
  };

  const wallFilter = {
    category: COLLISION_CATEGORY.TABLE,
    mask: COLLISION_CATEGORY.TABLE | COLLISION_CATEGORY.RAMP,
  };

  const elements = layout?.elements ?? getDefaultLayout().elements;

  const bumpers: Matter.Body[] = [];
  const dropTargets: Matter.Body[] = [];
  const slingshots: { body: Matter.Body; sensor: Matter.Body }[] = [];
  let dropTargetIndex = 0;

  for (const el of elements) {
    switch (el.type) {
      case "bumper": {
        const b = Bodies.circle(el.x, el.y, 22, {
          isStatic: true, restitution: 0.8, label: "bumper",
          collisionFilter: tableFilter,
        });
        bumpers.push(b);
        allBodies.push(b);
        break;
      }
      case "guide-pin": {
        const p = Bodies.circle(el.x, el.y, 4, {
          isStatic: true, label: "guide-pin",
          collisionFilter: tableFilter,
        });
        allBodies.push(p);
        break;
      }
      case "drop-target": {
        const t = Bodies.rectangle(el.x, el.y, 7, 18, {
          isStatic: true, label: "drop-target", angle: el.angle ?? 0,
          collisionFilter: tableFilter,
        });
        (t as any).targetIndex = dropTargetIndex++;
        dropTargets.push(t);
        allBodies.push(t);
        break;
      }
      case "standup-target": {
        const s = Bodies.rectangle(el.x, el.y, 7, 20, {
          isStatic: true, label: "standup-target", angle: el.angle ?? 0,
          restitution: 0.9, collisionFilter: tableFilter,
        });
        allBodies.push(s);
        break;
      }
      case "spinner": {
        const post = Bodies.circle(el.x, el.y, 3, {
          isStatic: true, label: "spinner-post", collisionFilter: tableFilter,
        });
        const sensor = Bodies.rectangle(el.x, el.y, 30, 6, {
          isStatic: true, isSensor: true, label: "spinner-sensor",
          collisionFilter: tableFilter,
        });
        allBodies.push(post, sensor);
        break;
      }
      case "kickout-hole": {
        const hole = Bodies.circle(el.x, el.y, 12, {
          isStatic: true, isSensor: true, label: "kickout-hole",
          collisionFilter: tableFilter,
        });
        allBodies.push(hole);
        break;
      }
      case "slingshot-left":
      case "slingshot-right": {
        const side = el.type === "slingshot-left" ? "left" : "right";
        const dir = side === "left" ? 1 : -1;
        const body = Bodies.fromVertices(el.x, el.y, [[
          { x: 0, y: -28 }, { x: dir * 22, y: 20 }, { x: 0, y: 28 },
        ]], {
          isStatic: true, label: "slingshot", collisionFilter: tableFilter,
        });
        const sensorX = side === "left" ? el.x + 10 : el.x - 10;
        const sensor = Bodies.circle(sensorX, el.y, 22, {
          isStatic: true, isSensor: true, label: "slingshot-sensor",
          collisionFilter: tableFilter,
        });
        (sensor as any).slingshotSide = side;
        slingshots.push({ body, sensor });
        allBodies.push(body, sensor);
        break;
      }
      case "wall-rect": {
        const w = el.width ?? 60, h = el.height ?? 10, cr = el.cornerRadius ?? 0;
        const opts: Matter.IBodyDefinition = {
          isStatic: true, label: "wall-rect", angle: el.angle ?? 0,
          collisionFilter: wallFilter,
        };
        if (cr > 0) (opts as any).chamfer = { radius: Math.min(cr, Math.min(w, h) / 2 - 0.5) };
        const wallBody = Bodies.rectangle(el.x, el.y, w, h, opts);
        (wallBody as any).wallWidth = w;
        (wallBody as any).wallHeight = h;
        (wallBody as any).cornerRadius = cr;
        allBodies.push(wallBody);
        break;
      }
      case "wall-circle": {
        const r = el.radius ?? 15;
        const wc = Bodies.circle(el.x, el.y, r, {
          isStatic: true, label: "wall-circle", collisionFilter: wallFilter,
        });
        (wc as any).wallRadius = r;
        allBodies.push(wc);
        break;
      }
      case "wall-triangle": {
        const w = el.width ?? 40, h = el.height ?? 40;
        // Centroid-anchored isoceles triangle: peak up, base down. el.x/el.y == centroid.
        const verts = [
          { x: 0, y: -2 * h / 3 },
          { x: -w / 2, y: h / 3 },
          { x: w / 2, y: h / 3 },
        ];
        const tri = Bodies.fromVertices(el.x, el.y, [verts], {
          isStatic: true, label: "wall-triangle", angle: el.angle ?? 0,
          collisionFilter: wallFilter,
        });
        (tri as any).wallWidth = w;
        (tri as any).wallHeight = h;
        allBodies.push(tri);
        break;
      }
    }
  }

  return { bumpers, slingshots, dropTargets, allBodies };
}

export function setupTableCollisions(
  engine: Matter.Engine,
  elements: TableElements,
  onScore: (points: number, label: string, position: { x: number; y: number }) => void,
  onDropTargetHit: (targetIndex: number) => void,
  onSpecialEvent: (type: string, data: any) => void
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
            x: (dx / dist) * 0.008, y: (dy / dist) * 0.008,
          });
          onScore(100, "bumper", other.position);
        }
        if (other.label === "slingshot-sensor") {
          const side = (other as any).slingshotSide;
          Body.applyForce(ballBody, ballBody.position, {
            x: side === "left" ? 0.005 : -0.005, y: -0.003,
          });
          onScore(50, "slingshot", other.position);
        }
        if (other.label === "drop-target") {
          removalQueue.push(other);
          onScore(500, "drop-target", other.position);
          onDropTargetHit((other as any).targetIndex);
        }
        if (other.label === "spinner-sensor") {
          onScore(25, "spinner", other.position);
          onSpecialEvent("spinner-sensor", { ballBody });
        }
        if (other.label === "standup-target") {
          const dx = ballBody.position.x - other.position.x;
          const dy = ballBody.position.y - other.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          Body.applyForce(ballBody, ballBody.position, {
            x: (dx / dist) * 0.004, y: (dy / dist) * 0.004,
          });
          onScore(150, "standup-target", other.position);
        }
        if (other.label === "kickout-hole") {
          onScore(400, "kickout-hole", other.position);
          onSpecialEvent("kickout-hole", { ballBody });
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
