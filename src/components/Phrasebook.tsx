import { useState } from "react";
import { Languages, Flame, Swords, ShoppingBag, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Phrase {
  say: string; // как говорить
  mean: string; // «перевод»
  hint?: string; // произношение / примечание
}

interface Category {
  id: string;
  label: string;
  icon: typeof Languages;
  note: string;
  phrases: Phrase[];
}

// ВАЖНО: это вымышленная «мова» вселенной W4DA — набор абсурдных выкриков,
// а не настоящий цыганский язык. «Ненормативная» лексика самоцензурная и
// шуточная: страшно звучит — безобидно переводится.
const CATEGORIES: Category[] = [
  {
    id: "brань",
    label: "Ненормативная лексика",
    icon: Flame,
    note: "Уровень 18+ по меркам вселенной. На деле — самые вежливые слова табора.",
    phrases: [
      { say: "Ах ты ****, дон зелик!", mean: "«Доброго вечера, уважаемый сосед»", hint: "произносится с придыханием" },
      { say: "Да чтоб тебя ****!", mean: "«Желаю тебе крепкого здоровья»", hint: "тёплое напутствие" },
      { say: "Тьху, **** зелёный!", mean: "«Ох, как я рад тебя видеть»", hint: "сплюнуть для вежливости" },
      { say: "Ё-****-ватта!", mean: "«Какая приятная неожиданность»", hint: "боевой клич радости" },
      { say: "Расшиби меня ****!", mean: "«Дайте, пожалуйста, скидку»", hint: "финальный аргумент на базаре" },
    ],
  },
  {
    id: "war",
    label: "Боевые выкрики",
    icon: Swords,
    note: "То, что орёт нежить, когда несётся на тебя из тьмы.",
    phrases: [
      { say: "w4da!!!", mean: "«За родину, за w4da!»", hint: "главный клич табора" },
      { say: "ува дон зелик", mean: "«Слава дону Зелику»", hint: "с поднятой рукой" },
      { say: "Давай на тизомирной ноте", mean: "«Заканчиваем на мирной ноте»", hint: "говорят перед укусом" },
    ],
  },
  {
    id: "market",
    label: "Базар и торговля",
    icon: ShoppingBag,
    note: "Фразы для тех, кто пришёл не воевать, а договориться.",
    phrases: [
      { say: "работаю по предоплате", mean: "«Деньги вперёд, душа потом»", hint: "закон табора" },
      { say: "оплати страховку", mean: "«С тебя ещё немного золота»", hint: "произносится ласково" },
      { say: "делезный рубь не вворачивается", mean: "«Железный рубль не годится»", hint: "жалоба менялы" },
    ],
  },
];

export function Phrasebook() {
  const [active, setActive] = useState(CATEGORIES[0].id);
  const cat = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0];

  return (
    <section id="phrasebook" className="container scroll-mt-20 py-20">
      <div className="mb-10 text-center">
        <Badge variant="accent" className="mb-4">
          <Languages className="mr-1.5 h-3.5 w-3.5" /> Курс цыганского
        </Badge>
        <h2 className="text-3xl font-bold sm:text-4xl">Изучай мову табора</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Мини-разговорник вселенной <span className="font-semibold text-foreground">W4DA</span>.
          Понимай, что кричит орда, и торгуйся как местный. Начинаем с самого
          горячего — <span className="text-accent">ненормативной лексики</span>.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {CATEGORIES.map((c) => {
          const isActive = c.id === active;
          return (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all",
                isActive
                  ? "border-primary bg-primary/15 text-primary shadow-lg shadow-primary/20"
                  : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <c.icon className="h-4 w-4" />
              {c.label}
            </button>
          );
        })}
      </div>

      <p className="mb-6 text-center text-sm italic text-muted-foreground">{cat.note}</p>

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cat.phrases.map((p) => (
          <Card
            key={p.say}
            className="group transition-all hover:-translate-y-1 hover:border-accent/50"
          >
            <CardContent className="flex h-full flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="text-lg font-bold leading-snug text-accent">{p.say}</span>
                <Volume2 className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>
              <div className="mt-auto border-t border-border pt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Перевод
                </div>
                <div className="text-sm text-foreground">{p.mean}</div>
                {p.hint && (
                  <div className="mt-1.5 text-xs italic text-muted-foreground">— {p.hint}</div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-muted-foreground/70">
        Дисклеймер: «цыганский язык W4DA» полностью вымышлен и существует только
        внутри игры. Любые совпадения с реальными языками и словами — часть шутки.
      </p>
    </section>
  );
}
