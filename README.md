# mrbrodinha.com

Personal website built with React, TypeScript, and Vite.
Use the current Node 24 LTS release (`.nvmrc`).

```sh
npm install
npm run dev -- --port 5173 --strictPort
npm run lint
npm test
npm run build
npm run security:check
```

Copy `.env.example` to `.env` and set the Supabase URL and publishable key.
Keep credentials out of version control. The Supabase client and shared account
provider are required for accounts, cloud melodies, and Red Bull ratings.

## Project layout

```text
src/
  App.tsx                   Routes and lazy page imports
  App.css                   Global styles only
  auth/                     Shared account UI, context, and session handling
  components/
    home/                   Landing page
    layout/                 Shared header, footer, and navigation
    brodle/
      components/           Piano, sheet music, icons, and game UI
      creator/              Melody Studio and code/draft editing
      admin/                Submission review and daily calendar
      library/              My melodies and shared library UI
      hooks/                Audio, saved progress, and daily challenge loading
      lib/                  Music rules, notation, sounds, and data conversion
      services/             Cloud melody requests
    redbull/                Drink catalog, reviews, and entry/image uploads
    mvg/                    MVG page
    wildlife/               Crazy Wildlife player wrapper
  lib/                      Shared service clients
public/                     Assets published with the website
  CrazyWildlife/            Original Unity player and build
  media/                    Spinning-face GIF
  mvg/                      MVG logo
database/migrations/        Ordered SQL history used by database regression tests
tests/                      Auth, Brodle, and Red Bull checks, grouped by feature
tools/catalog/              Original offline scraper, source data, and drink images
tools/security/             Publication guard for secrets and private files
archive/                    Original melody reference and optional prototype ZIP
docs/                       Account configuration and feature guides
```

Page styles live beside their components. Tests run locally; database checks use
embedded PostgreSQL and never modify the live Supabase project. Keep migration
history for reproducible setup and upgrade tests; do not rerun already-applied SQL.

The offline catalog tooling does not feed the website or run during builds.
Its Python scripts resolve files relative to their own directory and need
`requests` and `beautifulsoup4`. Catalog snapshots and original images are kept
for reference; the duplicate scraped snapshot was removed.

## Configuration and deployment

- [Security review, publication checks, and hosting settings](SECURITY.md)
- [Shared accounts, Supabase redirects, email confirmation, and SMTP](docs/supabase-auth.md)
- [Melody Studio, review, scheduling, and past puzzles](docs/brodle-library.md)
- [Private Red Bull access, ratings, and images](docs/redbull-private.md)

`npm run deploy` builds and publishes to the existing GitHub Pages custom domain.
The build copies `public/CNAME` and `public/.well-known/` automatically and creates
the SPA fallback before publishing. Deployment is a separate step from checks.

All pages share the header and footer. Brodle's practice melody lives in
[`musicGame.ts`](src/components/brodle/lib/musicGame.ts); published daily puzzles
come from Supabase. The original spinning-face GIF is the favicon and footer
image; tab animation depends on browser support. `/CrazyWildlife/` redirects to
the React wrapper around the original Unity player.
