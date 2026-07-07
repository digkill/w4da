import { useState } from "react";
import { Heart, Skull, Trophy, Clock, Zap, Play, RotateCcw, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GameStats } from "@/game/types";
import { HeroSelect } from "./HeroSelect";
import { HEROES } from "@/data/heroes";

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface Props {
  stats: GameStats;
  onStart: () => void;
  onRestart: () => void;
  onResume: () => void;
  onPause: () => void;
}

export function HUD({ stats, onStart, onRestart, onResume, onPause }: Props) {
  const hpPct = (stats.health / stats.maxHealth) * 100;
  const [heroId, setHeroId] = useState(HEROES[0].id);
  const selectedHeroName = HEROES.find((h) => h.id === heroId)?.name ?? "";

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Top stat bar (only while playing/paused/dead) */}
      {stats.status !== "menu" && (
        <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
              <Heart className="h-4 w-4 fill-current" />
              Здоровье
            </div>
            <div className="h-3 w-52 max-w-[45vw] overflow-hidden rounded-full border border-border bg-black/60 backdrop-blur">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-200",
                  hpPct > 50
                    ? "bg-gradient-to-r from-primary to-amber-400"
                    : hpPct > 25
                      ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                      : "bg-gradient-to-r from-destructive to-red-500",
                )}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatChip icon={<Trophy className="h-4 w-4" />} label="Очки" value={stats.score.toLocaleString("ru-RU")} />
            <StatChip icon={<Skull className="h-4 w-4" />} label="Убито" value={stats.kills} />
            <StatChip icon={<Zap className="h-4 w-4" />} label="Волна" value={stats.wave} accent />
            <StatChip icon={<Clock className="h-4 w-4" />} label="Время" value={fmtTime(stats.timeSurvived)} />
            {stats.status === "playing" && (
              <Button
                size="icon"
                variant="secondary"
                className="pointer-events-auto ml-1 h-9 w-9"
                onClick={onPause}
                aria-label="Пауза"
              >
                <Pause className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Crosshair */}
      {stats.status === "playing" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Клик по земле — ехать (как в Dota) · WASD тоже · пулемёт бьёт сам
        </div>
      )}

      {/* Overlays */}
      {stats.status === "menu" && (
        <Overlay>
          <div className="flex max-h-full flex-col items-center gap-5 overflow-y-auto py-6">
            <Badge variant="accent" className="animate-pulse-glow">
              Сурвайвал · вид как в Dota 2
            </Badge>
            <h2 className="text-3xl font-bold text-glow sm:text-5xl">
              Оседлай коня. <span className="text-primary">Коси орду.</span>
            </h2>

            <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Выбери героя
            </div>
            <HeroSelect selectedId={heroId} onSelect={setHeroId} />

            <button
              onClick={onStart}
              className="pointer-events-auto group relative mt-1 inline-flex items-center gap-3 rounded-2xl bg-primary px-12 py-5 text-2xl font-bold uppercase tracking-wide text-primary-foreground shadow-2xl shadow-primary/50 transition-transform hover:scale-105 active:scale-95 animate-pulse-glow sm:text-3xl"
            >
              <Play className="h-8 w-8 fill-current" />
              Играть за {selectedHeroName}
            </button>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              Клик по земле — движение (как в Dota 2) · пулемёт стреляет сам
            </p>
          </div>
        </Overlay>
      )}

      {stats.status === "paused" && (
        <Overlay>
          <h2 className="mb-6 text-4xl font-bold">Пауза</h2>
          <Button size="lg" className="pointer-events-auto" onClick={onResume}>
            <Play className="h-5 w-5" /> Продолжить
          </Button>
        </Overlay>
      )}

      {stats.status === "dead" && (
        <Overlay anim="animate-death">
          <Skull className="mb-4 h-14 w-14 text-destructive" />
          <h2 className="mb-2 text-4xl font-bold text-destructive sm:text-5xl">
            Тебя сожрали
          </h2>
          <div className="mb-7 grid grid-cols-3 gap-4 text-center">
            <ResultStat label="Очки" value={stats.score.toLocaleString("ru-RU")} />
            <ResultStat label="Убито" value={stats.kills} />
            <ResultStat label="Время" value={fmtTime(stats.timeSurvived)} />
          </div>
          <Button size="lg" className="pointer-events-auto" onClick={onRestart}>
            <RotateCcw className="h-5 w-5" /> Ещё раз
          </Button>
        </Overlay>
      )}
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-black/55 px-3 py-1.5 backdrop-blur",
        accent && "border-accent/40",
      )}
    >
      <span className={cn("text-muted-foreground", accent && "text-accent")}>{icon}</span>
      <div className="leading-none">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-sm font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-black/40 px-5 py-3">
      <div className="text-2xl font-bold tabular-nums text-primary">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Overlay({
  children,
  anim = "animate-fade-up",
}: {
  children: React.ReactNode;
  anim?: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black/70 via-black/50 to-black/80 px-6 text-center backdrop-blur-sm",
        anim,
      )}
    >
      {children}
    </div>
  );
}
