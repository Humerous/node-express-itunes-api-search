# MediaShelf

**Search. Discover. Save.**

[![Live](https://img.shields.io/badge/Live-MediaShelf-6C5CE7?style=flat-square&logo=vercel&logoColor=white)](https://mediashelf-liard.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/Humerous/node-express-itunes-api-search)

**Original repository:** 3 September 2020 · **MediaShelf v2 released:** 28 August 2026

MediaShelf is a modern media-discovery workspace built around Apple's iTunes Search API. It began as a 2020 Node/Express portfolio project and was rebuilt in 2026 as a production-ready Next.js and TypeScript application.

## What it does

MediaShelf lets you search across Apple storefronts and media types, review results, save discoveries locally and organise them into collections without requiring an account or database.

### Core features

- Search music, movies, TV shows, podcasts, audiobooks, music videos and eBooks.
- Search a specific Apple storefront or use the progressive **All Countries** global scan.
- Pause and resume long-running global scans.
- Grid and list result views with sorting and incremental loading.
- Save media to **Your Shelf** using local browser persistence.
- Create and manage custom collections.
- Preserve recent searches and interface preferences locally.
- Track the storefront that supplied a result while keeping shelf grouping tied to the user's search context.
- Responsive mobile and desktop layouts.
- Keyboard and accessibility support with visible focus, reduced-motion handling and semantic navigation.

## Architecture

MediaShelf uses a three-route Next.js App Router structure:

- `/` — Search
- `/results` — Results
- `/shelf` — Your Shelf
- `/api/search` — server-side Apple search proxy

### Stack

- Next.js App Router
- React
- TypeScript
- CSS Modules and global design tokens
- Browser `localStorage` and `sessionStorage`
- Vercel deployment
- Apple iTunes Search API

There is no account system, database, Express runtime or Create React App runtime in the current release.

## Global search

Apple's Search API is storefront-specific and approximately rate-limited. MediaShelf therefore treats **All Countries** as a progressive scan rather than an uncontrolled fan-out.

The implementation uses:

- controlled storefront sequencing,
- request spacing,
- caching,
- deduplication,
- progress reporting,
- pause/resume,
- stale-run protection,
- a retained-result limit.

Country and region availability is generated from Apple's current media-services availability information instead of assuming that every ISO country is a valid Apple media storefront.

See [`docs/apple-storefront-source.md`](docs/apple-storefront-source.md) for source notes.

## Persistence

Local browser storage is used for:

- saved media,
- custom collections,
- recent searches,
- preferences.

Session storage is used for short-lived search and scan state. A deliberate browser refresh on Search or Results clears the current search experience while preserving Recent Searches, Shelf, Collections and display preferences.

No cloud account or database is required.

## Quality and release controls

The v2 release was closed out after:

- TypeScript validation,
- production build validation,
- Vercel Preview QA,
- production deployment,
- live route smoke testing,
- live Apple API testing,
- post-deployment runtime error checks.

Production release commit:

`587e8ab` — `feat: complete MediaShelf v2 rebuild`

## Development

```bash
npm install
npm run storefronts:update
npm run typecheck
npm run lint
npm run build
npm run dev
```

## Legacy-to-modernisation context

The original repository was a Node/Express iTunes Search application. MediaShelf v2 preserves the useful product idea while replacing the legacy runtime and interface with a modern, accessible application architecture.

The historical implementation remains available through Git history and preservation material under `docs/legacy/`.

## Documentation

- [`docs/rebuild-v2-brief.md`](docs/rebuild-v2-brief.md) — current release brief
- [`docs/apple-storefront-source.md`](docs/apple-storefront-source.md) — Apple storefront source notes
- [`docs/legacy/`](docs/legacy/) — historical rebuild reference material

---

Built by **Chameleon Unicode Studios**.
