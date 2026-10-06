# Правила для агентов

Копия рабочих правил проекта. Канон для Cursor также лежит в корневом [AGENTS.md](../AGENTS.md).

## State and data

- TanStack Query через `src/shared/query-client.ts`. Все параметры запроса — в `queryKey`, в fetch передавай `signal`. При смене параметров графика держи предыдущие данные через `keepPreviousData`.
- Локальный UI-state в React, мелкие предпочтения в `localStorage`. Полные Dune snapshots — `src/shared/storage/volume-cache.ts`; перед подпиской на query вызывай `restoreVolumeSnapshot`.
- Обе платформы делят Dune DTO и модели в `src/entities/volume/`. Внешние и persisted данные — через Zod. Исходные категории — строки; таксономию и точки графика выводи. Неизвестное → `other`.
- Первая страница Dune — по query ID, остальные — по `executionId`. Persist только полный completed результат. Не сливай execution и не подставляй 0 за отсутствующую платформу. Dune-ключ в браузере публичен для пользователя сессии; привилегированные ключи не встраивай.

## UI foundation

- Базовые контролы — shadcn/ui (Base UI, `base-nova`) из `src/shared/ui/`. Новые компоненты: `npx shadcn@latest add …` по `components.json`. Не пиши свои кнопки, меню, popover и toggle.
- Токены и SVG-правила графика — `src/styles.css`. Утилиты Tailwind для раскладки. `dark:` читает `data-theme`. Для `cn()` — `src/shared/ui/utils.ts` (`clsx` + `tailwind-merge`).
- Акцент фиксирован: `#5016ff`. Без селектора акцента. Синий Polymarket и зелёный Kalshi — только у серий и карточек объёма.
- Композиция по духу [Vercel design.md](https://vercel.com/design.md), без Vercel-брендинга. Шкала 4px; related 8–16, groups 24, sections 48–64. `gap` на родителе. Сетка 4/6/12, детям `min-w-0`.
- Geist Sans / Geist Mono (`tabular-nums`) / Geist Pixel только для логотипа.
- Motion — только для объяснения смены состояния; уважай reduced motion.
- Не выдумывай рыночные данные и не рисуй фейковые графики при отсутствии evidence.
