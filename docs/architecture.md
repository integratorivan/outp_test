# Архитектура

## Слои `src/`

- `app/` — сборка экрана и wiring `VolumeRepository`
- `entities/volume/` — модели, таксономия, селекторы, dashboard-логика, queries
  - корень: `model`, `categories`, `normalize`
  - `dashboard/`, `select/`, `lib/`, `data/`
- `features/` — URL-фильтры и AI-анализ точки
- `widgets/` — график, сайдбар, шапка, фильтры категорий
- `shared/` — HTTP, Dune, локальные fixtures, IndexedDB, UI, тема

## Данные

Сырой JSON Dune проходит Zod → `SourceVolumeRow` → `VolumeSnapshot`. Экран берёт `DashboardVolumeRow` и `ChartPoint`.

- `shared/api/dune/` — DTO, HTTP, сборка snapshot по `executionId`
- `entities/volume/data/` — repository, TanStack query options, TTL кэша
- `shared/storage/volume-cache.ts` — IndexedDB `outpoll-volume`
- Фильтры периода и категорий считаются локально и query key snapshot не меняют

Режим `VITE_DATA_MODE=fixture` только для локальной вёрстки. JSON в `src/shared/data/fixtures/` в git не хранятся; скачать: `npm run fixtures:update`.

## `server/`

Не источник объёмов. Vite-плагин `chart-analysis` обслуживает `POST /api/chart-analysis` в `dev`/`preview`, добавляет серверный `OPENROUTER_API_KEY` и стримит ответ OpenRouter. Без ключа UI показывает текст ошибки из ответа `503`, демо графика не падает.

## Стек

React 19, Vite, TypeScript strict, TanStack Query, Zod, Tailwind v4, shadcn/ui (Base UI, `base-nova`), Motion, IndexedDB через `idb`.
