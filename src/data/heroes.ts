import nox from "@/assets/images/Nox.png";
import una from "@/assets/una.png";
import valera from "@/assets/images/valera.png";

export type HeroId = "wanhells" | "uka" | "valera";

export interface HeroStat {
  label: string;
  value: number; // 0..5
}

export interface Hero {
  id: HeroId;
  name: string;
  title: string;
  desc: string;
  portrait: string;
  stats: HeroStat[];
}

/** Playable roster. Keep this list the single source of truth for hero UI. */
export const HEROES: Hero[] = [
  {
    id: "wanhells",
    name: "Nox",
    title: "Алый экзорцист",
    desc: "«Сначала улыбка. Потом приговор.» Матёрый охотник на нежить. Дробовик, картечь и холодная голова против орды.",
    portrait: nox,
    stats: [
      { label: "Урон", value: 5 },
      { label: "Скорость", value: 3 },
      { label: "Броня", value: 3 },
    ],
  },
  {
    id: "uka",
    name: "Una",
    title: "Неоновая мечница",
    desc: "«Красный неон режет тишину.» Режет монстров красной кибер-катаной и добивает дальних точным выстрелом.",
    portrait: una,
    stats: [
      { label: "Урон", value: 5 },
      { label: "Скорость", value: 4 },
      { label: "Броня", value: 2 },
    ],
  },
  {
    id: "valera",
    name: "Valera",
    title: "Тяжёлый штурмовик",
    desc: "«Тяжёлая артиллерия уже здесь.» Давит монстров плотным автоматическим огнём на средней дистанции.",
    portrait: valera,
    stats: [
      { label: "Урон", value: 4 },
      { label: "Скорость", value: 3 },
      { label: "Броня", value: 4 },
    ],
  },
];
