# MediaShelf V2 — Current Release Brief

## Status

MediaShelf V2 is the active modernised version of the original 2020 Node/Express
iTunes Search portfolio project.

The historical implementation remains preserved in Git history and on the
dedicated preservation branch. This document describes the current V2 release
candidate only.

## Product

**MediaShelf**

**Search. Discover. Save.**

A responsive, accessible media discovery application built around Apple's
iTunes Search API.

## Active architecture

MediaShelf V2 uses a three-route Next.js App Router architecture:

- `/` — Search
- `/results` — Results
- `/shelf` — Your Shelf
- `/api/search` — server-side search proxy

The previous one-page scroll-spy/hash-navigation architecture is obsolete and
must not be restored.

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

## Brand authority

- Deep Navy `#0D1424`
- Indigo `#2C3E92`
- Violet `#6C5CE7`
- Coral `#FF6B4A`
- Green `#22C55E`
- Light Grey `#F1F5F9`
- Poppins SemiBold headings
- Inter interface/body copy
- Hugeicons interface iconography

For destructive controls, the current accessibility-approved treatment is
Coral `#FF6B4A` with Deep Navy `#0D1424` text.

## Search

- search term input
- media-type controls
- South Africa default storefront
- current Apple country/region storefront data
- region-grouped selector
- recent-search persistence
- preference persistence
- All Countries progressive search

## All Countries

Global search is intentionally progressive rather than a large simultaneous
fan-out.

The current implementation preserves pending scan state across navigation and
continues the scan on `/results`.

It uses:

- controlled storefront sequencing
- caching
- deduplication
- progress reporting
- pause/resume support
- a retained-result limit

## Results

- artwork-led cards
- Grid/List views
- Relevance/Title/Artist sorting
- Load More
- source links
- Save/Saved state
- visible save feedback
- navigation to Your Shelf

## Your Shelf

- local persistence
- custom collections
- collection filtering
- add saved media to collections
- remove individual items
- Select all
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
- improved checkbox hit targets
- reduced-motion support
- non-colour-only state communication
- accessible destructive-control contrast

## Responsive baseline

The application must remain usable without horizontal overflow across mobile,
tablet and desktop layouts.

The runtime QA currently verifies both desktop and mobile box-model/navigation
behaviour.

## Source authority

The active implementation is the root-level Next.js application.

The nested legacy `node-express-itunes-api-search/` application is removed from
the modern V2 branch because the historical version is already preserved in
Git history and the dedicated preservation branch.

Obsolete source such as `useScrollSpy.ts` must remain removed.

`useRouteNavigation.ts` is the active route-navigation helper.

## Release gates

Current verified gates:

- TypeScript — PASS
- ESLint — PASS
- Production build — PASS
- Three-route runtime structure — PASS
- Route navigation — PASS
- Shelf bulk controls — PASS
- Remove All confirmation — PASS
- All Countries route handoff — PASS
- Desktop box model — PASS
- Mobile box model — PASS
- Mobile navigation — PASS
- Runtime UI QA — PASS
- Preservation branch — PASS
- Incorrect upstream tracking — repaired

Remaining release gates:

- final source/document cleanup
- final Git diff/staging review
- release commit
- push V2 branch
- preview deployment
- preview verification
- production deployment
- live QA
- README live-link update

## Historical note

The original project and earlier restoration work are not rewritten as though
they were built with the current architecture. MediaShelf V2 is explicitly a
modernised successor.
