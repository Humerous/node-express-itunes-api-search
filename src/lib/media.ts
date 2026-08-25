export const mediaTypes = [
  { value: 'all', label: 'All' },
  { value: 'music', label: 'Music' },
  { value: 'audiobook', label: 'Audiobooks' },
  { value: 'musicVideo', label: 'Music Videos' },
  { value: 'movie', label: 'Movies' },
  { value: 'tvShow', label: 'TV Shows' },
  { value: 'podcast', label: 'Podcasts' },
  { value: 'ebook', label: 'eBooks' },
] as const;

export type MediaValue = (typeof mediaTypes)[number]['value'];

export function isMediaValue(value: string): value is MediaValue {
  return mediaTypes.some((item) => item.value === value);
}

export function mediaLabel(value: string) {
  return mediaTypes.find((item) => item.value === value)?.label ?? 'All';
}
