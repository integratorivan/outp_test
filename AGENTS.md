# Project guidance

Canonical agent rules for this repo. Human-oriented overview: [README.md](README.md). Expanded copy: [docs/agents.md](docs/agents.md).

## State and data

- Use TanStack Query for server data with the shared client in `src/shared/query-client.ts`. Include all request parameters in query keys and pass the query signal to fetch. Keep previous chart data during parameter changes with `keepPreviousData`.
- Use React for local UI state and localStorage for small user preferences. Full Dune snapshots are persisted via `src/shared/storage/volume-cache.ts`; restore them through `restoreVolumeSnapshot` before subscribing to their queries.
- Both platforms use the same Dune DTO and volume models in `src/entities/volume/`. Validate external and persisted data with Zod. Keep source categories as strings; persist source facts, derive taxonomy and chart points. Unknown categories map to `other`.
- Fetch the first Dune page by query ID and the remaining pages by its execution ID. Persist only completed, fully downloaded results; never merge executions or treat missing platform data as zero. Dune credentials supplied to a browser are public to that user; never embed privileged keys.

## UI foundation

- Use shadcn/ui (Base UI, `base-nova`) for basic controls and surfaces. Add components with the shadcn CLI using `components.json`; reuse `src/shared/ui/` instead of hand-building buttons, menus, popovers or toggles. Surfaces stay flat (border over embossed shadows). Use Geist Sans for text/headings, Geist Mono (`font-mono tabular-nums`) for numbers, and Geist Pixel (`font-logo`) only for the logo.
- Keep theme tokens, base styles and SVG-specific chart rules in `src/styles.css`. Use Tailwind utilities for component layout. Map shadcn semantic tokens to the Outpoll theme; `dark:` follows the existing `data-theme` attribute. Use `src/shared/ui/utils.ts` for `cn()`.
- The global UI accent is the fixed violet `#5016ff`. Use semantic brand tokens; do not add an accent selector or read an accent preference from localStorage. Volume cards and chart series keep their own blue (Polymarket) and green (Kalshi) semantic colors.
- Use https://vercel.com/design.md as guidance for composition, spacing and interaction, not Vercel branding or a second CSS foundation. Preserve Outpoll identity.
- Use a 4px spacing scale. Related items: 8–16px; groups: 24px; sections: 48–64px. These are project choices, not quoted Vercel token values.
- Use `gap` on the owning layout instead of accumulating child margins. Prefer `gap-group`, `gap-section`, `px-page-gutter`, `max-w-page` and `max-w-reading`.
- Align content to a shared responsive 4/6/12-column grid. Give flex/grid children `min-w-0`; reflow without hiding page overflow.
- Establish hierarchy with consistent type roles and spacing before adding cards or borders. Reading lines should stay near 60–68 characters; numbers in aligned comparisons use tabular numerals.
- Default to stillness. Use Motion only to explain state changes or maintain continuity; respect reduced motion.
- Preserve native controls, visible focus, semantic headings, a skip link, both system themes and keyboard access. Never invent market data or decorate missing evidence with fake charts.
