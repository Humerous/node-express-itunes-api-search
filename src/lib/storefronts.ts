import {
  appleStorefronts,
  type AppleStorefront,
} from '@/lib/storefronts.generated';

export const ALL_COUNTRIES = 'all';

export const regionOrder = [
  'United States and Canada',
  'Latin America and the Caribbean',
  'Europe, Russia, and Central Asia',
  'Africa',
  'Asia-Pacific',
  'Middle East and Türkiye',
] as const;

export function isStorefrontCode(value: string) {
  return appleStorefronts.some((item) => item.code === value);
}

export function storefrontLabel(value: string) {
  if (value === ALL_COUNTRIES) {
    return 'All Countries';
  }

  return (
    appleStorefronts.find((item) => item.code === value)?.label ??
    value.toUpperCase()
  );
}

export const storefrontGroups = regionOrder
  .map((region) => ({
    region,
    items: appleStorefronts
      .filter((item) => item.region === region)
      .sort((a, b) => a.label.localeCompare(b.label)),
  }))
  .filter((group) => group.items.length > 0);

export function orderedGlobalStorefronts(
  preferred = 'za'
): AppleStorefront[] {
  const preferredItem = appleStorefronts.find(
    (item) => item.code === preferred
  );

  const remaining = appleStorefronts
    .filter((item) => item.code !== preferred)
    .sort((a, b) => {
      const regionDelta =
        regionOrder.indexOf(a.region as (typeof regionOrder)[number]) -
        regionOrder.indexOf(b.region as (typeof regionOrder)[number]);

      return regionDelta || a.label.localeCompare(b.label);
    });

  return preferredItem ? [preferredItem, ...remaining] : remaining;
}

export { appleStorefronts };
