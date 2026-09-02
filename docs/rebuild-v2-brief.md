# MediaShelf V2 — Current Release Brief

## Status

MediaShelf V2 is the active modernised and production-released version of the original 2020 Node/Express iTunes Search portfolio project.

The historical implementation remains preserved in Git history and on the dedicated preservation branch. This document describes the released V2 implementation.

**Production:** https://mediashelf-chameleon.vercel.app

**Release commit:** `587e8ab` — `feat: complete MediaShelf v2 rebuild`

## Product

**MediaShelf**

**Search. Discover. Save.**

A responsive, accessible media discovery application built around Apple's iTunes Search API.

## Active architecture

MediaShelf V2 uses a three-route Next.js App Router architecture:

- `/` — Search
- `/results` — Results
- `/shelf` — Your Shelf
- `/api/search` — server-side search proxy

The previous one-page scroll-spy/hash-navigation architecture is obsolete and must not be restored.

## Technology

- Next.js App Router
- React
- TypeScript
- CSS Modules plus global design tokens
- local browser persistence
- Vercel-native deployment
- no account system
- no database
- no Express runtime
- no Create React App runtime

## Search

- search term input
- media-type controls
- All Countries default storefront context
- current Apple country/region storefront data
- region-grouped selector
- recent-search persistence
- preference persistence
- All Countries progressive search
- explicit Reset search control
- browser reload clears the current Search/Results session while preserving durable user data

## All Countries

Global search is intentionally progressive rather than a large simultaneous fan-out.

The implementation uses:

- controlled storefront sequencing
- caching
- deduplication
- progress reporting
- pause/resume support
- stale-run protection
- a retained-result limit

Actual Apple result provenance is stored separately from the user's search context so Shelf grouping remains truthful to how the item was discovered.

## Results

- artwork-led cards
- Grid/List views
- Relevance/Title/Artist sorting
- Load More
- source links
- Save/Saved state
- visible save feedback
- Apple storefront provenance
- collection creation and save-to-collection flow
- navigation to Your Shelf

## Your Shelf

- local persistence
- All Saved root view
- custom collections
- collection filtering
- add saved media to collections
- search-context grouping
- remove individual items
- bulk selection controls
- Delete selected
- Remove all with explicit confirmation
- stale collection references cleaned when saved media is removed

## Accessibility baseline

WCAG 2.2 AA is the release baseline.

Implemented work includes:

- route-correct skip links
- semantic route-level headings
- explicit labels and grouped controls
- keyboard-operable controls
- current-page navigation state
- live selected-count/save feedback
- visible focus treatment
- improved touch targets
- reduced-motion support
- non-colour-only state communication
- accessible destructive-control contrast

## Responsive baseline

The application remains usable without horizontal overflow across mobile, tablet and desktop layouts.

Release QA covered desktop and mobile route behaviour, navigation, results, Shelf interactions and production smoke testing.

## Source authority

The active implementation is the root-level Next.js application.

The nested legacy `node-express-itunes-api-search/` application is removed from the modern V2 source because the historical version remains preserved in Git history and the dedicated preservation material.

`useRouteNavigation.ts` is the active route-navigation helper.

## Release gates

Final release gates:

- TypeScript — PASS
- Production build — PASS
- Three-route runtime structure — PASS
- Route navigation — PASS
- Search reset — PASS
- Browser reload reset — PASS
- Global Scan sequencing and stale-run protection — PASS
- Results provenance — PASS
- Shelf grouping — PASS
- Shelf collections — PASS
- Shelf bulk controls — PASS
- Remove All confirmation — PASS
- Desktop QA — PASS
- Mobile QA — PASS
- Vercel Preview QA — PASS
- Release commit — PASS
- GitHub branch push — PASS
- Default branch promotion — PASS
- Production deployment — PASS
- Production route smoke test — PASS
- Live Apple API smoke test — PASS
- Post-deployment runtime error check — PASS
- README production link — PASS

**Remaining blocking release gates: none.**

## Historical note

The original project and earlier restoration work are not rewritten as though they were built with the current architecture. MediaShelf V2 is explicitly a modernised successor.
