import Matter from "matter-js";
import { createBall } from "./engine";
import type { GameConfig } from "./types";
import { DEFAULT_CONFIG } from "./types";

const { World } = Matter;

export class BallManager {
  private balls: Matter.Body[] = [];
  private world: Matter.World;
  private config: GameConfig;

  constructor(world: Matter.World, config: GameConfig = DEFAULT_CONFIG) {
    this.world = world;
    this.config = config;
  }

  addBall(x: number, y: number): Matter.Body {
    const ball = createBall(x, y, this.config);
    this.balls.push(ball);
    World.add(this.world, ball);
    return ball;
  }

  removeBall(ball: Matter.Body): void {
    const index = this.balls.indexOf(ball);
    if (index !== -1) {
      this.balls.splice(index, 1);
      World.remove(this.world, ball);
    }
  }

  removeAllBalls(): void {
    for (const ball of this.balls) {
      World.remove(this.world, ball);
    }
    this.balls = [];
  }

  getBalls(): readonly Matter.Body[] {
    return this.balls;
  }

  getBallCount(): number {
    return this.balls.length;
  }
}
