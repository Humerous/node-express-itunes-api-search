const url =
  'https://itunes.apple.com/search?term=David%20Bowie&country=ZA&limit=1';

console.log('Apple iTunes Search API smoke test');
console.log(`GET ${url}`);

const response = await fetch(url, {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'MediaShelf/2.0',
  },
});

if (!response.ok) {
  throw new Error(
    `Apple API returned HTTP ${response.status} ${response.statusText}`
  );
}

const payload = await response.json();

if (
  typeof payload.resultCount !== 'number' ||
  !Array.isArray(payload.results)
) {
  throw new Error('Apple API returned an unexpected response structure');
}

console.log(`HTTP ${response.status}`);
console.log(`resultCount: ${payload.resultCount}`);
console.log('REAL APPLE API SMOKE — PASS');
