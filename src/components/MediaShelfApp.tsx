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
const OPEN_COLLECTION_KEY = 'mediashelf:v2:open-collection';
const COLLECTION_NAME_MAX_LENGTH = 60;
const THEME_DISCOVERY_KEY = 'mediashelf:v2:theme-discovery';

const GLOBAL_REQUEST_INTERVAL_MS = 3_500;
const GLOBAL_RESULT_LIMIT = 800;
const GLOBAL_COUNTRY_RESULT_LIMIT = 25;
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const MAX_SHARED_COLLECTION_ITEMS = 24;
const QUICK_DISCOVERY_MAX_STOREFRONTS = 6;
const QUICK_DISCOVERY_RESULT_TARGET = 20;
let quickDiscoveryLastNetworkRequestAt = 0;

// HOME DISCOVERY COLLECTIONS / INLINE EMAIL
const HOME_COLLECTION_POOL: Array<{
  id: string;
  title: string;
  description: string;
  term: string;
  media: MediaValue;
}> = [
  {
    id: 'feel-good',
    title: 'Feel Good',
    description: 'Bright, upbeat picks for an easy listen.',
    term: 'feel good',
    media: 'music',
  },
  {
    id: 'throwbacks',
    title: 'Throwbacks',
    description: 'Older favourites and familiar classics.',
    term: 'classic hits',
    media: 'music',
  },
  {
    id: 'film-night',
    title: 'Film Night',
    description: 'A random film direction for tonight.',
    term: 'adventure',
    media: 'movie',
  },
  {
    id: 'podcast-rabbit-hole',
    title: 'Podcast Rabbit Hole',
    description: 'Something interesting to keep listening to.',
    term: 'stories',
    media: 'podcast',
  },
  {
    id: 'deep-focus',
    title: 'Deep Focus',
    description: 'Low-distraction music for getting things done.',
    term: 'focus',
    media: 'music',
  },
  {
    id: 'story-time',
    title: 'Story Time',
    description: 'Audiobooks worth disappearing into.',
    term: 'fiction',
    media: 'audiobook',
  },
  {
    id: 'road-trip',
    title: 'Road Trip',
    description: 'Music for a long drive and no fixed plan.',
    term: 'road trip',
    media: 'music',
  },
  {
    id: 'late-night',
    title: 'Late Night',
    description: 'A slower collection for after dark.',
    term: 'late night',
    media: 'music',
  },
  {
    id: 'documentary-mood',
    title: 'Documentary Mood',
    description: 'Films when you want something real.',
    term: 'documentary',
    media: 'movie',
  },
  {
    id: 'podcast-learn',
    title: 'Learn Something',
    description: 'Podcasts for curiosity and useful detours.',
    term: 'science',
    media: 'podcast',
  },
  {
    id: 'acoustic-morning',
    title: 'Acoustic Morning',
    description: 'A softer start to the day.',
    term: 'acoustic',
    media: 'music',
  },
  {
    id: 'hidden-gems',
    title: 'Hidden Gems',
    description: 'Take a less obvious route through the catalogue.',
    term: 'independent',
    media: 'music',
  },
];



function currentTimestamp() {
  return Date.now();
}

const GLOBAL_SHELF_CONTEXT = 'global';

function shelfSearchLabel(code: string) {
  return code === GLOBAL_SHELF_CONTEXT
    ? 'All Countries'
    : storefrontLabel(code);
}

function appleStorefrontMeta(item: MediaItem) {
  const code =
    item.sourceStorefront ??
    (item.storefront !== GLOBAL_SHELF_CONTEXT ? item.storefront : '');

  return code
    ? `Apple storefront — ${storefrontLabel(code)} (${code.toUpperCase()})`
    : '';
}

type SortMode = 'relevance' | 'title' | 'artist';
type ViewMode = 'grid' | 'list';

interface PendingGlobalSearch {
  term: string;
  media: MediaValue;
  timestamp: number;
}

interface StoredThemeDiscovery {
  title: string;
  items: MediaItem[];
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

// SHAREABLE COLLECTION FLOW
interface SharedCollectionPayload {
  version: 1;
  collectionId: string;
  name: string;
  items: MediaItem[];
}

function isSharedCollectionPayload(
  value: unknown
): value is SharedCollectionPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<SharedCollectionPayload>;

  return (
    payload.version === 1 &&
    typeof payload.collectionId === 'string' &&
    payload.collectionId.length > 0 &&
    payload.collectionId.length <= 120 &&
    typeof payload.name === 'string' &&
    payload.name.length > 0 &&
    payload.name.length <= 80 &&
    Array.isArray(payload.items) &&
    payload.items.length <= MAX_SHARED_COLLECTION_ITEMS &&
    payload.items.every(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.artist === 'string' &&
        typeof item.collection === 'string' &&
        typeof item.genre === 'string' &&
        typeof item.kind === 'string' &&
        typeof item.artworkUrl === 'string' &&
        typeof item.sourceUrl === 'string' &&
        typeof item.storefront === 'string'
    )
  );
}

function encodeSharedCollection(payload: SharedCollectionPayload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeSharedCollection(
  encoded: string
): SharedCollectionPayload | null {
  try {
    const normalised = encoded
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded =
      normalised +
      '='.repeat((4 - (normalised.length % 4)) % 4);
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(
      binary,
      (character) => character.charCodeAt(0)
    );
    const parsed = JSON.parse(
      new TextDecoder().decode(bytes)
    ) as unknown;

    return isSharedCollectionPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatKind(kind: string) {
  return kind
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .toUpperCase();
}

function mediaIdentityForKind(kind: string): MediaValue {
  const value = kind.toLowerCase();

  if (value.includes('music-video') || value.includes('music video')) {
    return 'musicVideo';
  }

  if (value.includes('audiobook')) {
    return 'audiobook';
  }

  if (value.includes('podcast')) {
    return 'podcast';
  }

  if (value.includes('movie') || value.includes('film')) {
    return 'movie';
  }

  if (value.includes('tv')) {
    return 'tvShow';
  }

  if (value.includes('ebook')) {
    return 'ebook';
  }

  if (value.includes('song') || value.includes('music')) {
    return 'music';
  }

  return 'all';
}

function collectionMediaIdentity(collection: ShelfCollection): MediaValue {
  const identities = Array.from(
    new Set(
      (collection.items ?? [])
        .map((item) => mediaIdentityForKind(item.kind))
        .filter((value) => value !== 'all')
    )
  );

  return identities.length === 1 ? identities[0] : 'all';
}

// RESULTS RELATED COLLECTIONS + EMAIL UI

function readyMadeCollectionTerms(title: string, fallback: string) {
  const terms: Record<string, string[]> = {
    'Feel Good': [
      'happy pop',
      'summer hits',
      'good vibes',
      'upbeat music',
    ],
    Throwbacks: [
      'classic hits',
      '80s pop',
      '90s hits',
      'retro favourites',
    ],
    'Film Night': [
      'movie soundtrack',
      'cinematic score',
      'film music',
      'soundtrack classics',
    ],
    'Podcast Rabbit Hole': [
      'great stories',
      'culture podcast',
      'curious minds',
      'true stories',
    ],
    'Deep Focus': [
      'focus music',
      'ambient',
      'instrumental',
      'study music',
    ],
    'Story Time': [
      'fiction audiobook',
      'short stories',
      'classic fiction',
      'novel audiobook',
    ],
    'Road Trip': [
      'road trip',
      'driving music',
      'classic rock',
      'summer pop',
    ],
    'Late Night': [
      'late night',
      'chill r&b',
      'downtempo',
      'night drive',
    ],
    'Documentary Mood': [
      'documentary',
      'history',
      'nature documentary',
      'biography',
    ],
    'Learn Something': [
      'science podcast',
      'history podcast',
      'technology podcast',
      'education podcast',
    ],
    'Acoustic Morning': [
      'acoustic',
      'singer songwriter',
      'unplugged',
      'folk pop',
    ],
    'Hidden Gems': [
      'independent music',
      'indie',
      'alternative',
      'emerging artists',
    ],
  };

  return terms[title] ?? [fallback];
}

async function quickGlobalDiscovery({
  term,
  media,
  signal,
  targetItems,
  maxItems = targetItems,
}: {
  term: string;
  media: MediaValue;
  signal: AbortSignal;
  targetItems: number;
  maxItems?: number;
}) {
  let discovered: MediaItem[] = [];
  const queue = orderedGlobalStorefronts('za').slice(
    0,
    QUICK_DISCOVERY_MAX_STOREFRONTS
  );

  for (let index = 0; index < queue.length; index += 1) {
    if (signal.aborted || discovered.length >= targetItems) {
      break;
    }

    const country = queue[index];

    try {
      const cached = readCountryCache(term, media, country.code);

      if (!cached) {
        const elapsed =
          currentTimestamp() - quickDiscoveryLastNetworkRequestAt;

        if (elapsed < GLOBAL_REQUEST_INTERVAL_MS) {
          await sleep(GLOBAL_REQUEST_INTERVAL_MS - elapsed);
        }
      }

      const { response, fromCache } = await searchCountry({
        term,
        media,
        storefront: country.code,
        signal,
        limit: Math.min(25, Math.max(targetItems, 12)),
      });

      if (!fromCache) {
        quickDiscoveryLastNetworkRequestAt = currentTimestamp();
      }

      const globalContextResults = response.results.map((item) => ({
        ...item,
        sourceStorefront:
          item.sourceStorefront ?? item.storefront ?? country.code,
        storefront: GLOBAL_SHELF_CONTEXT,
      }));

      discovered = mergeUniqueResults(
        discovered,
        globalContextResults,
        maxItems
      );
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      // Quick discovery deliberately continues after a storefront miss.
      quickDiscoveryLastNetworkRequestAt = currentTimestamp();
    }
  }

  return discovered.slice(0, maxItems);
}

async function buildMixedCollection({
  seedItems = [],
  searchTerms,
  media,
  storefront,
  maxItems = 12,
}: {
  seedItems?: MediaItem[];
  searchTerms: string[];
  media: MediaValue;
  storefront: string;
  maxItems?: number;
}) {
  let mixed = mergeUniqueResults([], seedItems, maxItems);
  const uniqueTerms = Array.from(
    new Set(
      searchTerms
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

  const controller = new AbortController();

  if (storefront === ALL_COUNTRIES) {
    for (const searchTerm of uniqueTerms) {
      if (mixed.length >= maxItems) {
        break;
      }

      try {
        const discovered = await quickGlobalDiscovery({
          term: searchTerm,
          media,
          signal: controller.signal,
          targetItems: maxItems - mixed.length,
          maxItems: maxItems - mixed.length,
        });

        mixed = mergeUniqueResults(mixed, discovered, maxItems);
      } catch {
        // A quick-global related-search miss should not block collection creation.
      }
    }

    return mixed.slice(0, maxItems);
  }

  for (const searchTerm of uniqueTerms) {
    if (mixed.length >= maxItems) {
      break;
    }

    try {
      const { response } = await searchCountry({
        term: searchTerm,
        media,
        storefront,
        signal: controller.signal,
        limit: 8,
      });

      mixed = mergeUniqueResults(
        mixed,
        response.results.slice(0, 4),
        maxItems
      );
    } catch {
      // A related-search miss should not block the collection.
    }
  }

  return mixed.slice(0, maxItems);
}

const DIALOG_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getDialogFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      DIALOG_FOCUSABLE_SELECTOR
    )
  ).filter(
    (element) =>
      !element.hasAttribute('hidden') &&
      element.getAttribute('aria-hidden') !== 'true'
  );
}

function focusInitialDialogControl(container: HTMLElement | null) {
  if (!container) {
    return;
  }

  const preferred = container.querySelector<HTMLElement>(
    '[data-dialog-initial-focus]'
  );
  const first = getDialogFocusableElements(container)[0];

  (preferred ?? first ?? container).focus();
}

function trapDialogFocus(
  event: {
    key: string;
    shiftKey: boolean;
    preventDefault: () => void;
  },
  container: HTMLElement
) {
  if (event.key !== 'Tab') {
    return;
  }

  const focusable = getDialogFocusableElements(container);

  if (!focusable.length) {
    event.preventDefault();
    container.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last || !container.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

function activeFocusTarget() {
  const active = document.activeElement;

  if (
    active instanceof HTMLElement &&
    active !== document.body &&
    active !== document.documentElement
  ) {
    return active;
  }

  return null;
}

function restoreDialogFocus(target: HTMLElement | null) {
  window.requestAnimationFrame(() => {
    if (target?.isConnected) {
      target.focus();
      return;
    }

    document.getElementById('main-content')?.focus();
  });
}

// V4 BLOCK 7.1 — back-to-top visibility is scroll-aware.
// V4 BLOCK 7.3 — release defects: restart confirmation / storefront provenance / results query.
// V4 BLOCK 7.4 — release fixes: clean restart / All Countries shelf search context.
// V4 BLOCK 7.5 — release fix: restart race / Apple storefront provenance.
// V4 BLOCK 7.5.1 — storefront provenance label polish.
// V4 BLOCK 7.5.2 — complete Reset filters state clear.
// V4 BLOCK 7.5.3 V2 — reset action label matches full reset behavior.
// V4 BLOCK 7.5.4 — browser reload clears current Search/Results state.
export default function MediaShelfApp({
  routeView,
}: {
  routeView: RouteView;
}) {
  const { navigateTo } = useRouteNavigation();
  const activeSection = routeView;

  const [hydrated, setHydrated] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showBackTop, setShowBackTop] = useState(false);
  const [term, setTerm] = useState('');
  const [media, setMedia] = useState<MediaValue>('all');
  const [storefront, setStorefront] = useState(ALL_COUNTRIES);
  const [results, setResults] = useState<MediaItem[]>([]);
  const [sort, setSort] = useState<SortMode>('relevance');
  const [view, setView] = useState<ViewMode>('grid');
  const [visibleCount, setVisibleCount] = useState(16);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [homeCollections, setHomeCollections] = useState<
    Array<(typeof HOME_COLLECTION_POOL)[number]>
  >([]);
  const [addingHomeCollection, setAddingHomeCollection] = useState('');
  const [addingResultCollection, setAddingResultCollection] = useState(false);
  const [relatedCollectionResults, setRelatedCollectionResults] =
    useState<MediaItem[]>([]);
  const [relatedCollectionTitle, setRelatedCollectionTitle] =
    useState('');
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailShareUrl, setEmailShareUrl] = useState('');
  const [emailCollectionItems, setEmailCollectionItems] =
    useState<MediaItem[]>([]);
  const [sharedCollectionPreview, setSharedCollectionPreview] =
    useState<SharedCollectionPayload | null>(null);
  const [sharedCollectionError, setSharedCollectionError] =
    useState('');
  const [favourites, setFavourites] = useState<MediaItem[]>([]);
  const [collections, setCollections] = useState<ShelfCollection[]>([]);
  const [activeCollection, setActiveCollection] = useState('all');
  const [shelfCountry, setShelfCountry] = useState('all');
  const [selectedShelfIds, setSelectedShelfIds] = useState<Set<string>>(
    () => new Set()
  );
  const [newCollectionName, setNewCollectionName] = useState('');
  const [renamingCollection, setRenamingCollection] = useState(false);
  const [renameCollectionName, setRenameCollectionName] = useState('');
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
  const globalRunVersionRef = useRef(0);
  const confirmDialogRef = useRef<HTMLDivElement | null>(null);
  const sharedPreviewDialogRef = useRef<HTMLElement | null>(null);
  const emailModalRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      const storedPrefs = readJson<StoredPrefs>(
        window.localStorage,
        PREFS_KEY,
        {
          term: '',
          media: 'all',
          storefront: ALL_COUNTRIES,
          sort: 'relevance',
          view: 'grid',
        }
      );

      // Browser refresh is treated as a fresh Search/Results session.
      // Normal in-app route navigation is NOT a reload, so result handoff still works.
      const navigationEntry = window.performance
        .getEntriesByType('navigation')
        .at(0) as PerformanceNavigationTiming | undefined;
      const isSearchExperienceReload =
        navigationEntry?.type === 'reload' &&
        (routeView === 'search' || routeView === 'results');

      if (isSearchExperienceReload) {
        storedPrefs.term = '';
        storedPrefs.media = 'all';
        storedPrefs.storefront = ALL_COUNTRIES;

        window.localStorage.setItem(
          PREFS_KEY,
          JSON.stringify(storedPrefs)
        );
        window.sessionStorage.removeItem(SNAPSHOT_KEY);
        window.sessionStorage.removeItem(PENDING_GLOBAL_SEARCH_KEY);
        window.sessionStorage.removeItem(THEME_DISCOVERY_KEY);
      }

      const migrateUntouchedZaDefault =
        !(storedPrefs.term ?? '').trim() &&
        storedPrefs.media === 'all' &&
        storedPrefs.storefront === 'za';

      const prefs: StoredPrefs = migrateUntouchedZaDefault
        ? {
            ...storedPrefs,
            storefront: ALL_COUNTRIES,
          }
        : storedPrefs;

      if (migrateUntouchedZaDefault) {
        window.localStorage.setItem(
          PREFS_KEY,
          JSON.stringify(prefs)
        );
      }

      const safeMedia = isMediaValue(prefs.media)
        ? prefs.media
        : 'all';

      const safeStorefront =
        prefs.storefront === ALL_COUNTRIES ||
        appleStorefronts.some(
          (item) => item.code === prefs.storefront
        )
          ? prefs.storefront
          : ALL_COUNTRIES;

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
      const storedFavourites = readJson<MediaItem[]>(
        window.localStorage,
        FAVOURITES_KEY,
        []
      );
      const storedCollectionsRaw = readJson<ShelfCollection[]>(
        window.localStorage,
        COLLECTIONS_KEY,
        []
      );
      const storedCollections = storedCollectionsRaw.map(
        (collection) => {
          if (Array.isArray(collection.items)) {
            return collection;
          }

          const allowed = new Set(collection.itemIds);

          return {
            ...collection,
            items: storedFavourites.filter((item) =>
              allowed.has(item.id)
            ),
          };
        }
      );

      window.localStorage.setItem(
        COLLECTIONS_KEY,
        JSON.stringify(storedCollections)
      );

      const shareMatch = window.location.hash.match(
        /^#collection=([^&]+)$/
      );

      setFavourites(storedFavourites);
      setCollections(storedCollections);

      if (shareMatch) {
        const sharedCollection = decodeSharedCollection(shareMatch[1]);

        if (sharedCollection) {
          setSharedCollectionPreview(sharedCollection);
          setSharedCollectionError('');
        } else {
          setSharedCollectionPreview(null);
          setSharedCollectionError(
            'This shared collection link is invalid or too large to preview.'
          );
        }
      }

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

      const storedTheme = readJson<StoredThemeDiscovery | null>(
        window.sessionStorage,
        THEME_DISCOVERY_KEY,
        null
      );

      if (
        storedTheme &&
        Date.now() - storedTheme.timestamp <= SNAPSHOT_TTL_MS &&
        storedTheme.title.trim() &&
        Array.isArray(storedTheme.items)
      ) {
        setRelatedCollectionTitle(storedTheme.title);
        setRelatedCollectionResults(storedTheme.items);
      } else {
        window.sessionStorage.removeItem(THEME_DISCOVERY_KEY);
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

  useEffect(() => {
    if (!hydrated || routeView !== 'saved') {
      return;
    }

    const requestedCollectionId =
      window.sessionStorage.getItem(OPEN_COLLECTION_KEY);

    if (
      requestedCollectionId &&
      collections.some(
        (collection) => collection.id === requestedCollectionId
      )
    ) {
      setActiveCollection(requestedCollectionId);
      window.sessionStorage.removeItem(OPEN_COLLECTION_KEY);
    }
  }, [collections, hydrated, routeView]);

  useEffect(() => {
    if (!hydrated || homeCollections.length > 0) {
      return;
    }

    const picks = [...HOME_COLLECTION_POOL]
      .sort(() => Math.random() - 0.5)
      .slice(0, 6);

    setHomeCollections(picks);
  }, [hydrated, homeCollections.length]);

  useEffect(() => {
    const updateBackTopVisibility = () => {
      setShowBackTop(window.scrollY >= 120);
    };

    updateBackTopVisibility();
    window.addEventListener('scroll', updateBackTopVisibility, {
      passive: true,
    });

    return () => {
      window.removeEventListener('scroll', updateBackTopVisibility);
    };
  }, []);

  const sharedPreviewOpen = Boolean(
    sharedCollectionPreview || sharedCollectionError
  );

  useEffect(() => {
    if (!confirmDialog) {
      return;
    }

    const returnFocus = activeFocusTarget();
    const frame = window.requestAnimationFrame(() => {
      focusInitialDialogControl(confirmDialogRef.current);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      restoreDialogFocus(returnFocus);
    };
  }, [confirmDialog]);

  useEffect(() => {
    if (!sharedPreviewOpen) {
      return;
    }

    const returnFocus = activeFocusTarget();
    const frame = window.requestAnimationFrame(() => {
      focusInitialDialogControl(sharedPreviewDialogRef.current);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      restoreDialogFocus(returnFocus);
    };
  }, [sharedPreviewOpen]);

  useEffect(() => {
    if (!emailModalOpen) {
      return;
    }

    const returnFocus = activeFocusTarget();
    const frame = window.requestAnimationFrame(() => {
      focusInitialDialogControl(emailModalRef.current);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      restoreDialogFocus(returnFocus);
    };
  }, [emailModalOpen]);

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

  function persistThemeDiscovery(
    title: string,
    items: MediaItem[]
  ) {
    const value: StoredThemeDiscovery = {
      title,
      items,
      timestamp: currentTimestamp(),
    };

    setRelatedCollectionTitle(title);
    setRelatedCollectionResults(items);

    try {
      window.sessionStorage.setItem(
        THEME_DISCOVERY_KEY,
        JSON.stringify(value)
      );
    } catch {
      // Related discovery remains available in memory if storage is full.
    }
  }

  function clearThemeDiscovery() {
    setRelatedCollectionTitle('');
    setRelatedCollectionResults([]);
    window.sessionStorage.removeItem(THEME_DISCOVERY_KEY);
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

  function collectionNameExists(
    name: string,
    excludeCollectionId?: string
  ) {
    const key = name.trim().toLocaleLowerCase();

    if (!key) {
      return false;
    }

    return collections.some(
      (collection) =>
        collection.id !== excludeCollectionId &&
        collection.name.trim().toLocaleLowerCase() === key
    );
  }

  function showDuplicateCollectionName(name: string) {
    showToast(`A collection named “${name}” already exists.`);
  }

  function validateCollectionName(
    name: string,
    excludeCollectionId?: string
  ) {
    if (!name) {
      showToast('Enter a collection name first');
      return false;
    }

    if (name.length > COLLECTION_NAME_MAX_LENGTH) {
      showToast(
        `Collection names can be up to ${COLLECTION_NAME_MAX_LENGTH} characters.`
      );
      return false;
    }

    if (collectionNameExists(name, excludeCollectionId)) {
      showDuplicateCollectionName(name);
      return false;
    }

    return true;
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

  function removeRecent(search: RecentSearch) {
    const next = recent.filter(
      (item) =>
        !(
          item.term === search.term &&
          item.media === search.media &&
          item.storefront === search.storefront
        )
    );

    setRecent(next);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    showToast('Recent search removed');
  }

  function clearRecentSearches() {
    setRecent([]);
    window.localStorage.removeItem(RECENT_KEY);
    showToast('Recent searches cleared');
  }

  function resetFilters() {
    globalRunVersionRef.current += 1;
    scanCancelledRef.current = true;
    abortRef.current?.abort();
    setSearching(false);
    setTerm('');
    setMedia('all');
    setStorefront(ALL_COUNTRIES);
    setResults([]);
    setScan(null);
    setVisibleCount(16);
    setError('');
    setPendingGlobalSearch(null);
    pendingGlobalStartedRef.current = false;
    window.sessionStorage.removeItem(SNAPSHOT_KEY);
    window.sessionStorage.removeItem(PENDING_GLOBAL_SEARCH_KEY);
    clearThemeDiscovery();
    persistPrefs({
      term: '',
      media: 'all',
      storefront: ALL_COUNTRIES,
    });
    showToast('Search reset');
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

    clearThemeDiscovery();
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

  async function runQuickDiscoverySearch({
    nextTerm = term,
    nextMedia = media,
    shouldNavigate = true,
    shouldRecordRecent = true,
  }: {
    nextTerm?: string;
    nextMedia?: MediaValue;
    shouldNavigate?: boolean;
    shouldRecordRecent?: boolean;
  } = {}) {
    const cleaned = nextTerm.trim();

    if (!cleaned) {
      return;
    }

    clearThemeDiscovery();
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
    setStorefront(ALL_COUNTRIES);

    persistPrefs({
      term: cleaned,
      media: nextMedia,
      storefront: ALL_COUNTRIES,
    });

    try {
      const discovered = await quickGlobalDiscovery({
        term: cleaned,
        media: nextMedia,
        signal: controller.signal,
        targetItems: QUICK_DISCOVERY_RESULT_TARGET,
        maxItems: QUICK_DISCOVERY_RESULT_TARGET,
      });

      setResults(discovered);
      persistSnapshot(discovered, null, {
        term: cleaned,
        media: nextMedia,
        storefront: ALL_COUNTRIES,
      });

      if (shouldRecordRecent) {
        recordRecent({
          term: cleaned,
          media: nextMedia,
          storefront: ALL_COUNTRIES,
        });
      }

      if (!discovered.length) {
        setError(
          'No results found across the quick global discovery storefronts.'
        );
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
          : 'Quick global discovery failed.'
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

    clearThemeDiscovery();

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
    const runVersion = ++globalRunVersionRef.current;

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

        if (runVersion !== globalRunVersionRef.current) {
          return;
        }

        if (!fromCache) {
          lastNetworkRequestAtRef.current = currentTimestamp();
        }

        const globalContextResults = response.results.map((item) => ({
          ...item,
          sourceStorefront:
            item.sourceStorefront ?? item.storefront ?? country.code,
          storefront: GLOBAL_SHELF_CONTEXT,
        }));

        merged = mergeUniqueResults(
          merged,
          globalContextResults,
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

    if (runVersion !== globalRunVersionRef.current) {
      return;
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
      const hasRestartableGlobalScan =
        Boolean(scan) &&
        !scan?.complete &&
        (scan?.completedCodes.length ?? 0) > 0;

      if (hasRestartableGlobalScan) {
        const restartTerm = term.trim();

        setConfirmDialog({
          title: 'Start over?',
          message: `This will clear the current Global Scan, results and search criteria for “${restartTerm}”, then return you to a clean Search screen. Your Shelf and Recent Searches will not change.`,
          confirmLabel: 'Start over',
          onConfirm: () => {
            resetSearchExperience();
            navigateTo('search');
          },
        });
        return;
      }

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

  // THREE UX CHANGES - RESET / SURPRISE / OPEN COLLECTION
  function resetSearchExperience() {
    globalRunVersionRef.current += 1;
    scanCancelledRef.current = true;
    abortRef.current?.abort();
    setSearching(false);
    setTerm('');
    setMedia('all');
    setStorefront(ALL_COUNTRIES);
    setResults([]);
    setScan(null);
    setVisibleCount(16);
    setError('');
    setPendingGlobalSearch(null);
    pendingGlobalStartedRef.current = false;

    window.sessionStorage.removeItem(SNAPSHOT_KEY);
    window.sessionStorage.removeItem(PENDING_GLOBAL_SEARCH_KEY);
    clearThemeDiscovery();

    persistPrefs({
      term: '',
      media: 'all',
      storefront: ALL_COUNTRIES,
    });

    showToast('Search reset');
  }

  function surpriseMe() {
    const surprises: Array<{
      term: string;
      media: MediaValue;
    }> = [
      { term: 'jazz', media: 'music' },
      { term: 'adventure', media: 'movie' },
      { term: 'science', media: 'podcast' },
      { term: 'history', media: 'audiobook' },
      { term: 'nature', media: 'tvShow' },
      { term: 'live', media: 'musicVideo' },
      { term: 'mystery', media: 'ebook' },
      { term: 'classic', media: 'music' },
    ];

    const choice =
      surprises[Math.floor(Math.random() * surprises.length)];

    if (!choice) {
      return;
    }

    if (storefront === ALL_COUNTRIES) {
      void runQuickDiscoverySearch({
        nextTerm: choice.term,
        nextMedia: choice.media,
      });
      return;
    }

    void runSpecificSearch({
      nextTerm: choice.term,
      nextMedia: choice.media,
      nextStorefront: storefront,
    });
  }

  // INDEPENDENT COLLECTION STATE
  function toggleFavourite(item: MediaItem) {
    const exists = favourites.some(
      (saved) => saved.id === item.id
    );

    if (exists) {
      persistFavourites(
        favourites.filter((saved) => saved.id !== item.id)
      );
      showToast('Removed from All Saved. Collections unchanged.');
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

    if (activeCollection === 'all') {
      setConfirmDialog({
        title: 'Remove selected from All Saved?',
        message: `This will remove ${ids.size} item${
          ids.size === 1 ? '' : 's'
        } from All Saved. Copies inside your collections will remain.`,
        confirmLabel: 'Remove selected',
        onConfirm: () => {
          persistFavourites(
            favourites.filter((item) => !ids.has(item.id))
          );
          setSelectedShelfIds(new Set());
          showToast(
            'Removed from All Saved. Collections unchanged.'
          );
        },
      });
      return;
    }

    const collection = collections.find(
      (item) => item.id === activeCollection
    );

    if (!collection) {
      return;
    }

    setConfirmDialog({
      title: `Remove selected from ${collection.name}?`,
      message: `This will remove ${ids.size} item${
        ids.size === 1 ? '' : 's'
      } from this collection only. All Saved and other collections will remain unchanged.`,
      confirmLabel: 'Remove from collection',
      onConfirm: () => {
        persistCollections(
          collections.map((item) =>
            item.id === activeCollection
              ? {
                  ...item,
                  itemIds: item.itemIds.filter(
                    (itemId) => !ids.has(itemId)
                  ),
                  items: (item.items ?? []).filter(
                    (mediaItem) => !ids.has(mediaItem.id)
                  ),
                }
              : item
          )
        );

        setSelectedShelfIds(new Set());
        showToast('Removed from this collection only');
      },
    });
  }

  function clearShelf() {
    if (!favourites.length) {
      return;
    }

    setConfirmDialog({
      title: 'Remove everything from All Saved?',
      message: `This will remove all ${favourites.length} saved item${
        favourites.length === 1 ? '' : 's'
      } from All Saved. Your custom collections and their items will remain.`,
      confirmLabel: 'Remove all',
      onConfirm: () => {
        persistFavourites([]);
        setSelectedShelfIds(new Set());
        setActiveCollection('all');
        showToast(
          'All Saved cleared. Collections unchanged.'
        );
      },
    });
  }

  function createCollection() {
    const name = newCollectionName.trim();

    if (!validateCollectionName(name)) {
      return;
    }

    const collection: ShelfCollection = {
      id: crypto.randomUUID(),
      name,
      itemIds: [],
      items: [],
    };

    persistCollections([...collections, collection]);
    setNewCollectionName('');
    setActiveCollection(collection.id);
    window.sessionStorage.setItem(
      OPEN_COLLECTION_KEY,
      collection.id
    );
    showToast(`Collection created: ${name}`);
  }

  // ADD ALL SAVED TO NEW COLLECTION
  // FINAL SHELF FUNCTION FIX
  // SHELF UX CLEANUP 2026-08-26
  function createCollectionWithAllSaved() {
    const name = newCollectionName.trim();

    if (!validateCollectionName(name)) {
      return;
    }

    const activeItems =
      activeCollection === 'all'
        ? favourites
        : collections.find(
            (collection) => collection.id === activeCollection
          )?.items ?? [];

    const selectedIds = new Set(selectedShelfIds);
    const sourceItems =
      selectedIds.size > 0
        ? activeItems.filter((item) =>
            selectedIds.has(item.id)
          )
        : activeItems;

    if (sourceItems.length === 0) {
      showToast('There are no items here to copy');
      return;
    }

    const collection: ShelfCollection = {
      id: crypto.randomUUID(),
      name,
      itemIds: sourceItems.map((item) => item.id),
      items: sourceItems,
    };

    persistCollections([...collections, collection]);
    setNewCollectionName('');
    setShelfCountry('all');
    setSelectedShelfIds(new Set());
    setActiveCollection(collection.id);

    window.sessionStorage.setItem(
      OPEN_COLLECTION_KEY,
      collection.id
    );

    showToast(
      `Collection created: ${name} - ${sourceItems.length} item${
        sourceItems.length === 1 ? '' : 's'
      } copied`
    );
  }

  function startRenameCollection() {
    if (activeCollection === 'all') {
      return;
    }

    const collection = collections.find(
      (item) => item.id === activeCollection
    );

    if (!collection) {
      return;
    }

    setRenameCollectionName(collection.name);
    setRenamingCollection(true);
  }

  function cancelRenameCollection() {
    setRenamingCollection(false);
    setRenameCollectionName('');
  }

  function renameActiveCollection() {
    if (activeCollection === 'all') {
      return;
    }

    const name = renameCollectionName.trim();

    if (!validateCollectionName(name, activeCollection)) {
      return;
    }

    persistCollections(
      collections.map((collection) =>
        collection.id === activeCollection
          ? {
              ...collection,
              name,
            }
          : collection
      )
    );

    setRenamingCollection(false);
    setRenameCollectionName('');
    showToast(`Collection renamed: ${name}`);
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

    const sourceItem =
      favourites.find((item) => item.id === itemId) ??
      collections
        .flatMap((collection) => collection.items ?? [])
        .find((item) => item.id === itemId);

    persistCollections(
      collections.map((collection) =>
        collection.id === collectionId
          ? {
              ...collection,
              itemIds: Array.from(
                new Set([...collection.itemIds, itemId])
              ),
              items: sourceItem
                ? mergeUniqueResults(
                    collection.items ?? [],
                    [sourceItem]
                  )
                : collection.items ?? [],
            }
          : collection
      )
    );
    showToast('Added to collection');
  }

  function addSelectedShelfItemsToCollection(
    collectionId: string
  ) {
    if (!collectionId || selectedShelfIds.size === 0) {
      return;
    }

    const targetCollection = collections.find(
      (collection) => collection.id === collectionId
    );

    if (!targetCollection) {
      showToast('Choose a collection first');
      return;
    }

    const selectedIds = new Set(selectedShelfIds);
    const sourceItems = activeShelfItems.filter((item) =>
      selectedIds.has(item.id)
    );

    if (sourceItems.length === 0) {
      showToast('No selected items available to add');
      return;
    }

    persistCollections(
      collections.map((collection) =>
        collection.id === collectionId
          ? {
              ...collection,
              itemIds: Array.from(
                new Set([
                  ...collection.itemIds,
                  ...sourceItems.map((item) => item.id),
                ])
              ),
              items: mergeUniqueResults(
                collection.items ?? [],
                sourceItems
              ),
            }
          : collection
      )
    );

    showToast(
      `Added ${sourceItems.length} item${
        sourceItems.length === 1 ? '' : 's'
      } to ${targetCollection.name}`
    );
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
              items: (collection.items ?? []).filter(
                (item) => item.id !== itemId
              ),
            }
          : collection
      )
    );
    showToast('Removed from this collection only');
  }

  // P0 SHARED COLLECTION PREVIEW
  function closeSharedCollectionPreview() {
    setSharedCollectionPreview(null);
    setSharedCollectionError('');
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`
    );
  }

  function importSharedCollection() {
    if (!sharedCollectionPreview) {
      return;
    }

    const importedCollectionId =
      `shared:${sharedCollectionPreview.collectionId}`;
    const existingCollection = collections.find(
      (collection) => collection.id === importedCollectionId
    );
    const importedName =
      existingCollection?.name ?? sharedCollectionPreview.name.trim();

    if (!validateCollectionName(importedName, importedCollectionId)) {
      return;
    }

    const importedCollection: ShelfCollection = {
      id: importedCollectionId,
      name: importedName,
      itemIds: sharedCollectionPreview.items.map((item) => item.id),
      items: sharedCollectionPreview.items,
    };

    const nextCollections = existingCollection
      ? collections.map((collection) =>
          collection.id === importedCollectionId
            ? importedCollection
            : collection
        )
      : [...collections, importedCollection];

    persistCollections(nextCollections);
    setActiveCollection(importedCollectionId);
    setShelfCountry('all');
    setSelectedShelfIds(new Set());
    window.sessionStorage.setItem(
      OPEN_COLLECTION_KEY,
      importedCollectionId
    );
    closeSharedCollectionPreview();
    showToast(
      `Collection added: ${importedName}`
    );
  }

  // RESTORE MISSING COLLECTION FUNCTIONS
  // EMAIL MODAL + RELATED RESULTS
  function emailActiveCollection() {
    const collection =
      activeCollection === 'all'
        ? null
        : collections.find(
            (item) => item.id === activeCollection
          );

    if (!collection) {
      showToast('Select a collection first');
      return;
    }

    const allowed = new Set(collection.itemIds);
    const items = Array.isArray(collection.items)
      ? collection.items
      : favourites.filter((item) => allowed.has(item.id));

    if (!items.length) {
      showToast('Add items before emailing this collection');
      return;
    }

    if (items.length > MAX_SHARED_COLLECTION_ITEMS) {
      showToast(
        `This collection is too large to share by link. Keep it to ${MAX_SHARED_COLLECTION_ITEMS} items or fewer.`
      );
      return;
    }

    const payload: SharedCollectionPayload = {
      version: 1,
      collectionId: collection.id,
      name: collection.name,
      items,
    };

    const shareUrl =
      `${window.location.origin}/shelf#collection=` +
      encodeSharedCollection(payload);

    setEmailTo('');
    setEmailSubject(`MediaShelf collection: ${collection.name}`);
    setEmailMessage(
      `I thought you might like this MediaShelf collection: ${collection.name}.`
    );
    setEmailShareUrl(shareUrl);
    setEmailCollectionItems(items);
    setEmailModalOpen(true);
  }

  function submitCollectionEmail() {
    const collection =
      activeCollection === 'all'
        ? null
        : collections.find(
            (item) => item.id === activeCollection
          );

    const collectionName =
      collection?.name ?? 'MediaShelf collection';

    const lines = emailCollectionItems.flatMap(
      (item, index) => [
        `${index + 1}. ${item.title}`,
        `   ${item.artist}`,
        `   ${formatKind(item.kind)} - ${storefrontLabel(
          item.storefront
        )}`,
        item.sourceUrl ? `   ${item.sourceUrl}` : '',
        '',
      ]
    );

    const body = [
      emailMessage.trim(),
      '',
      `Open ${collectionName} in MediaShelf:`,
      emailShareUrl,
      '',
      ...lines,
      'Sent from MediaShelf',
    ].join('\n');

    const recipient = emailTo.trim();

    window.location.href =
      `mailto:${encodeURIComponent(recipient)}` +
      `?subject=${encodeURIComponent(emailSubject.trim())}` +
      `&body=${encodeURIComponent(body)}`;

    setEmailModalOpen(false);
  }

  async function addHomeCollectionToShelf(
    collection: (typeof HOME_COLLECTION_POOL)[number]
  ) {
    if (addingHomeCollection) {
      return;
    }

    const nextStorefront = storefront;
    const collectionId = `home:${collection.id}`;
    const existingCollection = collections.find(
      (item) => item.id === collectionId
    );
    const collectionName =
      existingCollection?.name ?? collection.title;

    if (!validateCollectionName(collectionName, collectionId)) {
      return;
    }

    setAddingHomeCollection(collection.id);

    try {
      const discoveryItems = await buildMixedCollection({
        searchTerms: readyMadeCollectionTerms(
          collection.title,
          collection.term
        ),
        media: collection.media,
        storefront: nextStorefront,
        maxItems: 18,
      });

      if (!discoveryItems.length) {
        showToast('No items found for this collection');
        return;
      }

      const shelfItems = discoveryItems.slice(0, 12);
      const shelfIds = new Set(shelfItems.map((item) => item.id));
      const relatedItems = discoveryItems.filter(
        (item) => !shelfIds.has(item.id)
      );
      const relatedForResults =
        relatedItems.length > 0
          ? relatedItems
          : discoveryItems.slice(Math.min(6, discoveryItems.length));

      const shelfCollection: ShelfCollection = {
        id: collectionId,
        name: collectionName,
        itemIds: shelfItems.map((item) => item.id),
        items: shelfItems,
      };

      const nextCollections = collections.some(
        (item) => item.id === collectionId
      )
        ? collections.map((item) =>
            item.id === collectionId
              ? shelfCollection
              : item
          )
        : [...collections, shelfCollection];

      persistCollections(nextCollections);
      setActiveCollection(collectionId);
      setShelfCountry('all');
      setSelectedShelfIds(new Set());

      setTerm(collection.title);
      setMedia(collection.media);
      setStorefront(nextStorefront);
      setResults(shelfItems);
      setVisibleCount(16);
      setSort('relevance');

      persistPrefs({
        term: collection.title,
        media: collection.media,
        storefront: nextStorefront,
        sort: 'relevance',
      });
      persistSnapshot(shelfItems, null, {
        term: collection.title,
        media: collection.media,
        storefront: nextStorefront,
      });
      persistThemeDiscovery(collection.title, relatedForResults);

      window.sessionStorage.setItem(
        OPEN_COLLECTION_KEY,
        collectionId
      );

      showToast(
        `Collection added: ${collectionName}. Related results are ready.`
      );
    } catch (collectionError) {
      showToast(
        collectionError instanceof Error
          ? collectionError.message
          : 'Could not add collection'
      );
    } finally {
      setAddingHomeCollection('');
    }
  }

  async function addResultsAsCollection() {
    if (addingResultCollection || results.length === 0) {
      return;
    }

    const nextStorefront = storefront;
    const baseItems = results.slice(0, 6);

    const genres = Array.from(
      new Set(
        results
          .map((item) => item.genre)
          .filter(Boolean)
      )
    ).slice(0, 2);

    const artists = Array.from(
      new Set(
        results
          .map((item) => item.artist)
          .filter(
            (value) =>
              value &&
              value !== 'Unknown artist'
          )
      )
    ).slice(0, 2);

    const relatedTerms = [...genres, ...artists];

    if (relatedTerms.length === 0 && term.trim()) {
      relatedTerms.push(term.trim());
    }

    const cleanTerm = term.trim() || 'Results';
    const generatedSuffix = ' Mix';
    const generatedName =
      `${cleanTerm
        .slice(
          0,
          COLLECTION_NAME_MAX_LENGTH - generatedSuffix.length
        )
        .trimEnd()}${generatedSuffix}`;
    const collectionId = [
      'results',
      cleanTerm.toLowerCase(),
      media,
      nextStorefront,
    ].join(':');
    const existingCollection = collections.find(
      (item) => item.id === collectionId
    );
    const collectionName =
      existingCollection?.name ?? generatedName;

    if (!validateCollectionName(collectionName, collectionId)) {
      return;
    }

    setAddingResultCollection(true);

    try {
      const items = await buildMixedCollection({
        seedItems: baseItems,
        searchTerms: relatedTerms,
        media,
        storefront: nextStorefront,
        maxItems: 12,
      });

      if (!items.length) {
        showToast('No results available for this collection');
        return;
      }

      const currentResultIds = new Set(
        baseItems.map((item) => item.id)
      );
      const relatedItems = items.filter(
        (item) => !currentResultIds.has(item.id)
      );

      const relatedForResults =
        relatedItems.length > 0
          ? relatedItems
          : items.slice(Math.min(6, items.length));

      persistThemeDiscovery(
        collectionName,
        relatedForResults
      );

      const shelfCollection: ShelfCollection = {
        id: collectionId,
        name: collectionName,
        itemIds: items.map((item) => item.id),
        items,
      };

      const nextCollections = collections.some(
        (item) => item.id === collectionId
      )
        ? collections.map((item) =>
            item.id === collectionId
              ? shelfCollection
              : item
          )
        : [...collections, shelfCollection];

      persistCollections(nextCollections);
      setActiveCollection(collectionId);
      setShelfCountry('all');
      setSelectedShelfIds(new Set());

      window.sessionStorage.setItem(
        OPEN_COLLECTION_KEY,
        collectionId
      );

      showToast(`Collection added: ${collectionName}`);
    } finally {
      setAddingResultCollection(false);
    }
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

  const activeShelfItems = (() => {
    if (activeCollection === 'all') {
      return favourites;
    }

    const collection = collections.find(
      (item) => item.id === activeCollection
    );

    if (!collection) {
      return [];
    }

    if (Array.isArray(collection.items)) {
      return collection.items;
    }

    const allowed = new Set(collection.itemIds);

    return favourites.filter((item) => allowed.has(item.id));
  })();

  const filteredShelf =
    shelfCountry === 'all'
      ? activeShelfItems
      : activeShelfItems.filter(
          (item) => item.storefront === shelfCountry
        );

  const shelfCountries = Array.from(
    new Set(
      activeShelfItems
        .map((item) => item.storefront)
        .filter(Boolean)
    )
  ).sort((a, b) =>
    shelfSearchLabel(a).localeCompare(shelfSearchLabel(b))
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
      shelfSearchLabel(a).localeCompare(shelfSearchLabel(b))
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

  const currentScanStorefront =
    scan && !scan.complete
      ? orderedGlobalStorefronts('za').find(
          (country) =>
            !scan.completedCodes.includes(country.code)
        )
      : null;

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
                    autoCapitalize="none"
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
                    ? 'Restart Global Scan'
                    : 'Start Global Scan'
                  : searching
                    ? 'Searching...'
                    : 'Search'}
              </button>
            </form>

            <div className={styles.searchUtilities}>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.surpriseButton}`}
                data-surprise-me="true"
                onClick={surpriseMe}
              >
                Surprise me
              </button>

              <button
                type="button"
                className={styles.secondaryButton}
                data-reset-filters="true"
                onClick={resetSearchExperience}
              >
                Reset search
              </button>
              <span>
                Reset clears the current search without changing Recent Searches.
                {storefront === ALL_COUNTRIES
                  ? ' Quick global discovery uses multiple storefronts.'
                  : ''}
              </span>
            </div>

            {storefront === ALL_COUNTRIES && (
              <div className={styles.globalScanNotice}>
                <strong>All Countries · Global catalogue scan</strong>
                <span>
                  Progressive, rate-safe and resumable. Apple
                  storefront requests are deliberately rate-limited,
                  so a complete scan can take several minutes.
                </span>
              </div>
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
                    data-media={item.value}
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

            {homeCollections.length > 0 && (
              <section
                className={styles.homeCollections}
                aria-labelledby="ready-made-collections-title"
              >
                <div className={styles.homeCollectionsHeading}>
                  <div>
                    <p className={styles.eyebrow}>Discover</p>
                    <h2 id="ready-made-collections-title">
                      Ready-made collections
                    </h2>
                  </div>
                  <span>
                    Random picks for this visit
                    {storefront === ALL_COUNTRIES
                      ? ' · quick global discovery'
                      : ''}
                  </span>
                </div>

                <div className={styles.homeCollectionGrid}>
                  {homeCollections.map((collection) => (
                    <button
                      key={collection.id}
                      type="button"
                      data-media={collection.media}
                      className={styles.homeCollectionCard}
                      disabled={Boolean(addingHomeCollection)}
                      data-adding={
                        addingHomeCollection === collection.id
                      }
                      onClick={() =>
                        void addHomeCollectionToShelf(collection)
                      }
                    >
                      <span
                        className={styles.homeCollectionType}
                        data-media={collection.media}
                      >
                        {mediaLabel(collection.media)}
                      </span>
                      <strong>{collection.title}</strong>
                      <small>{collection.description}</small>
                      <span className={styles.homeCollectionAction}>
                        {addingHomeCollection === collection.id
                          ? 'Adding...'
                          : 'Add to Your Shelf'}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {recent.length > 0 && (
              <aside
                className={styles.recentBlock}
                aria-labelledby="recent-searches-title"
              >
                <div className={styles.recentHeading}>
                  <div className={styles.recentHeadingCopy}>
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
                  <button
                    type="button"
                    className={styles.recentClearButton}
                    data-clear-recent
                    onClick={clearRecentSearches}
                  >
                    Clear recent searches
                  </button>
                </div>
                <div className={styles.recentList}>
                  {recent.map((item) => (
                    <div
                      className={styles.recentItem}
                      data-media={item.media}
                      key={`${item.term}-${item.media}-${item.storefront}`}
                    >
                      <button
                        className={styles.recentRunButton}
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
                      <button
                        type="button"
                        className={styles.recentRemoveButton}
                        data-remove-recent
                        aria-label={`Remove recent search ${item.term}`}
                        onClick={() => removeRecent(item)}
                      >
                        Remove
                      </button>
                    </div>
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
                <h1 id="results-title">
                  Results{term.trim() ? ` — ${term.trim()}` : ''}
                </h1>
                <p className={styles.sectionMeta}>
                  {results.length} result
                  {results.length === 1 ? '' : 's'} ·{' '}
                  {mediaLabel(media)} ·{' '}
                  {storefrontLabel(storefront)}
                </p>
                {relatedCollectionTitle && (
                  <span
                    className={styles.resultsThemeBadge}
                    data-media={media}
                  >
                    Theme: {relatedCollectionTitle}
                  </span>
                )}
              </div>

              <div className={styles.toolbar}>
                {results.length > 0 && (
                  <button
                    type="button"
                    className={styles.addResultsCollectionButton}
                    data-media={media}
                    disabled={addingResultCollection}
                    onClick={() =>
                      void addResultsAsCollection()
                    }
                  >
                    {addingResultCollection
                      ? 'Building collection...'
                      : 'Add collection to Shelf'}
                  </button>
                )}

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

            <div
              className={styles.resultsCollectionTools}
              aria-label="Result collection tools"
            >
              <div>
                <strong>Collections</strong>
                <span>
                  Create a collection here, then save any saved result into it.
                  {storefront === ALL_COUNTRIES
                    ? ' Quick global discovery uses multiple storefronts.'
                    : ''}
                </span>
              </div>
              <label
                className={styles.srOnly}
                htmlFor="results-new-collection-name"
              >
                New collection name
              </label>
              <input
                id="results-new-collection-name"
                value={newCollectionName}
                placeholder="New collection"
                maxLength={COLLECTION_NAME_MAX_LENGTH}
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
                data-create-collection
                onClick={createCollection}
                disabled={!newCollectionName.trim()}
              >
                Create collection
              </button>
            </div>

            {scan && (
              <div className={styles.scanPanel}>
                <div className={styles.scanHeader}>
                  <div>
                    <strong>All Countries · Global Scan</strong>
                    <span className={styles.scanProgressText}>
                      {scan.completedCodes.length} of {scan.total}{' '}
                      storefronts · {results.length}{' '}
                      unique results retained
                    </span>
                    {currentScanStorefront && (
                      <small className={styles.scanCurrentStorefront}>
                        {searching ? 'Scanning next' : 'Next storefront'}:{' '}
                        {storefrontLabel(currentScanStorefront.code)}
                      </small>
                    )}
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
                  Progressive, rate-safe and resumable. Pause at any
                  time and Resume from the retained storefront and
                  result progress. Up to {GLOBAL_RESULT_LIMIT} unique
                  results are retained in this browser session.
                </small>
              </div>
            )}

            {error && (
              <div className={styles.errorNotice} role="alert">
                {error}
              </div>
            )}

            {/* P1.3 + P1.4 + P1.6 2026-08-26 */}
            {!hydrated ? (
              <div className={styles.emptyState}>
                <strong>No search yet</strong>
                <span>
                  Search for music, films, podcasts and more.
                </span>
                <div className={styles.emptyStateActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => navigateTo('search')}
                  >
                    Back to Search
                  </button>
                  <button
                    type="button"
                    className={`${styles.secondaryButton} ${styles.surpriseButton}`}
                    data-surprise-me-empty-results="true"
                    onClick={surpriseMe}
                  >
                    Surprise me
                  </button>
                </div>
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
                <strong>
                  {term.trim() ? 'No results found.' : 'No search yet'}
                </strong>
                <span>
                  {term.trim()
                    ? 'Try another search or adjust the current filters.'
                    : 'Search for music, films, podcasts and more.'}
                </span>
                {!term.trim() && (
                  <div className={styles.emptyStateActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => navigateTo('search')}
                    >
                      Back to Search
                    </button>
                    <button
                      type="button"
                      className={`${styles.secondaryButton} ${styles.surpriseButton}`}
                      data-surprise-me-empty-results="true"
                      onClick={surpriseMe}
                    >
                      Surprise me
                    </button>
                  </div>
                )}
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
                        data-media={mediaIdentityForKind(item.kind)}
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
                            data-media={mediaIdentityForKind(item.kind)}
                          >
                            {formatKind(item.kind)}
                          </span>
                          {appleStorefrontMeta(item) && (
                            <small className={styles.storefrontMeta}>
                              {appleStorefrontMeta(item)}
                            </small>
                          )}
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

                          {saved && (
                            <label className={styles.resultCollectionControl}>
                              <span>Save to collection</span>
                              <select
                                defaultValue=""
                                data-result-collection-select
                                aria-label={`Save ${item.title} to collection`}
                                disabled={collections.length === 0}
                                onChange={(event) => {
                                  addToCollection(
                                    item.id,
                                    event.target.value
                                  );
                                  event.target.value = '';
                                }}
                              >
                                <option value="">
                                  {collections.length > 0
                                    ? 'Choose collection'
                                    : 'Create a collection first'}
                                </option>
                                {collections.map((collection) => (
                                  <option
                                    key={collection.id}
                                    value={collection.id}
                                  >
                                    {collection.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {relatedCollectionResults.length > 0 && (
                  <section
                    className={styles.relatedResultsPanel}
                    aria-labelledby="related-collection-title"
                  >
                    <div className={styles.relatedResultsHeading}>
                      <div>
                        <p className={styles.eyebrow}>
                          More to discover
                        </p>
                        <h2 id="related-collection-title">
                          Related to {relatedCollectionTitle}
                        </h2>
                        <p>
                          Similar picks discovered while building
                          this collection. Your existing Collections
                          controls above are unchanged.
                        </p>
                      </div>
                    </div>

                    <div className={styles.relatedResultsGrid}>
                      {relatedCollectionResults.map((item) => {
                        const saved = favourites.some(
                          (entry) => entry.id === item.id
                        );

                        return (
                          <article
                            key={`related-${item.id}`}
                            className={styles.relatedResultCard}
                            data-media={mediaIdentityForKind(item.kind)}
                          >
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
                                className={
                                  styles.relatedArtworkFallback
                                }
                                aria-hidden="true"
                              >
                                MediaShelf
                              </div>
                            )}

                            <div
                              className={
                                styles.relatedResultCopy
                              }
                            >
                              <span
                                className={styles.kind}
                                data-kind={item.kind}
                                data-media={mediaIdentityForKind(item.kind)}
                              >
                                {formatKind(item.kind)}
                              </span>
                              <strong>{item.title}</strong>
                              <span>{item.artist}</span>
                              <small>
                                Included in{' '}
                                {relatedCollectionTitle}
                              </small>
                            </div>

                            <div
                              className={
                                styles.relatedResultActions
                              }
                            >
                              <button
                                type="button"
                                className={
                                  saved
                                    ? styles.savedButton
                                    : ''
                                }
                                onClick={() =>
                                  toggleFavourite(item)
                                }
                              >
                                {saved
                                  ? 'Saved'
                                  : 'Save to Shelf'}
                              </button>

                              {item.sourceUrl && (
                                <a
                                  href={item.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  View
                                </a>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}

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
                <p className={styles.shelfStorageNote}>
                  Saved on this device
                </p>
              </div>

              <div className={styles.shelfSummary}>
                <span>
                  {favourites.length} in All Saved
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
                data-media="all"
                className={
                  activeCollection === 'all'
                    ? styles.activeCollection
                    : ''
                }
                aria-pressed={activeCollection === 'all'}
                onClick={() => {
                  cancelRenameCollection();
                  setActiveCollection('all');
                }}
              >
                All Saved
              </button>
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  data-media={collectionMediaIdentity(collection)}
                  className={
                    activeCollection === collection.id
                      ? styles.activeCollection
                      : ''
                  }
                  aria-pressed={activeCollection === collection.id}
                  onClick={() => {
                    cancelRenameCollection();
                    setActiveCollection(collection.id);
                  }}
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
                maxLength={COLLECTION_NAME_MAX_LENGTH}
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
                className={styles.createCollectionButton}
                onClick={createCollection}
                disabled={!newCollectionName.trim()}
              >
                Create empty
              </button>
              {activeShelfItems.length > 0 && (
                <button
                  type="button"
                  className={styles.createAllCollectionButton}
                  data-create-all-collection="true"
                  onClick={createCollectionWithAllSaved}
                  disabled={!newCollectionName.trim()}
                >
                  {selectedShelfIds.size > 0
                    ? `Create from ${selectedShelfIds.size} selected`
                    : activeCollection === 'all'
                      ? 'Create with All Saved'
                      : 'Copy current collection'}
                </button>
              )}
            </div>

            {activeShelfItems.length > 0 && (
            <div className={styles.shelfBulkBar}>
              <label className={styles.shelfFilter}>
                <span>Filter search context</span>
                <select
                  value={shelfCountry}
                  onChange={(event) => {
                    setShelfCountry(event.target.value);
                    setSelectedShelfIds(new Set());
                  }}
                >
                  <option value="all">All search contexts</option>
                  {shelfCountries.map((code) => (
                    <option key={code} value={code}>
                      {shelfSearchLabel(code)}
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

              <label className={styles.bulkCollectionAction}>
                <span className={styles.srOnly}>
                  Add selected items to collection
                </span>
                <select
                  className={styles.bulkCollectionSelect}
                  defaultValue=""
                  disabled={
                    selectedShelfIds.size === 0 ||
                    collections.every(
                      (collection) =>
                        collection.id === activeCollection
                    )
                  }
                  aria-label="Add selected items to collection"
                  onChange={(event) => {
                    addSelectedShelfItemsToCollection(
                      event.target.value
                    );
                    event.target.value = '';
                  }}
                >
                  <option value="">
                    {allFilteredSelected
                      ? 'Add all to collection...'
                      : 'Add selected to collection...'}
                  </option>
                  {collections
                    .filter(
                      (collection) =>
                        collection.id !== activeCollection
                    )
                    .map((collection) => (
                      <option
                        key={collection.id}
                        value={collection.id}
                      >
                        {collection.name}
                      </option>
                    ))}
                </select>
              </label>

              <button
                type="button"
                className={styles.deleteSelectedButton}
                disabled={selectedShelfIds.size === 0}
                onClick={deleteSelectedShelfItems}
              >
                Remove selected
              </button>
            </div>

            )}
            <div className={styles.shelfContext}>
              {renamingCollection &&
              activeCollection !== 'all' ? (
                <form
                  className={styles.collectionRenameForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    renameActiveCollection();
                  }}
                >
                  <label
                    className={styles.srOnly}
                    htmlFor="rename-collection-name"
                  >
                    Rename collection
                  </label>
                  <input
                    id="rename-collection-name"
                    value={renameCollectionName}
                    maxLength={COLLECTION_NAME_MAX_LENGTH}
                    autoFocus
                    onChange={(event) =>
                      setRenameCollectionName(event.target.value)
                    }
                  />
                  <button
                    type="submit"
                    className={styles.renameSaveButton}
                    disabled={!renameCollectionName.trim()}
                  >
                    Save name
                  </button>
                  <button
                    type="button"
                    className={styles.renameCancelButton}
                    onClick={cancelRenameCollection}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className={styles.shelfContextIdentity}>
                  <strong>{activeCollectionName}</strong>
                  <span>
                    {filteredShelf.length} item
                    {filteredShelf.length === 1 ? '' : 's'}
                  </span>
                </div>
              )}

              {activeCollection !== 'all' &&
                !renamingCollection && (
                  <div className={styles.shelfContextActions}>
                    <button
                      type="button"
                      className={styles.renameCollectionButton}
                      onClick={startRenameCollection}
                    >
                      Rename
                    </button>
                    {activeShelfItems.length > 0 && (
                      <button
                        type="button"
                        className={styles.emailCollectionButton}
                        data-email-collection="true"
                        onClick={emailActiveCollection}
                      >
                        Email collection
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.contextDeleteCollection}
                      onClick={deleteCollection}
                    >
                      Delete collection
                    </button>
                  </div>
                )}
            </div>

            {activeShelfItems.length === 0 ? (
              <div className={styles.emptyShelf}>
                <HugeiconsIcon
                  icon={HeartIcon}
                  size={28}
                  aria-hidden="true"
                />
                <strong>
                  {activeCollection === 'all'
                    ? 'Nothing saved here yet.'
                    : 'This collection is empty.'}
                </strong>
                <span>
                  {activeCollection === 'all'
                    ? 'Save media from Results or start with a ready-made collection.'
                    : 'Save media from Results or add items from All Saved.'}
                </span>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => navigateTo('search')}
                >
                  Find media
                </button>
              </div>
            ) : filteredShelf.length === 0 ? (
              <div className={styles.emptyShelf}>
                <strong>No items match this country filter.</strong>
                <span>Choose another country or All countries.</span>
              </div>
            ) : (
              <div className={styles.shelfGroups}>
                {groupedShelf.map(([code, items]) => (
                  <section
                    key={code}
                    className={styles.countryGroup}
                    aria-label={`Search: ${shelfSearchLabel(code)}`}
                  >
                    <div className={styles.countryHeader}>
                      <div>
                        <span
                          className={styles.countryDot}
                          aria-hidden="true"
                        />
                        <strong>
                          Search: {shelfSearchLabel(code)}
                        </strong>
                        <small>
                          {code === GLOBAL_SHELF_CONTEXT
                            ? 'GLOBAL'
                            : code.toUpperCase()}
                        </small>
                      </div>
                      <span>
                        {items.length}{' '}
                        {activeCollection === 'all'
                          ? 'saved'
                          : 'items'}
                      </span>
                    </div>

                    <div>
                      {items.map((item) => (
                        <article
                          key={item.id}
                          className={styles.shelfItem}
                          data-media={mediaIdentityForKind(item.kind)}
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
                            <small
                              data-media={mediaIdentityForKind(item.kind)}
                            >
                              {formatKind(item.kind)}
                            </small>
                          </div>

                          <div className={styles.shelfItemControls}>
                            {collections.some(
                              (collection) =>
                                collection.id !== activeCollection
                            ) && (
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
                                {collections
                                  .filter(
                                    (collection) =>
                                      collection.id !==
                                      activeCollection
                                  )
                                  .map((collection) => (
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
                                className={styles.removeFromCollectionButton}
                                onClick={() =>
                                  removeFromActiveCollection(
                                    item.id
                                  )
                                }
                              >
                                Remove from collection
                              </button>
                            )}

                            {activeCollection === 'all' ? (
                              <button
                                type="button"
                                onClick={() =>
                                  toggleFavourite(item)
                                }
                              >
                                Remove
                              </button>
                            ) : (
                              favourites.some(
                                (saved) => saved.id === item.id
                              ) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleFavourite(item)
                                  }
                                >
                                  Remove from All Saved
                                </button>
                              )
                            )}
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

      {(sharedCollectionPreview || sharedCollectionError) && (
        <div
          className={styles.sharedPreviewBackdrop}
          role="presentation"
        >
          <section
            ref={sharedPreviewDialogRef}
            className={styles.sharedPreviewDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shared-collection-preview-title"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeSharedCollectionPreview();
                return;
              }

              trapDialogFocus(event, event.currentTarget);
            }}
          >
            <div className={styles.sharedPreviewHeading}>
              <div>
                <p className={styles.eyebrow}>
                  Shared collection
                </p>
                <h2 id="shared-collection-preview-title">
                  {sharedCollectionPreview
                    ? sharedCollectionPreview.name
                    : 'Unable to preview collection'}
                </h2>
                {sharedCollectionPreview && (
                  <span>
                    {sharedCollectionPreview.items.length} item
                    {sharedCollectionPreview.items.length === 1
                      ? ''
                      : 's'}{' '}
                    · preview only
                  </span>
                )}
              </div>
              <button
                type="button"
                data-dialog-initial-focus
                className={styles.sharedPreviewClose}
                aria-label="Close shared collection preview"
                onClick={closeSharedCollectionPreview}
              >
                ×
              </button>
            </div>

            {sharedCollectionError ? (
              <div className={styles.sharedPreviewError}>
                <strong>Collection link could not be opened.</strong>
                <span>{sharedCollectionError}</span>
                <span>
                  Your existing Shelf has not been changed.
                </span>
              </div>
            ) : (
              <>
                <div className={styles.sharedPreviewItems}>
                  {sharedCollectionPreview?.items.map((item) => (
                    <article
                      key={`shared-preview-${item.id}`}
                      className={styles.sharedPreviewItem}
                      data-media={mediaIdentityForKind(item.kind)}
                    >
                      {item.artworkUrl ? (
                        <img
                          src={appleArtwork(item.artworkUrl, 180)}
                          alt=""
                        />
                      ) : (
                        <div
                          className={styles.sharedPreviewArtworkFallback}
                          aria-hidden="true"
                        />
                      )}
                      <div>
                        <span
                          className={styles.kind}
                          data-media={mediaIdentityForKind(item.kind)}
                          data-kind={item.kind}
                        >
                          {formatKind(item.kind)}
                        </span>
                        <strong>{item.title}</strong>
                        <small>{item.artist}</small>
                      </div>
                      {item.sourceUrl && (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View Source
                        </a>
                      )}
                    </article>
                  ))}
                </div>

                <div className={styles.sharedPreviewActions}>
                  <button
                    type="button"
                    className={styles.sharedPreviewCancel}
                    onClick={closeSharedCollectionPreview}
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    className={styles.sharedPreviewImport}
                    onClick={importSharedCollection}
                  >
                    Add collection to My Shelf
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {emailModalOpen && (
        <div
          className={styles.emailModalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEmailModalOpen(false);
            }
          }}
        >
          <section
            ref={emailModalRef}
            className={styles.emailModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-collection-title"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setEmailModalOpen(false);
                return;
              }

              trapDialogFocus(event, event.currentTarget);
            }}
          >
            <div className={styles.emailModalHeading}>
              <div>
                <p className={styles.eyebrow}>
                  Share collection
                </p>
                <h2 id="email-collection-title">
                  Email collection
                </h2>
              </div>
              <button
                type="button"
                className={styles.emailModalClose}
                aria-label="Close email collection"
                onClick={() => setEmailModalOpen(false)}
              >
                ×
              </button>
            </div>

            <div className={styles.emailModalFields}>
              <label>
                <span>To</span>
                <input
                  data-dialog-initial-focus
                  type="email"
                  value={emailTo}
                  placeholder="name@example.com"
                  autoComplete="email"
                  onChange={(event) =>
                    setEmailTo(event.target.value)
                  }
                />
              </label>

              <label>
                <span>Subject</span>
                <input
                  type="text"
                  value={emailSubject}
                  maxLength={160}
                  onChange={(event) =>
                    setEmailSubject(event.target.value)
                  }
                />
              </label>

              <label>
                <span>Message</span>
                <textarea
                  value={emailMessage}
                  rows={4}
                  maxLength={800}
                  onChange={(event) =>
                    setEmailMessage(event.target.value)
                  }
                />
              </label>

              <div className={styles.emailModalLinkPreview}>
                <strong>Collection link included</strong>
                <span>
                  {emailCollectionItems.length} item
                  {emailCollectionItems.length === 1
                    ? ''
                    : 's'}{' '}
                  will be attached to the MediaShelf share link.
                </span>
              </div>
            </div>

            <div className={styles.emailModalActions}>
              <button
                type="button"
                className={styles.emailModalCancel}
                onClick={() => setEmailModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.emailModalSend}
                disabled={
                  !emailTo.trim() ||
                  !emailSubject.trim()
                }
                onClick={submitCollectionEmail}
              >
                Continue to email
              </button>
            </div>
          </section>
        </div>
      )}

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
            ref={confirmDialogRef}
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mediashelf-confirm-title"
            aria-describedby="mediashelf-confirm-message"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setConfirmDialog(null);
                return;
              }

              trapDialogFocus(event, event.currentTarget);
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
                data-dialog-initial-focus
                className={styles.confirmCancelButton}
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
                toast.includes('Added') ||
                toast.startsWith('Collection created')
                  ? CheckmarkCircle02Icon
                  : HeartIcon
              }
              size={20}
              aria-hidden="true"
            />
            <span>{toast}</span>
            {(toast.includes('Saved') ||
              toast.startsWith('Collection added')) && (
              <button
                type="button"
                onClick={() => navigateTo('saved')}
              >
                View shelf
              </button>
            )}
            {toast.startsWith('Collection created') && (
              <button
                type="button"
                data-open-created-collection="true"
                onClick={() => {
                  setToast('');

                  if (routeView === 'saved') {
                    document
                      .getElementById('saved')
                      ?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                    return;
                  }

                  navigateTo('saved');
                }}
              >
                Open collection
              </button>
            )}
          </div>
        )}

      {showBackTop && (
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
      )}
    </div>
  );
}
