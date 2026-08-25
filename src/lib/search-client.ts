import type { MediaValue } from '@/lib/media';
import type { MediaItem, SearchResponse } from '@/types/media';

const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheRecord {
  timestamp: number;
  response: SearchResponse;
}

function cacheKey(term: string, media: MediaValue, storefront: string) {
  return [
    'mediashelf:v2:country-cache',
    encodeURIComponent(term.trim().toLowerCase()),
    media,
    storefront,
  ].join(':');
}

export function readCountryCache(
  term: string,
  media: MediaValue,
  storefront: string
): SearchResponse | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(
    cacheKey(term, media, storefront)
  );

  if (!raw) {
    return null;
  }

  try {
    const record = JSON.parse(raw) as CacheRecord;

    if (Date.now() - record.timestamp > CACHE_TTL_MS) {
      window.sessionStorage.removeItem(
        cacheKey(term, media, storefront)
      );
      return null;
    }

    return record.response;
  } catch {
    window.sessionStorage.removeItem(
      cacheKey(term, media, storefront)
    );
    return null;
  }
}

function writeCountryCache(
  term: string,
  media: MediaValue,
  storefront: string,
  response: SearchResponse
) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(
      cacheKey(term, media, storefront),
      JSON.stringify({
        timestamp: Date.now(),
        response,
      } satisfies CacheRecord)
    );
  } catch {
    // Search still works when browser storage is full or unavailable.
  }
}

export async function searchCountry({
  term,
  media,
  storefront,
  signal,
  limit = 100,
}: {
  term: string;
  media: MediaValue;
  storefront: string;
  signal: AbortSignal;
  limit?: number;
}) {
  const cached = readCountryCache(term, media, storefront);

  if (cached) {
    return {
      response: cached,
      fromCache: true,
    };
  }

  const params = new URLSearchParams({
    term,
    media,
    storefront,
    limit: String(limit),
  });

  const response = await fetch(`/api/search?${params.toString()}`, {
    signal,
  });

  const payload = (await response.json()) as
    | SearchResponse
    | { error?: string };

  if (!response.ok || !('results' in payload)) {
    throw new Error(
      'error' in payload && payload.error
        ? payload.error
        : 'Search failed.'
    );
  }

  writeCountryCache(term, media, storefront, payload);

  return {
    response: payload,
    fromCache: false,
  };
}

export function mergeUniqueResults(
  current: MediaItem[],
  incoming: MediaItem[],
  maxItems = 800
) {
  const map = new Map<string, MediaItem>();

  for (const item of current) {
    map.set(item.id, item);
  }

  for (const item of incoming) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }

    if (map.size >= maxItems) {
      break;
    }
  }

  return Array.from(map.values());
}
