import type { GamePhase, GameCallbacks } from "./types";

export class GameState {
  phase: GamePhase = "title";
  score: number = 0;
  ballsRemaining: number = 3;
  currentBall: number = 1;
  totalBalls: number = 3;
  highScore: number = 0;
  private callbacks: GameCallbacks = {};

  constructor() {
    this.loadHighScore();
  }

  setCallbacks(callbacks: GameCallbacks) {
    this.callbacks = callbacks;
  }

  startGame() {
    this.phase = "playing";
    this.score = 0;
    this.ballsRemaining = this.totalBalls;
    this.currentBall = 1;
    this.callbacks.onGameStart?.();
    this.callbacks.onScoreChange?.(this.score);
    this.callbacks.onBallChange?.(this.currentBall, this.ballsRemaining);
  }

  addScore(points: number) {
    this.score += points;
    this.callbacks.onScoreChange?.(this.score);
  }

  drainBall(): boolean {
    this.ballsRemaining--;
    if (this.ballsRemaining <= 0) {
      this.endGame();
      return false; // game over
    }
    this.currentBall++;
    this.callbacks.onBallChange?.(this.currentBall, this.ballsRemaining);
    return true; // continue playing
  }

  endGame() {
    this.phase = "gameOver";
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore();
    }
    this.callbacks.onGameOver?.(this.score);
  }

  reset() {
    this.phase = "title";
    this.score = 0;
    this.ballsRemaining = this.totalBalls;
    this.currentBall = 1;
  }

  private loadHighScore() {
    try {
      const saved = localStorage.getItem("pinball-highscore");
      this.highScore = saved ? parseInt(saved, 10) : 0;
    } catch {
      this.highScore = 0;
    }
  }

  private saveHighScore() {
    try {
      localStorage.setItem("pinball-highscore", String(this.highScore));
    } catch {
      // localStorage unavailable - silent fail
    }
  }
}
