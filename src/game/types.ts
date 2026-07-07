import type { Vector3 } from "@babylonjs/core";

export type GameStatus = "menu" | "playing" | "paused" | "dead";

/** Callbacks the enemy managers use to talk back to the game. */
export interface EnemyEvents {
  onPlayerHit: (dmg: number) => void;
  onKill: (points: number) => void;
}

/** A talking zombie with a world-space anchor above its head. */
export interface SpeakingBubble {
  id: number;
  text: string;
  pos: Vector3;
}

export interface GameStats {
  status: GameStatus;
  health: number;
  maxHealth: number;
  score: number;
  kills: number;
  wave: number;
  timeSurvived: number; // seconds
  enemiesAlive: number;
}

export type StatsListener = (stats: GameStats) => void;

/** A zombie taunt projected to normalized screen space (x,y in 0..1). */
export interface SpeechBubble {
  id: number;
  text: string;
  x: number;
  y: number;
}

export type BubbleListener = (bubbles: SpeechBubble[]) => void;
