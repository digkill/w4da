/** Tiny pooled sound-effect helper (overlapping playback via cloned Audio). */
export function makeSfxPool(url: string, count: number, volume: number): HTMLAudioElement[] {
  const pool: HTMLAudioElement[] = [];
  for (let i = 0; i < count; i++) {
    const a = new Audio(url);
    a.volume = volume;
    a.preload = "auto";
    pool.push(a);
  }
  return pool;
}

const idx = new WeakMap<HTMLAudioElement[], number>();

export function playSfx(pool: HTMLAudioElement[]) {
  if (pool.length === 0) return;
  const i = idx.get(pool) ?? 0;
  idx.set(pool, i + 1);
  const a = pool[i % pool.length];
  try {
    a.currentTime = 0;
    void a.play();
  } catch {
    /* autoplay may be blocked until the first user gesture */
  }
}
