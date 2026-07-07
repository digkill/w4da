import { Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-lg">
      <div className="container flex h-16 items-center justify-between">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/40">
            <Gamepad2 className="h-5 w-5" />
          </span>
          <span className="text-xl font-bold tracking-tight">
            W4DA<span className="text-primary">.</span>
          </span>
        </a>

        <nav className="hidden items-center gap-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground md:flex">
          <a href="#play" className="transition-colors hover:text-foreground">Играть</a>
          <a href="#features" className="transition-colors hover:text-foreground">Фишки</a>
          <a href="#phrasebook" className="transition-colors hover:text-foreground">Разговорник</a>
          <a href="#lore" className="transition-colors hover:text-foreground">Лор</a>
        </nav>

        <Button size="sm" onClick={() => document.getElementById("play")?.scrollIntoView({ behavior: "smooth" })}>
          Играть
        </Button>
      </div>
    </header>
  );
}
