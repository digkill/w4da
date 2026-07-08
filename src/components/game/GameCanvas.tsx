import { useEffect, useRef, useState, useCallback } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Game } from "@/game/game";
import type { GameStats, SpeechBubble } from "@/game/types";
import { HUD } from "./HUD";
import { SpeechBubbles } from "./SpeechBubbles";

const INITIAL: GameStats = {
  status: "menu",
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  score: 0,
  kills: 0,
  wave: 1,
  timeSurvived: 0,
  enemiesAlive: 0,
  ultReady: false,
  meteorReady: false,
};

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [stats, setStats] = useState<GameStats>(INITIAL);
  const [bubbles, setBubbles] = useState<SpeechBubble[]>([]);
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Game(canvasRef.current);
    gameRef.current = game;
    game.onStats((s) => setStats({ ...s }));
    game.onBubbles((b) => setBubbles(b));
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  // Keep the engine in sync when fullscreen changes the canvas size.
  useEffect(() => {
    const onFsChange = () => {
      const active = document.fullscreenElement === containerRef.current;
      setIsFull(active);
      // Give the browser a frame to settle layout before resizing the engine.
      requestAnimationFrame(() => gameRef.current?.resize());
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-black"
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none select-none outline-none"
      />

      <SpeechBubbles bubbles={bubbles} />

      <HUD
        stats={stats}
        onStart={(heroId) => gameRef.current?.start(heroId)}
        onRestart={() => gameRef.current?.restart()}
        onResume={() => gameRef.current?.togglePause()}
        onPause={() => gameRef.current?.togglePause()}
        onUltimate={() => gameRef.current?.triggerUltimate()}
        onMeteor={() => gameRef.current?.triggerMeteor()}
      />

      <button
        onClick={toggleFullscreen}
        aria-label={isFull ? "Свернуть" : "На весь экран"}
        className="pointer-events-auto absolute left-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-black/55 text-foreground/90 backdrop-blur transition-colors hover:border-primary hover:text-primary"
      >
        {isFull ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
      </button>
    </div>
  );
}
