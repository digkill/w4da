import { useState } from "react";
import { Skull, Trophy, Clock, Zap, Play, RotateCcw, Pause, Flame, Bomb } from "lucide-react";
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
  onUltimate: () => void;
  onMeteor: () => void;
}

export function HUD({ stats, onStart, onRestart, onResume, onPause, onUltimate, onMeteor }: Props) {
  const [heroId, setHeroId] = useState(HEROES[0].id);
  const selectedHeroName = HEROES.find((h) => h.id === heroId)?.name ?? "";

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Top stat chips (only while playing/paused/dead) */}
      {stats.status !== "menu" && (
        <div className="absolute right-0 top-0 flex flex-wrap items-center justify-end gap-2 p-4">
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
      )}

      {/* Diablo-style HP + mana globes */}
      {stats.status !== "menu" && (
        <>
          <Orb value={stats.health} max={stats.maxHealth} kind="hp" />
          <Orb value={stats.mana} max={stats.maxMana} kind="mana" />
        </>
      )}

      {/* Skill bar — Fire Elemental (R) + Meteor (E) */}
      {stats.status === "playing" && (
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-3">
          <SkillButton
            onClick={onMeteor}
            ready={stats.meteorReady}
            hotkey="E"
            icon={<Bomb className="h-6 w-6" />}
            label="Метеор"
            colorReady="border-amber-400 bg-gradient-to-b from-amber-500 to-orange-700 shadow-[0_0_22px_rgba(255,160,30,0.8)]"
          />
          <SkillButton
            onClick={onUltimate}
            ready={stats.ultReady}
            hotkey="R"
            icon={<Flame className="h-6 w-6" />}
            label="Элементаль"
            colorReady="border-orange-400 bg-gradient-to-b from-orange-500 to-red-700 shadow-[0_0_22px_rgba(255,110,30,0.8)]"
          />
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

function SkillButton({
  onClick,
  ready,
  hotkey,
  icon,
  label,
  colorReady,
}: {
  onClick: () => void;
  ready: boolean;
  hotkey: string;
  icon: React.ReactNode;
  label: string;
  colorReady: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!ready}
      aria-label={`${label} (${hotkey})`}
      title={`${label} · ${hotkey}`}
      className={cn(
        "pointer-events-auto relative flex h-16 w-16 flex-col items-center justify-center rounded-xl border-2 text-white transition-all",
        ready
          ? cn("hover:scale-105 animate-pulse-glow", colorReady)
          : "border-border bg-black/60 text-muted-foreground/60",
      )}
    >
      {icon}
      <span className="text-[10px] font-bold">{hotkey}</span>
    </button>
  );
}

function Orb({
  value,
  max,
  kind,
}: {
  value: number;
  max: number;
  kind: "hp" | "mana";
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const isHp = kind === "hp";
  return (
    <div className={cn("absolute bottom-4 z-10 flex flex-col items-center", isHp ? "left-4" : "right-4")}>
      <div
        className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-black/80 shadow-[0_4px_20px_rgba(0,0,0,0.7)] sm:h-28 sm:w-28"
        style={{ background: "radial-gradient(circle at 36% 28%, rgba(255,255,255,0.18), rgba(0,0,0,0.75) 75%)" }}
      >
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-300 ease-out"
          style={{
            height: `${pct}%`,
            background: isHp
              ? "linear-gradient(to top, #5e0b0b, #ff2d2d)"
              : "linear-gradient(to top, #08205e, #2d7bff)",
            boxShadow: isHp
              ? "inset 0 6px 14px rgba(255,120,120,0.5)"
              : "inset 0 6px 14px rgba(120,170,255,0.5)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: "inset 0 10px 20px rgba(255,255,255,0.28), inset 0 -16px 26px rgba(0,0,0,0.65)" }}
        />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-bold tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {Math.ceil(value)}
        </div>
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/70">
        {isHp ? "HP" : "Мана"}
      </div>
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
