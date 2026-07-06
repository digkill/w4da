export type GameStatus = "menu" | "playing" | "paused" | "dead";

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
