import type { MediaValue } from '@/lib/media';

export interface MediaItem {
  id: string;
  title: string;
  artist: string;
  collection: string;
  genre: string;
  kind: string;
  artworkUrl: string;
  sourceUrl: string;
  storefront: string;
}

export interface SearchResponse {
  count: number;
  results: MediaItem[];
}

export interface RecentSearch {
  term: string;
  media: MediaValue;
  storefront: string;
}

export interface ShelfCollection {
  id: string;
  name: string;
  itemIds: string[];
}

export interface GlobalScanState {
  completedCodes: string[];
  total: number;
  complete: boolean;
  cancelled: boolean;
}

export interface SearchSnapshot {
  version: 2;
  term: string;
  media: MediaValue;
  storefront: string;
  results: MediaItem[];
  scan: GlobalScanState | null;
  timestamp: number;
}
