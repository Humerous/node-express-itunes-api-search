import { NextRequest, NextResponse } from 'next/server';
import { isMediaValue } from '@/lib/media';
import { normalizeItunesResults } from '@/lib/itunes';
import { isStorefrontCode } from '@/lib/storefronts';

export const dynamic = 'force-dynamic';

function parseLimit(value: string | null) {
  const parsed = Number(value ?? '50');

  if (!Number.isFinite(parsed)) {
    return 50;
  }

  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  const term = request.nextUrl.searchParams.get('term')?.trim() ?? '';
  const media = request.nextUrl.searchParams.get('media') ?? 'all';
  const storefront = request.nextUrl.searchParams.get('storefront') ?? 'za';
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));

  if (!term || term.length > 200) {
    return NextResponse.json(
      { error: 'Enter a search term between 1 and 200 characters.' },
      { status: 400 }
    );
  }

  if (!isMediaValue(media)) {
    return NextResponse.json(
      { error: 'Unsupported media type.' },
      { status: 400 }
    );
  }

  if (!isStorefrontCode(storefront)) {
    return NextResponse.json(
      { error: 'Unsupported Apple storefront.' },
      { status: 400 }
    );
  }

  const upstreamLimit = media === 'movie' ? 100 : limit;

  const params = new URLSearchParams({
    term,
    country: storefront.toUpperCase(),
    limit: String(upstreamLimit),
    media: media === 'movie' ? 'all' : media,
  });

  // Apple's dedicated Movie search is currently returning false-empty
  // responses for terms that do return kind="feature-movie" records through
  // the all-media endpoint. Use one broader Apple request for Movie and
  // filter locally so the client-facing MediaShelf value remains "movie"
  // without doubling Apple requests.

  try {
    const response = await fetch(
      `https://itunes.apple.com/search?${params.toString()}`,
      {
        signal: AbortSignal.timeout(10_000),
        next: {
          revalidate: 900,
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            response.status === 429
              ? 'Apple search rate limit reached. Try again shortly.'
              : 'Apple search is temporarily unavailable.',
        },
        { status: response.status === 429 ? 429 : 502 }
      );
    }

    const payload = (await response.json()) as {
      resultCount?: number;
      results?: unknown[];
    };

    const appleResults = payload.results ?? [];
    const mediaResults =
      media === 'movie'
        ? appleResults.filter((item) => {
            if (!item || typeof item !== 'object') {
              return false;
            }

            return (item as { kind?: unknown }).kind === 'feature-movie';
          })
        : appleResults;

    const normalized = normalizeItunesResults(
      mediaResults as never[],
      storefront
    ).slice(0, limit);

    return NextResponse.json(
      {
        count: normalized.length,
        results: normalized,
      },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=900, stale-while-revalidate=1800',
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === 'TimeoutError'
        ? 'Apple search timed out. Try again.'
        : 'Unable to reach Apple search. Try again.';

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
