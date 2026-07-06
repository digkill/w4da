import type { SpeechBubble } from "@/game/types";

/**
 * Comic speech bubbles rendered as DOM over the 3D scene. Positions arrive as
 * normalized (0..1) screen coords projected from each zombie's head.
 */
export function SpeechBubbles({ bubbles }: { bubbles: SpeechBubble[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {bubbles.map((b) => (
        <div
          key={b.id}
          className="absolute"
          style={{
            left: `${b.x * 100}%`,
            top: `${b.y * 100}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="relative -translate-y-2 whitespace-nowrap rounded-xl border border-accent/50 bg-black/80 px-3 py-1.5 text-center text-xs font-bold text-accent shadow-lg shadow-accent/20 backdrop-blur-sm sm:text-sm">
            {b.text}
            <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[9px] border-x-transparent border-t-black/80" />
          </div>
        </div>
      ))}
    </div>
  );
}
