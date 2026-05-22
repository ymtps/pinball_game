import Matter from "matter-js";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG, COLLISION_CATEGORY } from "./types";
import { LAUNCH_LANE } from "./engine";

const { Body, Bodies, World } = Matter;

const MAX_CHARGE = 1.0;
const CHARGE_RATE = 0.025;
// Frame-rate independent launch: set velocity directly instead of applyForce,
// since applyForce's effect depends on physics delta and varied across machines.
// MAX_LAUNCH_SPEED is just under maxBallSpeed (25) so the speed cap never trims it.
const MAX_LAUNCH_SPEED = 30;
const MIN_LAUNCH_SPEED = 14;
// Max physical pull distance — kept small so the ball/platform stay above the
// launch-lane bottom wall and out of the drain sensor at full charge.
const MAX_PULL = 32; // must match renderer's maxPull

export class Plunger {
  charge: number = 0;
  isCharging: boolean = false;
  platform: Matter.Body;

  readonly launchX: number;
  readonly restY: number; // platform rest Y (spring top)

  constructor(config: GameConfig = DEFAULT_CONFIG) {
    this.launchX = LAUNCH_LANE.centerX;
    // Spring top in renderer = config.height - 62
    this.restY = config.height - 62;

    // Physical platform at spring top - ball rests on this
    this.platform = Bodies.rectangle(this.launchX, this.restY, LAUNCH_LANE.laneWidth - 4, 6, {
      isStatic: true,
      label: "plunger-platform",
      collisionFilter: {
        category: COLLISION_CATEGORY.TABLE,
        mask: COLLISION_CATEGORY.TABLE,
      },
      render: { visible: false },
    });
  }

  get launchY() { return this.restY - DEFAULT_CONFIG.ballRadius - 3; }

  addToWorld(world: Matter.World) {
    World.add(world, this.platform);
  }

  update(spacePressed: boolean, ball: Matter.Body | null): boolean {
    if (!ball) return false;

    if (spacePressed && !this.isCharging) {
      this.isCharging = true;
      this.charge = 0;
    }

    if (spacePressed && this.isCharging) {
      this.charge = Math.min(this.charge + CHARGE_RATE, MAX_CHARGE);
      // Move platform and ball down together
      const pullDown = this.charge * MAX_PULL;
      Body.setPosition(this.platform, { x: this.launchX, y: this.restY + pullDown });
      Body.setPosition(ball, { x: this.launchX, y: this.restY + pullDown - DEFAULT_CONFIG.ballRadius - 3 });
      Body.setVelocity(ball, { x: 0, y: 0 });
      return false;
    }

    if (!spacePressed && this.isCharging) {
      this.isCharging = false;
      const speed = MIN_LAUNCH_SPEED + (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED) * this.charge;
      // Temporarily disable platform collision so ball can pass through
      this.platform.isSensor = true;
      // Snap ball to rest and launch
      Body.setPosition(this.platform, { x: this.launchX, y: this.restY });
      Body.setPosition(ball, { x: this.launchX, y: this.restY - DEFAULT_CONFIG.ballRadius - 3 });
      Body.setVelocity(ball, { x: 0, y: -speed });
      this.charge = 0;
      // Re-enable platform collision after ball clears
      setTimeout(() => { this.platform.isSensor = false; }, 300);
      return true;
    }

    // Idle: ensure platform is at rest position and solid
    Body.setPosition(this.platform, { x: this.launchX, y: this.restY });
    this.platform.isSensor = false;
    return false;
  }

  getChargePercent(): number {
    return this.charge / MAX_CHARGE;
  }

  reset() {
    this.charge = 0;
    this.isCharging = false;
    Body.setPosition(this.platform, { x: this.launchX, y: this.restY });
    this.platform.isSensor = false;
  }
}
