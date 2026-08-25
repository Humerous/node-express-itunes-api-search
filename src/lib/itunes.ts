import type { MediaItem } from '@/types/media';

interface ItunesResult {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  collectionId?: number;
  artistId?: number;
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  primaryGenreName?: string;
  artworkUrl30?: string;
  artworkUrl60?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  collectionViewUrl?: string;
  artistViewUrl?: string;
}

export function normalizeItunesResults(
  results: ItunesResult[],
  storefront: string
): MediaItem[] {
  return results
    .map((item, index) => {
      const rawId =
        item.trackId ??
        item.collectionId ??
        item.artistId ??
        `${storefront}-${index}`;

      const wrapper = item.wrapperType ?? item.kind ?? 'media';

      return {
        id: `${wrapper}:${rawId}`,
        title:
          item.trackName ??
          item.collectionName ??
          item.artistName ??
          'Untitled',
        artist: item.artistName ?? 'Unknown artist',
        collection: item.collectionName ?? '',
        genre: item.primaryGenreName ?? '',
        kind: item.kind ?? item.wrapperType ?? 'media',
        artworkUrl:
          item.artworkUrl100 ??
          item.artworkUrl60 ??
          item.artworkUrl30 ??
          '',
        sourceUrl:
          item.trackViewUrl ??
          item.collectionViewUrl ??
          item.artistViewUrl ??
          '',
        storefront,
      };
    })
    .filter((item) => item.sourceUrl || item.artworkUrl);
}

export function appleArtwork(url: string, size: number) {
  if (!url) {
    return '';
  }

  return url
    .replace(/\d+x\d+bb/g, `${size}x${size}bb`)
    .replace(/\d+x\d+-\d+/g, `${size}x${size}-${size}`);
}
