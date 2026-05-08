import Matter from "matter-js";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { LAUNCH_LANE } from "./engine";

const { Body } = Matter;

const MAX_CHARGE = 1.0;
const CHARGE_RATE = 0.02; // per frame (~60fps)
const MAX_LAUNCH_FORCE = 0.05;
const MIN_LAUNCH_FORCE = 0.015;

export class Plunger {
  charge: number = 0;
  isCharging: boolean = false;
  private config: GameConfig;

  // Launch lane position (right side of table)
  readonly launchX: number;
  readonly launchY: number;

  constructor(config: GameConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.launchX = LAUNCH_LANE.centerX;
    this.launchY = config.height - 55;
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
      // Release - launch the ball
      this.isCharging = false;
      const force = MIN_LAUNCH_FORCE + (MAX_LAUNCH_FORCE - MIN_LAUNCH_FORCE) * this.charge;
      Body.applyForce(ball, ball.position, { x: 0, y: -force });
      this.charge = 0;
      return true; // ball launched
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
