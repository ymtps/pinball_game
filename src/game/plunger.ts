import Matter from "matter-js";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { LAUNCH_LANE } from "./engine";

const { Body } = Matter;

const MAX_CHARGE = 1.0;
const CHARGE_RATE = 0.025;
const MAX_LAUNCH_FORCE = 0.055;
const MIN_LAUNCH_FORCE = 0.018;

export class Plunger {
  charge: number = 0;
  isCharging: boolean = false;

  readonly launchX: number;
  readonly launchY: number;

  constructor(config: GameConfig = DEFAULT_CONFIG) {
    this.launchX = LAUNCH_LANE.centerX;
    this.launchY = config.height - 50;
  }

  update(spacePressed: boolean, ball: Matter.Body | null): boolean {
    if (!ball) return false;

    if (spacePressed && !this.isCharging) {
      this.isCharging = true;
      this.charge = 0;
    }

    if (spacePressed && this.isCharging) {
      this.charge = Math.min(this.charge + CHARGE_RATE, MAX_CHARGE);
      return false;
    }

    if (!spacePressed && this.isCharging) {
      this.isCharging = false;
      const force = MIN_LAUNCH_FORCE + (MAX_LAUNCH_FORCE - MIN_LAUNCH_FORCE) * this.charge;
      Body.applyForce(ball, ball.position, { x: 0, y: -force });
      this.charge = 0;
      return true;
    }

    return false;
  }

  getChargePercent(): number {
    return this.charge / MAX_CHARGE;
  }

  reset() {
    this.charge = 0;
    this.isCharging = false;
  }
}
