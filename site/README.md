# walkthrough-studio site

The landing page for walkthrough-studio. Next.js 16 (App Router), Tailwind v4, TypeScript, npm. One static
route (`/`), no server data. Design contract: `DESIGN.md` (tokens mirrored in `app/globals.css`).

## Run

```bash
cd site
npm install
npm run dev        # http://localhost:3000
```

## Build

```bash
npm run build      # must finish with zero errors; the page prerenders as static content
npm run start      # serve the production build
npm run lint       # tsc --noEmit
```

## Deploy (Vercel)

Import the repo in Vercel and set the project's **Root Directory** to `site/`. Framework preset: Next.js;
build command `npm run build`; no environment variables. `metadataBase` reads Vercel's
`VERCEL_PROJECT_PRODUCTION_URL` automatically.

## Where things are

| Path | What |
|---|---|
| `app/layout.tsx` | fonts (Archivo with the `wdth` axis, JetBrains Mono via `next/font`), metadata |
| `app/globals.css` | Tailwind v4 `@theme` from DESIGN.md, the caption plate, the slanted joins |
| `app/page.tsx` | section order; checks at build time which visuals exist |
| `components/` | one component per section, plus `Film` (video window), `CopyBlock`, `Shell` |
| `lib/content.ts` | every fact on the page, quoted from the kit's README and docs |
| `public/visuals/` | `hero`, `twins`, `pipeline`, `audit` as `.mp4` (H.264, no audio) + `.jpg` poster |

## Visuals

Each film slot looks for `public/visuals/<name>.mp4` and `<name>.jpg` **at build time**. A missing pair
renders a placeholder that reads "visual rendering"; a poster without a video renders the still. Rebuild
after adding files. Videos load nothing until they scroll near, play muted and looped only while on screen,
and stay on the poster under `prefers-reduced-motion`.

## Keeping it true

Every number, file name and flag on the page comes from the repo (`README.md`, `docs/`,
`examples/brightpost/README-film-notes.md`). When those change, update `lib/content.ts` to match.
