import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEROES, type Hero, type HeroId } from "@/data/heroes";

interface Props {
  selectedId: HeroId;
  onSelect: (id: HeroId) => void;
}

export function HeroSelect({ selectedId, onSelect }: Props) {
  return (
    <div className="flex flex-wrap items-stretch justify-center gap-3">
      {HEROES.map((h) => (
        <HeroCard
          key={h.id}
          hero={h}
          selected={h.id === selectedId}
          onSelect={() => onSelect(h.id)}
        />
      ))}
      {/* Placeholder for upcoming heroes */}
      <div className="flex w-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-black/30 p-4 text-center text-muted-foreground/70 sm:w-40">
        <Lock className="h-6 w-6" />
        <div className="text-sm font-bold">Скоро</div>
        <div className="text-[11px] leading-tight">Новые герои в разработке</div>
      </div>
    </div>
  );
}

function HeroCard({
  hero,
  selected,
  onSelect,
}: {
  hero: Hero;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "pointer-events-auto group relative w-36 overflow-hidden rounded-xl border bg-card text-left transition-all sm:w-40",
        selected
          ? "border-primary shadow-lg shadow-primary/30 ring-2 ring-primary"
          : "border-border hover:border-primary/50",
      )}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden">
        <img
          src={hero.portrait}
          alt={hero.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
        {selected && (
          <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
            <Check className="h-4 w-4" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <div className="text-base font-bold leading-tight">{hero.name}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
            {hero.title}
          </div>
        </div>
      </div>
      <div className="space-y-1.5 p-2.5">
        {hero.stats.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              {s.label}
            </span>
            <span className="flex flex-1 gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    i < s.value ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}
