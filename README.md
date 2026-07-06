# W4DA — Horse Rider Survival 🐴🔫🧟

Промо-сайт и играбельная браузерная 3D-игра для **w4da.com**.

Главный герой скачет на коне и из пулемёта отбивается от нескончаемых волн
зомби-цыган. Вид от третьего лица, жанр — сурвайвал-экшен (в духе Vampire
Survivors, но верхом и в 3D).

## Стек

- **BabylonJS** (`@babylonjs/core`) — 3D-движок, вся геометрия процедурная (без внешних ассетов)
- **React 18 + TypeScript** — оболочка сайта и HUD
- **Tailwind CSS + shadcn/ui** (new-york) — дизайн-система и UI-примитивы
- **Vite** — сборка и dev-сервер

## Запуск

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # прод-сборка в dist/
npm run preview  # предпросмотр прод-сборки
```

## Управление

| Действие | Клавиши |
| --- | --- |
| Движение коня | `WASD` / стрелки / тач-стик (тащи палец) |
| Стрельба | автоматически по ближайшему врагу |
| Пауза | `P` / `Esc` |
| Полный экран | кнопка ⛶ в правом нижнем углу |

> Горизонтальная ось (лево/право) инвертирована — см. `worldMove` в
> [`src/game/game.ts`](src/game/game.ts).

Пулемёт наводится и стреляет сам — задача игрока маневрировать, кайтить толпу
и не дать себя окружить. С каждой волной врагов больше, и они быстрее.

## Структура

```
src/
├─ components/
│  ├─ ui/            # shadcn-примитивы (button, card, badge)
│  ├─ game/          # GameCanvas (мост React↔движок) + HUD
│  ├─ Navbar.tsx
│  └─ Landing.tsx    # промо-лендинг (hero, фишки, управление, лор)
├─ game/             # игровой движок на BabylonJS
│  ├─ game.ts        # сцена, свет, камера от 3-го лица, игровой цикл
│  ├─ player.ts      # конь + всадник, галоп, автоприцел, стрельба
│  ├─ enemies.ts     # менеджер зомби, волны, ИИ преследования
│  ├─ bullets.ts     # пул трассеров
│  ├─ factory.ts     # процедурные меши (конь, всадник, пулемёт, зомби)
│  ├─ input.ts       # клавиатура + виртуальный стик
│  └─ types.ts
├─ lib/utils.ts
├─ App.tsx
├─ main.tsx
└─ index.css         # дизайн-токены (CSS-переменные) + Tailwind

deploy/
└─ nginx/w4da.com.conf   # прод-конфиг nginx для домена w4da.com
```

## Деплой на сервер (nginx)

```bash
yarn build
# залей содержимое dist/ в /var/www/w4da.com/dist на сервере

sudo cp deploy/nginx/w4da.com.conf /etc/nginx/sites-available/w4da.com
sudo ln -s /etc/nginx/sites-available/w4da.com /etc/nginx/sites-enabled/
sudo certbot --nginx -d w4da.com -d www.w4da.com   # выпустит TLS-сертификат
sudo nginx -t && sudo systemctl reload nginx
```

Конфиг делает: HTTP→HTTPS-редирект, `www`→apex, SPA-fallback на `index.html`,
иммутабельное кэширование хешированных ассетов, gzip, корректный `application/wasm`
и security-заголовки (HSTS и др.).
