/* eslint-disable @next/next/no-img-element -- Apple artwork uses variable CDN URLs and explicit responsive sizing. */
'use client';

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowUp01Icon,
  CheckmarkCircle02Icon,
  FilterIcon,
  HeartIcon,
  HeartRemoveIcon,
  HistoryIcon,
  Menu03Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import {
  ALL_COUNTRIES,
  appleStorefronts,
  orderedGlobalStorefronts,
  storefrontGroups,
  storefrontLabel,
} from '@/lib/storefronts';
import {
  isMediaValue,
  mediaLabel,
  mediaTypes,
  type MediaValue,
} from '@/lib/media';
import {
  mergeUniqueResults,
  readCountryCache,
  searchCountry,
} from '@/lib/search-client';
import { appleArtwork } from '@/lib/itunes';
import {
  type RouteView,
  useRouteNavigation,
} from '@/hooks/useRouteNavigation';
import type {
  GlobalScanState,
  MediaItem,
  RecentSearch,
  SearchSnapshot,
  ShelfCollection,
} from '@/types/media';
import styles from './MediaShelfApp.module.css';

const FAVOURITES_KEY = 'mediashelf:v2:favourites';
const COLLECTIONS_KEY = 'mediashelf:v2:collections';
const RECENT_KEY = 'mediashelf:v2:recent';
const PREFS_KEY = 'mediashelf:v2:prefs';
const SNAPSHOT_KEY = 'mediashelf:v2:last-search';
const PENDING_GLOBAL_SEARCH_KEY = 'mediashelf:v2:pending-global-search';

const GLOBAL_REQUEST_INTERVAL_MS = 3_500;
const GLOBAL_RESULT_LIMIT = 800;
const GLOBAL_COUNTRY_RESULT_LIMIT = 25;
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;

function currentTimestamp() {
  return Date.now();
}

type SortMode = 'relevance' | 'title' | 'artist';
type ViewMode = 'grid' | 'list';

interface PendingGlobalSearch {
  term: string;
  media: MediaValue;
  timestamp: number;
}

interface StoredPrefs {
  term: string;
  media: MediaValue;
  storefront: string;
  sort: SortMode;
  view: ViewMode;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  const raw = storage.getItem(key);

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    storage.removeItem(key);
    return fallback;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatKind(kind: string) {
  return kind
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .toUpperCase();
}

export default function MediaShelfApp({
  routeView,
}: {
  routeView: RouteView;
}) {
  const { navigateTo } = useRouteNavigation();
  const activeSection = routeView;

  const [hydrated, setHydrated] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [media, setMedia] = useState<MediaValue>('all');
  const [storefront, setStorefront] = useState('za');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [sort, setSort] = useState<SortMode>('relevance');
  const [view, setView] = useState<ViewMode>('grid');
  const [visibleCount, setVisibleCount] = useState(16);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [favourites, setFavourites] = useState<MediaItem[]>([]);
  const [collections, setCollections] = useState<ShelfCollection[]>([]);
  const [activeCollection, setActiveCollection] = useState('all');
  const [shelfCountry, setShelfCountry] = useState('all');
  const [selectedShelfIds, setSelectedShelfIds] = useState<Set<string>>(
    () => new Set()
  );
  const [newCollectionName, setNewCollectionName] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [scan, setScan] = useState<GlobalScanState | null>(null);
  const [toast, setToast] = useState('');
  const [pendingGlobalSearch, setPendingGlobalSearch] =
    useState<PendingGlobalSearch | null>(null);
  const [confirmDialog, setConfirmDialog] =
    useState<ConfirmDialogState | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const scanCancelledRef = useRef(false);
  const lastNetworkRequestAtRef = useRef(0);
  const pendingGlobalStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      const prefs = readJson<StoredPrefs>(
        window.localStorage,
        PREFS_KEY,
        {
          term: '',
          media: 'all',
          storefront: 'za',
          sort: 'relevance',
          view: 'grid',
        }
      );

      const safeMedia = isMediaValue(prefs.media)
        ? prefs.media
        : 'all';

      const safeStorefront =
        prefs.storefront === ALL_COUNTRIES ||
        appleStorefronts.some(
          (item) => item.code === prefs.storefront
        )
          ? prefs.storefront
          : 'za';

      setTerm(prefs.term ?? '');
      setMedia(safeMedia);
      setStorefront(safeStorefront);
      setSort(
        ['relevance', 'title', 'artist'].includes(prefs.sort)
          ? prefs.sort
          : 'relevance'
      );
      setView(
        ['grid', 'list'].includes(prefs.view)
          ? prefs.view
          : 'grid'
      );
      setRecent(
        readJson<RecentSearch[]>(
          window.localStorage,
          RECENT_KEY,
          []
        )
      );
      setFavourites(
        readJson<MediaItem[]>(
          window.localStorage,
          FAVOURITES_KEY,
          []
        )
      );
      setCollections(
        readJson<ShelfCollection[]>(
          window.localStorage,
          COLLECTIONS_KEY,
          []
        )
      );

      const snapshot = readJson<SearchSnapshot | null>(
        window.sessionStorage,
        SNAPSHOT_KEY,
        null
      );

      if (
        snapshot &&
        snapshot.version === 2 &&
        Date.now() - snapshot.timestamp <= SNAPSHOT_TTL_MS &&
        isMediaValue(snapshot.media)
      ) {
        setTerm(snapshot.term);
        setMedia(snapshot.media);
        setStorefront(snapshot.storefront);
        setResults(snapshot.results);
        setScan(snapshot.scan);
      }

      const pending = readJson<PendingGlobalSearch | null>(
        window.sessionStorage,
        PENDING_GLOBAL_SEARCH_KEY,
        null
      );

      if (
        pending &&
        Date.now() - pending.timestamp <= SNAPSHOT_TTL_MS &&
        isMediaValue(pending.media) &&
        pending.term.trim()
      ) {
        setPendingGlobalSearch(pending);
      } else {
        window.sessionStorage.removeItem(PENDING_GLOBAL_SEARCH_KEY);
      }

      setHydrated(true);
    });

    return () => {
      cancelled = true;
      abortRef.current?.abort();

      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  function persistPrefs(next: Partial<StoredPrefs> = {}) {
    const value: StoredPrefs = {
      term,
      media,
      storefront,
      sort,
      view,
      ...next,
    };

    window.localStorage.setItem(PREFS_KEY, JSON.stringify(value));
  }

  function persistSnapshot(
    nextResults: MediaItem[],
    nextScan: GlobalScanState | null,
    nextCriteria = {
      term,
      media,
      storefront,
    }
  ) {
    const snapshot: SearchSnapshot = {
      version: 2,
      term: nextCriteria.term,
      media: nextCriteria.media,
      storefront: nextCriteria.storefront,
      results: nextResults,
      scan: nextScan,
      timestamp: currentTimestamp(),
    };

    try {
      window.sessionStorage.setItem(
        SNAPSHOT_KEY,
        JSON.stringify(snapshot)
      );
    } catch {
      const smaller: SearchSnapshot = {
        ...snapshot,
        results: snapshot.results.slice(0, 300),
      };

      try {
        window.sessionStorage.setItem(
          SNAPSHOT_KEY,
          JSON.stringify(smaller)
        );
      } catch {
        // The app remains functional even when browser storage is full.
      }
    }
  }

  function showToast(message: string) {
    setToast(message);

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setToast('');
      toastTimerRef.current = null;
    }, 3_800);
  }

  function confirmCurrentAction() {
    const action = confirmDialog?.onConfirm;
    setConfirmDialog(null);
    action?.();
  }

  function persistFavourites(items: MediaItem[]) {
    setFavourites(items);
    window.localStorage.setItem(
      FAVOURITES_KEY,
      JSON.stringify(items)
    );
  }

  function persistCollections(items: ShelfCollection[]) {
    setCollections(items);
    window.localStorage.setItem(
      COLLECTIONS_KEY,
      JSON.stringify(items)
    );
  }

  function recordRecent(search: RecentSearch) {
    const next = [
      search,
      ...recent.filter(
        (item) =>
          !(
            item.term.toLowerCase() === search.term.toLowerCase() &&
            item.media === search.media &&
            item.storefront === search.storefront
          )
      ),
    ].slice(0, 8);

    setRecent(next);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  async function runSpecificSearch({
    nextTerm = term,
    nextMedia = media,
    nextStorefront = storefront,
    shouldNavigate = true,
    shouldRecordRecent = true,
  }: {
    nextTerm?: string;
    nextMedia?: MediaValue;
    nextStorefront?: string;
    shouldNavigate?: boolean;
    shouldRecordRecent?: boolean;
  } = {}) {
    const cleaned = nextTerm.trim();

    if (!cleaned || nextStorefront === ALL_COUNTRIES) {
      return;
    }

    scanCancelledRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError('');
    setVisibleCount(16);
    setScan(null);
    setTerm(cleaned);
    setMedia(nextMedia);
    setStorefront(nextStorefront);

    persistPrefs({
      term: cleaned,
      media: nextMedia,
      storefront: nextStorefront,
    });

    try {
      const { response } = await searchCountry({
        term: cleaned,
        media: nextMedia,
        storefront: nextStorefront,
        signal: controller.signal,
        limit: 100,
      });

      setResults(response.results);
      persistSnapshot(response.results, null, {
        term: cleaned,
        media: nextMedia,
        storefront: nextStorefront,
      });

      if (shouldRecordRecent) {
        recordRecent({
          term: cleaned,
          media: nextMedia,
          storefront: nextStorefront,
        });
      }

      if (shouldNavigate) {
        navigateTo('results');
      }
    } catch (searchError) {
      if (controller.signal.aborted) {
        return;
      }

      setError(
        searchError instanceof Error
          ? searchError.message
          : 'Search failed.'
      );
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  }

  async function waitForGlobalRateSlot() {
    const elapsed =
      currentTimestamp() - lastNetworkRequestAtRef.current;

    if (elapsed < GLOBAL_REQUEST_INTERVAL_MS) {
      await sleep(GLOBAL_REQUEST_INTERVAL_MS - elapsed);
    }
  }

  async function runGlobalSearch({
    resume = false,
    shouldNavigate = true,
    nextTerm = term,
    nextMedia = media,
  }: {
    resume?: boolean;
    shouldNavigate?: boolean;
    nextTerm?: string;
    nextMedia?: MediaValue;
  } = {}) {
    const cleaned = nextTerm.trim();

    if (!cleaned) {
      return;
    }

    if (shouldNavigate && routeView !== 'results') {
      const pending: PendingGlobalSearch = {
        term: cleaned,
        media: nextMedia,
        timestamp: currentTimestamp(),
      };

      window.sessionStorage.setItem(
        PENDING_GLOBAL_SEARCH_KEY,
        JSON.stringify(pending)
      );

      setTerm(cleaned);
      setMedia(nextMedia);
      setStorefront(ALL_COUNTRIES);
      persistPrefs({
        term: cleaned,
        media: nextMedia,
        storefront: ALL_COUNTRIES,
      });
      navigateTo('results');
      return;
    }

    window.sessionStorage.removeItem(PENDING_GLOBAL_SEARCH_KEY);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    scanCancelledRef.current = false;

    const queue = orderedGlobalStorefronts('za');

    const canResume =
      resume &&
      scan &&
      !scan.complete &&
      results.length > 0 &&
      cleaned === term.trim() &&
      nextMedia === media &&
      storefront === ALL_COUNTRIES;

    const startingResults = canResume ? results : [];
    const completedCodes = new Set(
      canResume ? scan.completedCodes : []
    );

    setSearching(true);
    setError('');
    setVisibleCount(16);

    const initialScan: GlobalScanState = {
      completedCodes: Array.from(completedCodes),
      total: queue.length,
      complete: false,
      cancelled: false,
    };

    setScan(initialScan);
    setStorefront(ALL_COUNTRIES);

    setTerm(cleaned);
    setMedia(nextMedia);

    persistPrefs({
      term: cleaned,
      media: nextMedia,
      storefront: ALL_COUNTRIES,
    });

    if (!canResume) {
      setResults([]);
      recordRecent({
        term: cleaned,
        media: nextMedia,
        storefront: ALL_COUNTRIES,
      });
    }

    if (shouldNavigate) {
      navigateTo('results');
    }

    let merged = startingResults;

    for (const country of queue) {
      if (
        controller.signal.aborted ||
        scanCancelledRef.current
      ) {
        break;
      }

      if (completedCodes.has(country.code)) {
        continue;
      }

      const cached = readCountryCache(
        cleaned,
        nextMedia,
        country.code
      );

      if (!cached) {
        await waitForGlobalRateSlot();
      }

      try {
        const { response, fromCache } = await searchCountry({
          term: cleaned,
          media: nextMedia,
          storefront: country.code,
          signal: controller.signal,
          limit: GLOBAL_COUNTRY_RESULT_LIMIT,
        });

        if (!fromCache) {
          lastNetworkRequestAtRef.current = currentTimestamp();
        }

        merged = mergeUniqueResults(
          merged,
          response.results,
          GLOBAL_RESULT_LIMIT
        );

        completedCodes.add(country.code);

        const nextScan: GlobalScanState = {
          completedCodes: Array.from(completedCodes),
          total: queue.length,
          complete: completedCodes.size === queue.length,
          cancelled: false,
        };

        setResults(merged);
        setScan(nextScan);
        persistSnapshot(merged, nextScan, {
          term: cleaned,
          media: nextMedia,
          storefront: ALL_COUNTRIES,
        });
      } catch (searchError) {
        if (
          controller.signal.aborted ||
          scanCancelledRef.current
        ) {
          break;
        }

        setError(
          `${
            searchError instanceof Error
              ? searchError.message
              : 'Search paused.'
          } Resume the global scan when ready.`
        );
        break;
      }
    }

    const wasCancelled =
      controller.signal.aborted || scanCancelledRef.current;

    const finalScan: GlobalScanState = {
      completedCodes: Array.from(completedCodes),
      total: queue.length,
      complete:
        !wasCancelled && completedCodes.size === queue.length,
      cancelled: wasCancelled,
    };

    setScan(finalScan);
    persistSnapshot(merged, finalScan, {
      term: cleaned,
      media: nextMedia,
      storefront: ALL_COUNTRIES,
    });
    setSearching(false);
  }

  useEffect(() => {
    if (
      !hydrated ||
      routeView !== 'results' ||
      !pendingGlobalSearch ||
      pendingGlobalStartedRef.current
    ) {
      return;
    }

    pendingGlobalStartedRef.current = true;
    window.sessionStorage.removeItem(PENDING_GLOBAL_SEARCH_KEY);
    setPendingGlobalSearch(null);

    void runGlobalSearch({
      shouldNavigate: false,
      nextTerm: pendingGlobalSearch.term,
      nextMedia: pendingGlobalSearch.media,
    });
    // The persisted route handoff is intentionally consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, pendingGlobalSearch, routeView]);

  function cancelGlobalSearch() {
    scanCancelledRef.current = true;
    abortRef.current?.abort();

    setScan((current) =>
      current
        ? {
            ...current,
            cancelled: true,
          }
        : current
    );
    setSearching(false);
    showToast('Global scan paused');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (storefront === ALL_COUNTRIES) {
      void runGlobalSearch();
    } else {
      void runSpecificSearch();
    }
  }

  function handleTermChange(nextTerm: string) {
    setTerm(nextTerm);
    persistPrefs({ term: nextTerm });

    if (
      storefront === ALL_COUNTRIES &&
      (scan || results.length > 0)
    ) {
      scanCancelledRef.current = true;
      abortRef.current?.abort();
      setSearching(false);
      setResults([]);
      setScan(null);
      window.sessionStorage.removeItem(SNAPSHOT_KEY);
    }
  }

  function handleMediaChange(nextMedia: MediaValue) {
    setMedia(nextMedia);
    persistPrefs({ media: nextMedia });

    if (!term.trim()) {
      return;
    }

    if (storefront === ALL_COUNTRIES) {
      scanCancelledRef.current = true;
      abortRef.current?.abort();
      setSearching(false);
      setResults([]);
      setScan(null);
      window.sessionStorage.removeItem(SNAPSHOT_KEY);
      showToast('Media changed. Start a new global scan.');
      return;
    }

    void runSpecificSearch({
      nextMedia,
      shouldNavigate: false,
      shouldRecordRecent: false,
    });
  }

  function handleStorefrontChange(nextStorefront: string) {
    abortRef.current?.abort();
    setStorefront(nextStorefront);
    persistPrefs({ storefront: nextStorefront });

    if (!term.trim()) {
      return;
    }

    if (nextStorefront === ALL_COUNTRIES) {
      scanCancelledRef.current = true;
      setSearching(false);
      setResults([]);
      setScan(null);
      window.sessionStorage.removeItem(SNAPSHOT_KEY);
      return;
    }

    void runSpecificSearch({
      nextStorefront,
      shouldNavigate: false,
      shouldRecordRecent: false,
    });
  }

  function toggleFavourite(item: MediaItem) {
    const exists = favourites.some(
      (saved) => saved.id === item.id
    );

    if (exists) {
      persistFavourites(
        favourites.filter((saved) => saved.id !== item.id)
      );
      persistCollections(
        collections.map((collection) => ({
          ...collection,
          itemIds: collection.itemIds.filter(
            (id) => id !== item.id
          ),
        }))
      );
      showToast('Removed from Your Shelf');
      return;
    }

    persistFavourites([...favourites, item]);
    showToast('Saved to Your Shelf');
  }

  function toggleShelfSelection(itemId: string) {
    setSelectedShelfIds((current) => {
      const next = new Set(current);

      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }

      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedShelfIds((current) => {
      const next = new Set(current);

      if (allFilteredSelected) {
        for (const item of filteredShelf) {
          next.delete(item.id);
        }
      } else {
        for (const item of filteredShelf) {
          next.add(item.id);
        }
      }

      return next;
    });
  }

  function deleteSelectedShelfItems() {
    const ids = new Set(selectedShelfIds);

    if (!ids.size) {
      return;
    }

    setConfirmDialog({
      title: 'Delete selected items?',
      message: `This will remove ${ids.size} saved item${
        ids.size === 1 ? '' : 's'
      } from Your Shelf.`,
      confirmLabel: 'Delete selected',
      onConfirm: () => {
        persistFavourites(
          favourites.filter((item) => !ids.has(item.id))
        );

        persistCollections(
          collections.map((collection) => ({
            ...collection,
            itemIds: collection.itemIds.filter(
              (itemId) => !ids.has(itemId)
            ),
          }))
        );

        setSelectedShelfIds(new Set());
        showToast('Selected items removed');
      },
    });
  }

  function clearShelf() {
    if (!favourites.length) {
      return;
    }

    setConfirmDialog({
      title: 'Remove everything from Your Shelf?',
      message: `This will remove all ${favourites.length} saved item${
        favourites.length === 1 ? '' : 's'
      }. Your collection names will remain.`,
      confirmLabel: 'Remove all',
      onConfirm: () => {
        persistFavourites([]);
        setSelectedShelfIds(new Set());
        persistCollections(
          collections.map((collection) => ({
            ...collection,
            itemIds: [],
          }))
        );
        setActiveCollection('all');
        showToast('Your Shelf has been cleared');
      },
    });
  }

  function createCollection() {
    const name = newCollectionName.trim();

    if (!name) {
      return;
    }

    const collection: ShelfCollection = {
      id: crypto.randomUUID(),
      name,
      itemIds: [],
    };

    persistCollections([...collections, collection]);
    setNewCollectionName('');
    setActiveCollection(collection.id);
  }

  function deleteCollection() {
    if (activeCollection === 'all') {
      return;
    }

    const collection = collections.find(
      (item) => item.id === activeCollection
    );

    if (!collection) {
      return;
    }

    setConfirmDialog({
      title: 'Delete collection?',
      message: `Delete "${collection.name}"? Saved media will remain in Your Shelf.`,
      confirmLabel: 'Delete collection',
      onConfirm: () => {
        persistCollections(
          collections.filter(
            (item) => item.id !== activeCollection
          )
        );
        setActiveCollection('all');
      },
    });
  }

  function addToCollection(itemId: string, collectionId: string) {
    if (!collectionId) {
      return;
    }

    persistCollections(
      collections.map((collection) =>
        collection.id === collectionId
          ? {
              ...collection,
              itemIds: Array.from(
                new Set([...collection.itemIds, itemId])
              ),
            }
          : collection
      )
    );
    showToast('Added to collection');
  }

  function removeFromActiveCollection(itemId: string) {
    if (activeCollection === 'all') {
      return;
    }

    persistCollections(
      collections.map((collection) =>
        collection.id === activeCollection
          ? {
              ...collection,
              itemIds: collection.itemIds.filter(
                (id) => id !== itemId
              ),
            }
          : collection
      )
    );
  }

  function runRecent(search: RecentSearch) {
    setTerm(search.term);
    setMedia(search.media);
    setStorefront(search.storefront);

    if (search.storefront === ALL_COUNTRIES) {
      window.setTimeout(() => {
        void runGlobalSearch({
          nextTerm: search.term,
          nextMedia: search.media,
        });
      }, 0);
    } else {
      window.setTimeout(() => {
        void runSpecificSearch({
          nextTerm: search.term,
          nextMedia: search.media,
          nextStorefront: search.storefront,
        });
      }, 0);
    }
  }

  const sortedResults =
    sort === 'relevance'
      ? results
      : [...results].sort((a, b) =>
          sort === 'title'
            ? a.title.localeCompare(b.title)
            : a.artist.localeCompare(b.artist)
        );

  const visibleResults = sortedResults.slice(0, visibleCount);

  const filteredShelf = (() => {
    let items = favourites;

    if (activeCollection !== 'all') {
      const collection = collections.find(
        (item) => item.id === activeCollection
      );

      if (collection) {
        const allowed = new Set(collection.itemIds);
        items = items.filter((item) => allowed.has(item.id));
      }
    }

    if (shelfCountry !== 'all') {
      items = items.filter(
        (item) => item.storefront === shelfCountry
      );
    }

    return items;
  })();

  const shelfCountries = Array.from(
    new Set(
      favourites
        .map((item) => item.storefront)
        .filter(Boolean)
    )
  ).sort((a, b) =>
    storefrontLabel(a).localeCompare(storefrontLabel(b))
  );

  const allFilteredSelected =
    filteredShelf.length > 0 &&
    filteredShelf.every((item) =>
      selectedShelfIds.has(item.id)
    );

  const groupedShelf = (() => {
    const groups = new Map<string, MediaItem[]>();

    for (const item of filteredShelf) {
      const key = item.storefront || 'unknown';
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }

    return Array.from(groups.entries()).sort(([a], [b]) =>
      storefrontLabel(a).localeCompare(storefrontLabel(b))
    );
  })();

  const activeCollectionName =
    activeCollection === 'all'
      ? 'All Saved'
      : collections.find((item) => item.id === activeCollection)
          ?.name ?? 'Collection';

  const progress =
    scan && scan.total
      ? Math.round(
          (scan.completedCodes.length / scan.total) * 100
        )
      : 0;

  const navItems: Array<{
    id: RouteView;
    label: string;
  }> = [
    { id: 'search', label: 'Search' },
    { id: 'results', label: 'Results' },
    { id: 'saved', label: 'Your Shelf' },
  ];

  return (
    <div className={styles.app}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>

      <header
        className={styles.header}
        data-site-header
      >
        <div className={styles.headerInner}>
          <button
            type="button"
            className={styles.brand}
            onClick={() => navigateTo('search')}
            aria-label="MediaShelf home"
          >
            <img
              src="/brand/mediashelf-mark.svg"
              alt=""
              width="40"
              height="40"
            />
            <span>
              <strong>MediaShelf</strong>
              <small>Search. Discover. Save.</small>
            </span>
          </button>

          <nav
            className={styles.desktopNav}
            aria-label="Primary navigation"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                data-section-link
                className={
                  activeSection === item.id
                    ? styles.activeNav
                    : ''
                }
                aria-current={
                  activeSection === item.id
                    ? 'page'
                    : undefined
                }
                onClick={() => navigateTo(item.id)}
              >
                {item.label}
                {item.id === 'saved' &&
                  favourites.length > 0 && (
                    <span className={styles.navCount}>
                      {favourites.length}
                    </span>
                  )}
              </button>
            ))}
          </nav>

          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={
              menuOpen ? 'Close navigation' : 'Open navigation'
            }
            onClick={() => setMenuOpen((open) => !open)}
          >
            <HugeiconsIcon
              icon={Menu03Icon}
              size={22}
              aria-hidden="true"
            />
          </button>
        </div>

        {menuOpen && (
          <nav
            id="mobile-navigation"
            className={styles.mobileNav}
            aria-label="Mobile navigation"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  activeSection === item.id
                    ? styles.activeNav
                    : ''
                }
                aria-current={
                  activeSection === item.id
                    ? 'page'
                    : undefined
                }
                onClick={() => {
                  setMenuOpen(false);
                  navigateTo(item.id);
                }}
              >
                <span>{item.label}</span>
                {item.id === 'saved' &&
                  favourites.length > 0 && (
                    <span className={styles.navCount}>
                      {favourites.length}
                    </span>
                  )}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main id="main-content" tabIndex={-1}>
        {routeView === 'search' && (
<section id="search"
          className={`${styles.section} ${styles.searchSection}`}
          aria-labelledby="search-title"
        >
          <div className={styles.sectionInner}>
            <div className={styles.hero}>
              <p className={styles.eyebrow}>Media discovery</p>
              <h1 id="search-title">
                Find something worth keeping.
              </h1>
              <p className={styles.heroCopy}>
                Search music, films, podcasts, audiobooks and
                more across the Apple iTunes catalogue.
              </p>
            </div>

            <form
              className={styles.searchPanel}
              onSubmit={handleSubmit}
            >
              <label className={styles.field}>
                <span>Search</span>
                <span className={styles.inputWrap}>
                  <HugeiconsIcon
                    icon={Search01Icon}
                    size={18}
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={term}
                    placeholder="Search music, films, podcasts..."
                    autoComplete="off"
                    autoCapitalize="words"
                    maxLength={200}
                    onChange={(event) =>
                      handleTermChange(event.target.value)
                    }
                  />
                </span>
              </label>

              <label className={styles.field}>
                <span>Media type</span>
                <select
                  value={media}
                  onChange={(event) =>
                    handleMediaChange(
                      event.target.value as MediaValue
                    )
                  }
                >
                  {mediaTypes.map((item) => (
                    <option
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Storefront</span>
                <select
                  value={storefront}
                  onChange={(event) =>
                    handleStorefrontChange(
                      event.target.value
                    )
                  }
                >
                  <option value={ALL_COUNTRIES}>
                    All Countries
                  </option>
                  {storefrontGroups.map((group) => (
                    <optgroup
                      key={group.region}
                      label={group.region}
                    >
                      {group.items.map((item) => (
                        <option
                          key={item.code}
                          value={item.code}
                        >
                          {item.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <button
                className={styles.searchButton}
                type="submit"
                disabled={searching || !term.trim()}
              >
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={20}
                  aria-hidden="true"
                />
                {storefront === ALL_COUNTRIES
                  ? scan &&
                    !scan.complete &&
                    scan.completedCodes.length > 0
                    ? 'Restart global scan'
                    : 'Search all countries'
                  : searching
                    ? 'Searching...'
                    : 'Search'}
              </button>
            </form>

            {storefront === ALL_COUNTRIES && (
              <p className={styles.globalNote}>
                Full Apple-storefront scan. Requests are
                deliberately rate-limited because Apple documents
                an approximate 20-call-per-minute Search API
                limit. A complete scan can take several minutes.
              </p>
            )}

            <div className={styles.browseRow}>
              <span className={styles.browseLabel}>
                <HugeiconsIcon
                  icon={FilterIcon}
                  size={16}
                  aria-hidden="true"
                />
                Browse by media
              </span>
              <div className={styles.chips} role="group" aria-label="Browse by media">
                {mediaTypes.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={
                      media === item.value
                        ? styles.activeChip
                        : ''
                    }
                    aria-pressed={media === item.value}
                    onClick={() =>
                      handleMediaChange(item.value)
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {recent.length > 0 && (
              <aside
                className={styles.recentBlock}
                aria-labelledby="recent-searches-title"
              >
                <div className={styles.recentHeading}>
                  <span id="recent-searches-title">
                    <span className={styles.recentHeadingIcon}>
                      <HugeiconsIcon
                        icon={HistoryIcon}
                        size={17}
                        aria-hidden="true"
                      />
                    </span>
                    Recent searches
                  </span>
                  <small>Choose a highlighted search to run it again</small>
                </div>
                <div className={styles.recentList}>
                  {recent.map((item) => (
                    <button
                      key={`${item.term}-${item.media}-${item.storefront}`}
                      type="button"
                      onClick={() => runRecent(item)}
                    >
                      <strong>{item.term}</strong>
                      <span className={styles.recentMeta}>
                        <span data-media={item.media}>
                          {mediaLabel(item.media)}
                        </span>
                        <span>
                          {storefrontLabel(item.storefront)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
            )}
          </div>
        </section>
)}

        {routeView === 'results' && (
<section id="results"
          className={`${styles.section} ${styles.resultsSection}`}
          aria-labelledby="results-title"
        >
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Discover</p>
                <h1 id="results-title">Results</h1>
                <p className={styles.sectionMeta}>
                  {results.length} result
                  {results.length === 1 ? '' : 's'} ·{' '}
                  {mediaLabel(media)} ·{' '}
                  {storefrontLabel(storefront)}
                </p>
              </div>

              <div className={styles.toolbar}>
                <label>
                  <span className={styles.srOnly}>
                    Sort results
                  </span>
                  <select
                    value={sort}
                    onChange={(event) => {
                      const next =
                        event.target.value as SortMode;
                      setSort(next);
                      persistPrefs({ sort: next });
                    }}
                  >
                    <option value="relevance">
                      Relevance
                    </option>
                    <option value="title">Title</option>
                    <option value="artist">Artist</option>
                  </select>
                </label>

                <div
                  className={styles.viewToggle}
                  role="group"
                  aria-label="Result view"
                >
                  <button
                    type="button"
                    aria-pressed={view === 'grid'}
                    className={
                      view === 'grid'
                        ? styles.activeView
                        : ''
                    }
                    onClick={() => {
                      setView('grid');
                      persistPrefs({ view: 'grid' });
                    }}
                  >
                    Grid
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === 'list'}
                    className={
                      view === 'list'
                        ? styles.activeView
                        : ''
                    }
                    onClick={() => {
                      setView('list');
                      persistPrefs({ view: 'list' });
                    }}
                  >
                    List
                  </button>
                </div>
              </div>
            </div>

            {scan && (
              <div className={styles.scanPanel}>
                <div className={styles.scanHeader}>
                  <div>
                    <strong>All Countries</strong>
                    <span>
                      {scan.completedCodes.length} of {scan.total}{' '}
                      Apple storefronts scanned · {results.length}{' '}
                      unique results retained
                    </span>
                  </div>
                  <div className={styles.scanActions}>
                    {searching ? (
                      <button
                        type="button"
                        onClick={cancelGlobalSearch}
                      >
                        Pause
                      </button>
                    ) : !scan.complete ? (
                      <button
                        type="button"
                        onClick={() =>
                          void runGlobalSearch({
                            resume: true,
                            shouldNavigate: false,
                          })
                        }
                      >
                        Resume
                      </button>
                    ) : (
                      <span className={styles.completeBadge}>
                        Complete
                      </span>
                    )}
                  </div>
                </div>
                <progress
                  value={progress}
                  max={100}
                  aria-label="Global search progress"
                />
                <small>
                  Rate-safe progressive search. Up to{' '}
                  {GLOBAL_RESULT_LIMIT} unique results are retained
                  in the browser session.
                </small>
              </div>
            )}

            {error && (
              <div className={styles.errorNotice} role="alert">
                {error}
              </div>
            )}

            {!hydrated ? (
              <div className={styles.emptyState}>
                <strong>Loading MediaShelf...</strong>
              </div>
            ) : searching && results.length === 0 ? (
              <div className={styles.emptyState}>
                <strong>Searching...</strong>
                <span>
                  MediaShelf is checking the selected Apple
                  storefront.
                </span>
              </div>
            ) : results.length === 0 ? (
              <div className={styles.emptyState}>
                <strong>Your results will appear here.</strong>
                <span>
                  Start with a title, artist, film, show or podcast.
                </span>
              </div>
            ) : (
              <>
                {toast &&
                  (toast === 'Saved to Your Shelf' ||
                    toast === 'Removed from Your Shelf') && (
                    <div
                      className={`${styles.resultsFeedback} ${
                        toast === 'Saved to Your Shelf'
                          ? styles.resultsFeedbackSaved
                          : styles.resultsFeedbackRemoved
                      }`}
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      <span className={styles.resultsFeedbackIcon}>
                        <HugeiconsIcon
                          icon={
                            toast === 'Saved to Your Shelf'
                              ? CheckmarkCircle02Icon
                              : HeartRemoveIcon
                          }
                          size={19}
                          aria-hidden="true"
                        />
                      </span>
                      <span>
                        <strong>{toast}</strong>
                        <small>
                          {toast === 'Saved to Your Shelf'
                            ? 'It is ready in Your Shelf.'
                            : 'The item is no longer saved.'}
                        </small>
                      </span>
                      {toast === 'Saved to Your Shelf' && (
                        <button
                          type="button"
                          onClick={() => navigateTo('saved')}
                        >
                          View shelf
                        </button>
                      )}
                    </div>
                  )}

                <div
                  className={
                    view === 'grid'
                      ? styles.resultGrid
                      : styles.resultList
                  }
                >
                  {visibleResults.map((item) => {
                    const saved = favourites.some(
                      (entry) => entry.id === item.id
                    );

                    return (
                      <article
                        className={styles.resultCard}
                        key={item.id}
                      >
                        <div className={styles.artworkWrap}>
                          {item.artworkUrl ? (
                            <img
                              src={appleArtwork(
                                item.artworkUrl,
                                600
                              )}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className={styles.artworkFallback}
                              aria-hidden="true"
                            >
                              MediaShelf
                            </div>
                          )}
                        </div>

                        <div className={styles.cardBody}>
                          <span
                            className={styles.kind}
                            data-kind={item.kind}
                          >
                            {formatKind(item.kind)}
                          </span>
                          <h3>{item.title}</h3>
                          <p>{item.artist}</p>
                          {item.genre && (
                            <small>{item.genre}</small>
                          )}

                          <div className={styles.cardActions}>
                            <button
                              type="button"
                              className={
                                saved
                                  ? styles.savedButton
                                  : ''
                              }
                              aria-pressed={saved}
                              onClick={() =>
                                toggleFavourite(item)
                              }
                            >
                              <HugeiconsIcon
                                icon={
                                  saved
                                    ? CheckmarkCircle02Icon
                                    : HeartIcon
                                }
                                size={18}
                                aria-hidden="true"
                              />
                              {saved ? 'Saved' : 'Save'}
                            </button>

                            {item.sourceUrl && (
                              <a
                                href={item.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View source
                              </a>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {visibleCount < sortedResults.length && (
                  <div className={styles.loadMoreWrap}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() =>
                        setVisibleCount((count) => count + 16)
                      }
                    >
                      Load more
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
)}

        {routeView === 'saved' && (
<section id="saved"
          className={`${styles.section} ${styles.savedSection}`}
          aria-labelledby="saved-title"
        >
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>
                  Your collection
                </p>
                <h1 id="saved-title">Your Shelf</h1>
              </div>

              <div className={styles.shelfSummary}>
                <span>
                  {favourites.length} saved
                </span>
                {favourites.length > 0 && (
                  <button
                    type="button"
                    className={styles.clearButton}
                    data-remove-all
                    onClick={clearShelf}
                  >
                    Remove all
                  </button>
                )}
              </div>
            </div>

            <div
              className={styles.collectionTabs}
              role="group"
              aria-label="Shelf collections"
            >
              <button
                type="button"
                className={
                  activeCollection === 'all'
                    ? styles.activeCollection
                    : ''
                }
                aria-pressed={activeCollection === 'all'}
                onClick={() => setActiveCollection('all')}
              >
                All Saved
              </button>
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  className={
                    activeCollection === collection.id
                      ? styles.activeCollection
                      : ''
                  }
                  aria-pressed={activeCollection === collection.id}
                  onClick={() =>
                    setActiveCollection(collection.id)
                  }
                >
                  {collection.name}
                </button>
              ))}
            </div>

            <div className={styles.collectionTools}>
              <label
                className={styles.srOnly}
                htmlFor="new-collection-name"
              >
                New collection name
              </label>
              <input
                id="new-collection-name"
                value={newCollectionName}
                placeholder="New collection"
                maxLength={60}
                onChange={(event) =>
                  setNewCollectionName(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    createCollection();
                  }
                }}
              />
              <button
                type="button"
                onClick={createCollection}
                disabled={!newCollectionName.trim()}
              >
                Create collection
              </button>
              {activeCollection !== 'all' && (
                <button
                  type="button"
                  className={styles.deleteCollection}
                  onClick={deleteCollection}
                >
                  Delete collection
                </button>
              )}
            </div>

            <div className={styles.shelfBulkBar}>
              <label className={styles.shelfFilter}>
                <span>Filter country</span>
                <select
                  value={shelfCountry}
                  onChange={(event) => {
                    setShelfCountry(event.target.value);
                    setSelectedShelfIds(new Set());
                  }}
                >
                  <option value="all">All countries</option>
                  {shelfCountries.map((code) => (
                    <option key={code} value={code}>
                      {storefrontLabel(code)}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className={styles.selectAllButton}
                disabled={filteredShelf.length === 0}
                onClick={toggleSelectAllFiltered}
              >
                {allFilteredSelected
                  ? 'Deselect all'
                  : 'Select all'}
              </button>

              <span
                className={styles.selectionCount}
                aria-live="polite"
                aria-atomic="true"
              >
                {selectedShelfIds.size} selected
              </span>

              <button
                type="button"
                className={styles.deleteSelectedButton}
                disabled={selectedShelfIds.size === 0}
                onClick={deleteSelectedShelfItems}
              >
                Delete selected
              </button>
            </div>

            <div className={styles.shelfContext}>
              <strong>{activeCollectionName}</strong>
              <span>
                {filteredShelf.length} item
                {filteredShelf.length === 1 ? '' : 's'}
              </span>
            </div>

            {filteredShelf.length === 0 ? (
              <div className={styles.emptyShelf}>
                <HugeiconsIcon
                  icon={HeartIcon}
                  size={28}
                  aria-hidden="true"
                />
                <strong>Nothing saved here yet.</strong>
                <span>
                  Save media from the Results page, then organise
                  it into collections.
                </span>
              </div>
            ) : (
              <div className={styles.shelfGroups}>
                {groupedShelf.map(([code, items]) => (
                  <section
                    key={code}
                    className={styles.countryGroup}
                    aria-label={storefrontLabel(code)}
                  >
                    <div className={styles.countryHeader}>
                      <div>
                        <span
                          className={styles.countryDot}
                          aria-hidden="true"
                        />
                        <strong>
                          {storefrontLabel(code)}
                        </strong>
                        <small>{code.toUpperCase()}</small>
                      </div>
                      <span>
                        {items.length} saved
                      </span>
                    </div>

                    <div>
                      {items.map((item) => (
                        <article
                          key={item.id}
                          className={styles.shelfItem}
                          data-selected={selectedShelfIds.has(item.id)}
                        >
                          <label className={styles.shelfCheck}>
                            <input
                              type="checkbox"
                              checked={selectedShelfIds.has(item.id)}
                              onChange={() =>
                                toggleShelfSelection(item.id)
                              }
                            />
                            <span className={styles.srOnly}>
                              Select {item.title}
                            </span>
                          </label>

                          {item.artworkUrl ? (
                            <img
                              src={appleArtwork(
                                item.artworkUrl,
                                300
                              )}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className={styles.shelfThumbFallback}
                              aria-hidden="true"
                            />
                          )}

                          <div className={styles.shelfItemCopy}>
                            <strong>{item.title}</strong>
                            <span>{item.artist}</span>
                            <small>
                              {formatKind(item.kind)}
                            </small>
                          </div>

                          <div className={styles.shelfItemControls}>
                            {collections.length > 0 && (
                              <select
                                defaultValue=""
                                aria-label={`Add ${item.title} to collection`}
                                onChange={(event) => {
                                  addToCollection(
                                    item.id,
                                    event.target.value
                                  );
                                  event.target.value = '';
                                }}
                              >
                                <option value="">
                                  Add to collection
                                </option>
                                {collections.map(
                                  (collection) => (
                                    <option
                                      key={collection.id}
                                      value={collection.id}
                                    >
                                      {collection.name}
                                    </option>
                                  )
                                )}
                              </select>
                            )}

                            {item.sourceUrl && (
                              <a
                                href={item.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View
                              </a>
                            )}

                            {activeCollection !== 'all' && (
                              <button
                                type="button"
                                onClick={() =>
                                  removeFromActiveCollection(
                                    item.id
                                  )
                                }
                              >
                                Remove from collection
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                toggleFavourite(item)
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </section>
)}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <button
            type="button"
            className={styles.footerBrand}
            onClick={() => navigateTo('search')}
          >
            <img
              src="/brand/mediashelf-mark.svg"
              alt=""
              width="30"
              height="30"
            />
            <span>MediaShelf</span>
          </button>
          <span>Built by Chameleon Unicode Studios</span>
        </div>
      </footer>

      {confirmDialog && (
        <div className={styles.confirmOverlay}>
          <div
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mediashelf-confirm-title"
            aria-describedby="mediashelf-confirm-message"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setConfirmDialog(null);
              }
            }}
          >
            <span className={styles.confirmEyebrow}>Please confirm</span>
            <h2 id="mediashelf-confirm-title">
              {confirmDialog.title}
            </h2>
            <p id="mediashelf-confirm-message">
              {confirmDialog.message}
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancelButton}
                autoFocus
                onClick={() => setConfirmDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDangerButton}
                data-confirm-action
                onClick={confirmCurrentAction}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast &&
        !(
          routeView === 'results' &&
          (toast === 'Saved to Your Shelf' ||
            toast === 'Removed from Your Shelf')
        ) && (
          <div
            className={styles.toast}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <HugeiconsIcon
              icon={
                toast.includes('Saved') ||
                toast.includes('Added')
                  ? CheckmarkCircle02Icon
                  : HeartIcon
              }
              size={20}
              aria-hidden="true"
            />
            <span>{toast}</span>
            {toast.includes('Saved') && (
              <button
                type="button"
                onClick={() => navigateTo('saved')}
              >
                View shelf
              </button>
            )}
          </div>
        )}

      <button
        type="button"
        className={styles.backTop}
        aria-label="Back to top"
        title="Back to top"
        onClick={() =>
          window.scrollTo({ top: 0, behavior: 'auto' })
        }
      >
        <HugeiconsIcon
          icon={ArrowUp01Icon}
          size={20}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
