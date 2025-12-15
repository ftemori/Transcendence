import type { IBall, IPaddle } from "./types.js";

// TODO: currently the arena/paddle/etc. sizes are hardcoded to match the frontend
export const GAME_CONFIG = {
  width: 1000,
  height: 700,
  blockSize: 10, // ball radius
  paddleWidth: 15,
  paddleHeight: 75,
  maxPaddleY: 625, // height - paddleHeight (700 - 75)
  paddleSpeed: 7,
  ballSpeed: 5,
  ballSpeedY: 3,
  maxBallSpeed: 12,
  maxScore: 11,
};

export class Paddle implements IPaddle {
  x: number;
  y: number;
  width: number;
  height: number;
  dy: number;

  constructor(side: "left" | "right") {
    if (side === "left") {
      this.x = 10; // left paddle x position
    } else if (side === "right") {
      this.x = GAME_CONFIG.width - 20; // right paddle x position
    } else {
      throw "ERROR: paddle got invalid side in the constructor!";
    }
    this.y = GAME_CONFIG.height / 2 - GAME_CONFIG.paddleHeight / 2;
    this.width = GAME_CONFIG.paddleWidth;
    this.height = GAME_CONFIG.paddleHeight;
    this.dy = 0;
  }

  move() {
    this.y += this.dy;
    if (this.y < 0) {
      this.y = 0;
    } else if (this.y > GAME_CONFIG.maxPaddleY) {
      this.y = GAME_CONFIG.maxPaddleY;
    }
  }

  // Drawing on the client
}

export class Ball implements IBall {
  x: number;
  y: number;
  radius: number;
  width: number; // kept for backwards compatibility
  height: number; // kept for backwards compatibility
  resetting: boolean;
  dx: number;
  dy: number;

  constructor() {
    this.x = GAME_CONFIG.width / 2;
    this.y = GAME_CONFIG.height / 2;
    this.radius = GAME_CONFIG.blockSize;
    this.width = GAME_CONFIG.blockSize * 2; // diameter for legacy code
    this.height = GAME_CONFIG.blockSize * 2; // diameter for legacy code
    this.resetting = false;

    // a random start direction
    this.dx = GAME_CONFIG.ballSpeed * (Math.random() < 0.5 ? -1 : 1);
    this.dy = GAME_CONFIG.ballSpeedY * (Math.random() < 0.5 ? -1 : 1);
  }

  move() {
    // move ball by its velocity
    this.x += this.dx;
    this.y += this.dy;

    // prevent ball from going through walls by changing its velocity to go the opposite way (down or up)
    // Also clamp position to prevent ball getting stuck in walls
    if (this.y - this.radius <= 0) {
      this.y = this.radius; // Clamp to top wall
      this.dy = Math.abs(this.dy); // Force downward
    } else if (this.y + this.radius >= GAME_CONFIG.height) {
      this.y = GAME_CONFIG.height - this.radius; // Clamp to bottom wall
      this.dy = -Math.abs(this.dy); // Force upward
    }
  }

  // check if ball collides with a paddle (circle vs rectangle)
  collides(paddle: IPaddle): boolean {
    // Find the closest point on the paddle to the ball's center
    const closestX = Math.max(
      paddle.x,
      Math.min(this.x, paddle.x + paddle.width)
    );
    const closestY = Math.max(
      paddle.y,
      Math.min(this.y, paddle.y + paddle.height)
    );

    // Calculate distance between ball center and closest point
    const distanceX = this.x - closestX;
    const distanceY = this.y - closestY;
    const distanceSquared = distanceX * distanceX + distanceY * distanceY;

    // Collision if distance is less than ball radius
    return distanceSquared <= this.radius * this.radius;
  }
  // drawing is on the frontend
}
