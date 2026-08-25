# MediaShelf V2 — Clean Rebuild Brief

## Status

This build replaces the patch-on-patch V1 implementation path with a clean,
parallel V2 worktree. The existing MediaShelf-modernisation working directory
is preserved and is not overwritten.

## Product

**MediaShelf**

**Search. Discover. Save.**

A modernised evolution of the 2020 Node/Express iTunes Search application,
preserving the original Search → Results → Favourites idea while rebuilding
the product as an accessible, mobile-first 2026 application.

## Locked product requirements

### Identity
- Canonical layered media-card mark with coral play tile.
- Deep Navy `#0D1424`
- Indigo `#2C2E92`
- Violet `#6C5CE7`
- Coral `#FF6B4A`
- Green `#22C55E` only for appropriate positive/success use.
- Light Grey `#F1F5F9`
- Poppins SemiBold headings.
- Inter interface/body copy.
- Hugeicons for interface iconography.

### Architecture
- Next.js App Router.
- TypeScript.
- React.
- CSS Modules + global design tokens.
- Local browser persistence only.
- Vercel-native deployment.
- No accounts, database, server-writable favourites JSON, Express runtime or CRA.

### One-page information architecture
- Sticky MediaShelf header.
- Search.
- Results.
- Your Shelf.
- IDs are attached to the complete major section wrappers, not inner cards.
- Smooth section navigation.
- React scroll spy based on actual section positions.
- Active header state and `aria-current`.
- URL hash follows the active section without causing browser jumps.
- CSS `scroll-snap-type: y proximity`.
- Each main section uses `scroll-snap-align: start`.
- Search and Results remain natural height.
- Only the final Shelf section receives viewport-height assistance.

### Search
- Search term.
- Media dropdown.
- Media chips.
- Full current Apple country/region availability list.
- Apple list generated from the current Apple Support availability page.
- South Africa default.
- Region-grouped selector.
- All Countries mode.
- Specific-country changes rerun an existing search automatically.
- All Countries does not silently fan out hundreds of simultaneous requests.

### All Countries
Apple documents the iTunes Search API as country/storefront specific and
approximately limited to 20 calls per minute.

V2 therefore uses:
- one storefront at a time,
- 3.5 second spacing between uncached global requests,
- browser-session country cache,
- server-side Next fetch caching,
- progressive results,
- deduplication,
- pause/resume,
- progress reporting,
- a maximum retained result set to keep browser storage safe.

A full scan is truthful but can take several minutes.

### Search persistence
- Preferences persist locally.
- Recent searches persist locally.
- Last result set persists for the current browser session.
- Refresh restores the active search/results rather than blanking the page.
- Global scan progress can be resumed after refresh while the session snapshot is fresh.

### Results
- Artwork-led cards.
- High-resolution Apple artwork variants.
- Subtle shadows, not heavy gloss.
- Grid/List toggle.
- Relevance/Title/Artist sort.
- Load More.
- Source link.
- Save/Saved toggle.
- Visible mobile save confirmation.
- View Shelf action.
- Saved count in desktop/mobile navigation.

### Your Shelf
- Local persistence.
- Artwork thumbnails.
- Grouping by storefront/country.
- Custom collections.
- Add saved items to collections.
- Collection filtering.
- Delete collection.
- Remove item.
- Clear Shelf with confirmation.
- Clearing the shelf also removes stale collection item references.

### Mobile
- Search-first stack.
- No horizontal overflow.
- Neutral/dark mobile navigation control.
- Saved count visible in mobile navigation.
- Save feedback remains visible.
- No rejected green menu/back-to-top branding controls.

### Accessibility
- WCAG 2.2 AA baseline.
- Skip link.
- Semantic headings and sections.
- Explicit labels.
- Keyboard-operable controls.
- `aria-current` for scroll spy navigation.
- `aria-live` save feedback.
- Visible focus.
- Reduced-motion support.
- No colour-only state communication.

### Cleanup and safety
- Historical branch remains preserved.
- V1 working tree is archived before V2 starts.
- V2 is created in a separate Git worktree and branch.
- No commit, push, merge, default-branch change or deployment.
- No blind `npm audit fix --force`.

## Known V1 failures deliberately removed from V2
- repeated patch scripts modifying already-modified CSS;
- forced viewport heights on Search and Results;
- anchor IDs landing on partial/inner content;
- browser hash restoration fighting scripted scrolling;
- IntersectionObserver state fighting hash navigation;
- generic 243-country ISO list presented as Apple availability;
- global search starting a huge uncontrolled storefront loop;
- scroll spy implemented by direct DOM mutation instead of React state;
- missing helper exports after storefront file replacement;
- duplicate generated Next type files;
- old favicon/default icon collisions;
- workspace-root warning;
- invisible mobile save confirmation;
- no in-app clear-shelf control;
- low-resolution artwork;
- writable legacy favourites architecture.

## Release boundary

V2 remains a candidate until:
- TypeScript PASS
- ESLint PASS
- Production build PASS
- Runtime navigation QA PASS
- Real Apple API smoke PASS
- Responsive QA PASS
- Accessibility QA PASS
- Source cleanup PASS
- README PASS
- Git safety PASS
- Preview deployment PASS
- Live QA PASS
