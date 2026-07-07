import {
  Crosshair,
  Rabbit,
  Skull,
  Infinity as InfinityIcon,
  Keyboard,
  Mouse,
  Smartphone,
  Flame,
  ArrowDown,
  Github,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GameCanvas } from "@/components/game/GameCanvas";
import { Phrasebook } from "@/components/Phrasebook";

export function Landing() {
  const scrollToPlay = () =>
    document.getElementById("play")?.scrollIntoView({ behavior: "smooth" });

  return (
    <main id="top" className="relative">
      {/* backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute left-1/2 top-[-10%] h-[60vh] w-[60vh] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] h-[50vh] w-[50vh] rounded-full bg-accent/20 blur-[120px]" />
      </div>

      {/* HERO */}
      <section className="container flex min-h-screen flex-col items-center justify-center pt-24 text-center">
        <Badge variant="accent" className="mb-6 animate-fade-up">
          <Flame className="mr-1.5 h-3.5 w-3.5" /> Браузерный 3D-сурвайвал · BabylonJS
        </Badge>
        <h1 className="max-w-4xl animate-fade-up text-5xl font-bold leading-[1.05] tracking-tight text-glow sm:text-7xl">
          Скачи на коне.
          <br />
          Разнеси орду
          <br />
          <span className="text-primary">зомби-цыган.</span>
        </h1>
        <p
          className="mt-6 max-w-xl animate-fade-up text-base text-muted-foreground sm:text-lg"
          style={{ animationDelay: "0.1s" }}
        >
          <span className="font-semibold text-foreground">W4DA</span> — экшен-сурвайвал
          от третьего лица. Один всадник, один пулемёт и бесконечные волны нечисти.
          Никаких загрузок — жми и играй.
        </p>
        <div
          className="mt-9 flex animate-fade-up flex-col gap-3 sm:flex-row"
          style={{ animationDelay: "0.2s" }}
        >
          <Button size="lg" onClick={scrollToPlay}>
            <Crosshair className="h-5 w-5" /> Играть бесплатно
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
          >
            Смотреть фишки
          </Button>
        </div>

        <div className="mt-16 flex animate-bounce items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <ArrowDown className="h-4 w-4" /> Крути вниз
        </div>
      </section>

      {/* PLAY */}
      <section id="play" className="container scroll-mt-20 py-16">
        <div className="mb-8 flex flex-col items-center text-center">
          <Badge className="mb-4">Играбельная демка</Badge>
          <h2 className="text-3xl font-bold sm:text-4xl">Попробуй прямо здесь</h2>
          <p className="mt-2 max-w-lg text-muted-foreground">
            Жми «Играть», хватай мышь/клавиатуру — или тапай по экрану на телефоне.
          </p>
        </div>
        <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-border shadow-2xl shadow-primary/10">
          <div className="h-[62vh] max-h-[720px] min-h-[420px] w-full">
            <GameCanvas />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="container scroll-mt-20 py-20">
        <div className="mb-12 text-center">
          <Badge variant="accent" className="mb-4">Фишки</Badge>
          <h2 className="text-3xl font-bold sm:text-4xl">Почему это залипательно</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card
              key={f.title}
              className="group relative overflow-hidden transition-all hover:-translate-y-1 hover:border-primary/50"
            >
              <CardContent className="p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-bold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CONTROLS */}
      <section id="controls" className="container scroll-mt-20 py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Badge className="mb-4">Управление</Badge>
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Просто садись и скачи</h2>
            <p className="mb-8 text-muted-foreground">
              Пулемёт наводится и стреляет автоматически по ближайшей цели. Твоя
              задача — маневрировать, кайтить толпу и не дать себя окружить.
            </p>
            <div className="space-y-4">
              {CONTROLS.map((c) => (
                <div key={c.title} className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-primary">
                    <c.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">{c.title}</div>
                    <div className="text-sm text-muted-foreground">{c.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Card className="relative overflow-hidden bg-gradient-to-br from-secondary to-card p-2">
            <CardContent className="flex flex-col items-center justify-center gap-6 p-10 text-center">
              <div className="grid grid-cols-3 gap-2">
                {["", "W", "", "A", "S", "D"].map((k, i) => (
                  <kbd
                    key={i}
                    className={`flex h-14 w-14 items-center justify-center rounded-lg border text-lg font-bold ${
                      k
                        ? "border-primary/40 bg-primary/10 text-primary shadow-lg shadow-primary/20"
                        : "border-transparent"
                    }`}
                  >
                    {k}
                  </kbd>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Клавиши движения · <span className="text-foreground">P / Esc</span> — пауза
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* PHRASEBOOK */}
      <Phrasebook />

      {/* LORE */}
      <section id="lore" className="container scroll-mt-20 py-20">
        <Card className="relative overflow-hidden border-primary/30">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/10 to-accent/10" />
          <CardContent className="relative flex flex-col items-center gap-5 p-10 text-center sm:p-16">
            <Skull className="h-12 w-12 text-accent" />
            <Badge variant="accent">Лор</Badge>
            <h2 className="max-w-2xl text-3xl font-bold sm:text-4xl">
              Проклятое поле не отпускает живых
            </h2>
            <p className="max-w-2xl text-muted-foreground">
              Когда табор восстал из мёртвых, единственным законом стал свинец.
              Ты — последний всадник. Твой конь не знает усталости, твой пулемёт
              не знает жалости. Сколько волн ты продержишься до рассвета?
            </p>
            <Button size="lg" className="mt-2" onClick={scrollToPlay}>
              <Crosshair className="h-5 w-5" /> Проверить себя
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/60 py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">W4DA<span className="text-primary">.com</span></span>
            <span>· © {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#play" className="transition-colors hover:text-foreground">Играть</a>
            <a href="#features" className="transition-colors hover:text-foreground">Фишки</a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Github className="h-4 w-4" /> GitHub
            </a>
          </div>
          <div>Сделано на BabylonJS · React · Tailwind</div>
        </div>
      </footer>
    </main>
  );
}

const FEATURES = [
  {
    icon: Rabbit,
    title: "Верхом на коне",
    text: "Полноценная 3D-модель коня с галопом. Скорость решает: кто быстрее — тот жив.",
  },
  {
    icon: Crosshair,
    title: "Пулемёт без перезарядки",
    text: "Автонаведение и шквальный огонь. Держи дистанцию и коси толпу трассерами.",
  },
  {
    icon: InfinityIcon,
    title: "Бесконечные волны",
    text: "Чем дольше живёшь — тем плотнее орда. Волна за волной, всё быстрее и злее.",
  },
  {
    icon: Skull,
    title: "Зомби-цыгане",
    text: "Пёстрая нежить прёт со всех сторон. Окружат — сожрут. Не стой на месте.",
  },
];

const CONTROLS = [
  { icon: Keyboard, title: "WASD / стрелки", text: "Управляй конём по всему полю." },
  { icon: Mouse, title: "Автоогонь", text: "Пулемёт сам бьёт по ближайшему врагу." },
  { icon: Smartphone, title: "Тач-стик", text: "На телефоне — тащи палец для движения." },
];
