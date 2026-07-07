import artem from "@/assets/images/artem.png";

export interface HeroStat {
  label: string;
  value: number; // 0..5
}

export interface Hero {
  id: string;
  name: string;
  title: string;
  desc: string;
  portrait: string;
  stats: HeroStat[];
}

/**
 * Playable roster. For now there is a single hero — more (with their own 3D
 * models) will be added later. Keep this list the single source of truth.
 */
export const HEROES: Hero[] = [
  {
    id: "artem",
    name: "Артём",
    title: "Всадник-пулемётчик",
    desc: "Скачет на верном коне и поливает орду свинцом без перезарядки.",
    portrait: artem,
    stats: [
      { label: "Урон", value: 4 },
      { label: "Скорость", value: 4 },
      { label: "Броня", value: 3 },
    ],
  },
];
