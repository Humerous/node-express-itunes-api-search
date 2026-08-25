# MediaShelf

**Search. Discover. Save.**

MediaShelf is a modern rebuild of a 2020 Node/Express iTunes Search portfolio
application. It preserves the original Search → Results → Favourites concept
while rebuilding the product with a 2026 Next.js/TypeScript architecture,
responsive design, local collections and controlled Apple storefront search.

## Development

```bash
npm install
npm run storefronts:update
npm run typecheck
npm run lint
npm run build
npm run dev
```

## Data source

Search results come from Apple's iTunes Search API.

Country/region availability is generated from Apple's current media-services
availability support page rather than assuming every ISO country is a valid
media storefront.

## Global search

Apple's Search API is storefront-specific and approximately limited to
20 calls per minute. MediaShelf's All Countries mode is therefore progressive,
cached, deduplicated, pausable and deliberately rate-limited.

## Persistence

Local browser storage is used for:
- saved media,
- custom collections,
- recent searches,
- preferences.

Browser session storage is used for:
- current results,
- progressive global-scan state,
- short-lived per-country search cache.

No account or database is required.

## Portfolio framing

A legacy Node/Express media-search application modernised into a responsive,
accessible product while preserving its original Search → Results → Favourites
workflow.

Built by Chameleon Unicode Studios.
