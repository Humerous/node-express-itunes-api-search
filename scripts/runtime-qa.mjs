import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 3100;
const CDP_PORT = 9238;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME =
  process.env.MEDIASHELF_CHROME ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHttp(url, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForCdp(attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const pages = await fetch(
        `http://127.0.0.1:${CDP_PORT}/json/list`
      ).then((response) => response.json());

      const page = pages.find(
        (item) =>
          item.type === 'page' &&
          (item.url.includes(`127.0.0.1:${PORT}`) ||
            item.url.includes(`localhost:${PORT}`))
      );

      if (page?.webSocketDebuggerUrl) {
        return page;
      }
    } catch {
      // Chrome is still starting.
    }

    await sleep(250);
  }

  throw new Error('Timed out waiting for MediaShelf Chrome target.');
}

function connect(webSocketUrl) {
  const ws = new WebSocket(webSocketUrl);
  let id = 1;
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (!message.id || !pending.has(message.id)) {
      return;
    }

    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);

    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });

  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  async function send(method, params = {}) {
    await opened;

    return new Promise((resolve, reject) => {
      const commandId = id++;
      pending.set(commandId, { resolve, reject });
      ws.send(
        JSON.stringify({
          id: commandId,
          method,
          params,
        })
      );
    });
  }

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text
      );
    }

    return result.result.value;
  }

  return { ws, send, evaluate };
}

async function waitForRoute(evaluate, pathname, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const ready = await evaluate(`
        (() => ({
          pathname: location.pathname,
          ready:
            document.readyState === 'complete' &&
            Boolean(document.querySelector('#main-content'))
        }))()
      `);

      if (ready.pathname === pathname && ready.ready) {
        return;
      }
    } catch {
      // Navigation can briefly invalidate the execution context.
    }

    await sleep(100);
  }

  throw new Error(`Timed out waiting for route ${pathname}.`);
}

async function navigate(send, evaluate, pathname) {
  await send('Page.navigate', {
    url: `${BASE_URL}${pathname}`,
  });
  await waitForRoute(evaluate, pathname);
}

async function clickDesktopNav(evaluate, label) {
  await evaluate(`
    (() => {
      const nav = document.querySelector('[data-site-header] nav');
      const button = Array.from(nav?.querySelectorAll('button') ?? [])
        .find((item) => item.textContent?.includes(${JSON.stringify(label)}));

      if (!button) {
        throw new Error('Navigation button missing: ' + ${JSON.stringify(label)});
      }

      button.click();
      return true;
    })()
  `);
}

function fixtures() {
  return [
    {
      id: 'qa:1',
      title: 'QA One',
      artist: 'MediaShelf QA',
      collection: '',
      genre: 'Test',
      kind: 'movie',
      artworkUrl: '',
      sourceUrl: 'https://example.com/1',
      storefront: 'za',
    },
    {
      id: 'qa:2',
      title: 'QA Two',
      artist: 'MediaShelf QA',
      collection: '',
      genre: 'Test',
      kind: 'music',
      artworkUrl: '',
      sourceUrl: 'https://example.com/2',
      storefront: 'gb',
    },
  ];
}

const profile = await mkdtemp(
  join(tmpdir(), 'mediashelf-v2-qa-')
);

const dev = spawn('npm', ['run', 'dev', '--', '-p', String(PORT)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
});

let chrome;

try {
  await waitForHttp(BASE_URL);

  chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      BASE_URL,
    ],
    { stdio: 'ignore' }
  );

  const page = await waitForCdp();
  const { ws, send, evaluate } = connect(page.webSocketDebuggerUrl);

  await send('Runtime.enable');
  await send('Page.enable');
  await waitForRoute(evaluate, '/');

  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (() => {
        const realFetch = window.fetch.bind(window);

        window.fetch = async (input, init) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof Request
                ? input.url
                : String(input);

          if (url.includes('/api/search?')) {
            const parsed = new URL(url, location.origin);
            const storefront = parsed.searchParams.get('storefront') ?? 'za';
            const term = parsed.searchParams.get('term') ?? 'QA';

            return new Response(
              JSON.stringify({
                count: 1,
                results: [
                  {
                    id: 'qa-global:' + storefront,
                    title: term + ' ' + storefront.toUpperCase(),
                    artist: 'MediaShelf QA',
                    collection: '',
                    genre: 'Test',
                    kind: 'music',
                    artworkUrl: '',
                    sourceUrl: 'https://example.com/' + storefront,
                    storefront,
                  },
                ],
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }

          return realFetch(input, init);
        };
      })();
    `,
  });

  const routeCases = [
    ['/', 'search', 'Search'],
    ['/results', 'results', 'Results'],
    ['/shelf', 'saved', 'Your Shelf'],
  ];

  for (const [pathname, sectionId, navLabel] of routeCases) {
    await navigate(send, evaluate, pathname);

    const route = await evaluate(`
      (() => {
        const expected = ${JSON.stringify(sectionId)};
        const ids = ['search', 'results', 'saved'];
        const counts = Object.fromEntries(
          ids.map((id) => [
            id,
            document.querySelectorAll('#' + id).length,
          ])
        );
        const active = document.querySelector(
          '[data-site-header] nav button[aria-current="page"]'
        );

        return {
          counts,
          active: active?.textContent?.trim() ?? '',
          h1Count: document.querySelectorAll('#main-content h1').length,
          skipHref:
            document.querySelector('a[href="#main-content"]')
              ?.getAttribute('href') ?? '',
          overflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
          expected,
        };
      })()
    `);

    if (
      route.counts[sectionId] !== 1 ||
      Object.entries(route.counts).some(
        ([id, count]) => id !== sectionId && count !== 0
      )
    ) {
      throw new Error(
        `Three-route structure failed on ${pathname}: ${JSON.stringify(route.counts)}`
      );
    }

    if (!route.active.includes(navLabel)) {
      throw new Error(
        `aria-current failed on ${pathname}: ${route.active}`
      );
    }

    if (route.h1Count !== 1 || route.skipHref !== '#main-content') {
      throw new Error(
        `Accessibility structure failed on ${pathname}: ${JSON.stringify(route)}`
      );
    }

    if (route.overflow) {
      throw new Error(`Desktop horizontal overflow on ${pathname}.`);
    }
  }

  console.log('THREE-ROUTE STRUCTURE — PASS');
  console.log('ROUTE HEADING / SKIP LINK — PASS');
  console.log('DESKTOP BOX MODEL — PASS');

  await navigate(send, evaluate, '/');
  await clickDesktopNav(evaluate, 'Results');
  await waitForRoute(evaluate, '/results');
  await clickDesktopNav(evaluate, 'Your Shelf');
  await waitForRoute(evaluate, '/shelf');
  await clickDesktopNav(evaluate, 'Search');
  await waitForRoute(evaluate, '/');
  console.log('ROUTE NAVIGATION — PASS');

  await evaluate(`
    (() => {
      localStorage.setItem(
        'mediashelf:v2:favourites',
        ${JSON.stringify(JSON.stringify(fixtures()))}
      );
      localStorage.setItem('mediashelf:v2:collections', '[]');
      return true;
    })()
  `);

  await navigate(send, evaluate, '/shelf');

  const shelf = await evaluate(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('#saved button'));
      const buttonTexts = buttons.map((button) => button.textContent?.trim());
      const deleteSelected = buttons.find((button) =>
        button.textContent?.includes('Delete selected')
      );

      return {
        removeAll: Boolean(document.querySelector('#saved [data-remove-all]')),
        selectAll: buttonTexts.includes('Select all'),
        deleteSelected: Boolean(deleteSelected),
        deleteSelectedDisabled: deleteSelected?.disabled ?? false,
        filterCountry: Array.from(document.querySelectorAll('#saved label')).some(
          (label) => label.textContent?.includes('Filter country')
        ),
        checkboxes: document.querySelectorAll(
          '#saved input[type="checkbox"]'
        ).length,
      };
    })()
  `);

  if (
    !shelf.removeAll ||
    !shelf.selectAll ||
    !shelf.deleteSelected ||
    !shelf.deleteSelectedDisabled ||
    !shelf.filterCountry ||
    shelf.checkboxes !== 2
  ) {
    throw new Error(
      `Shelf bulk controls failed: ${JSON.stringify(shelf)}`
    );
  }

  const removeAll = await evaluate(`
    (async () => {
      const wait = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      const button = document.querySelector('#saved [data-remove-all]');
      if (!button) throw new Error('Remove all button missing.');

      button.click();
      await wait(30);

      const firstDialog = document.querySelector('[role="alertdialog"]');
      const cancelButton = Array.from(
        firstDialog?.querySelectorAll('button') ?? []
      ).find((item) => item.textContent?.trim() === 'Cancel');

      const dialogPresented = Boolean(firstDialog && cancelButton);
      const beforeCancel = JSON.parse(
        localStorage.getItem('mediashelf:v2:favourites') ?? '[]'
      ).length;

      cancelButton?.click();
      await wait(30);

      const afterCancel = JSON.parse(
        localStorage.getItem('mediashelf:v2:favourites') ?? '[]'
      ).length;
      const dialogClosedAfterCancel = !document.querySelector(
        '[role="alertdialog"]'
      );

      button.click();
      await wait(30);

      const secondDialog = document.querySelector('[role="alertdialog"]');
      const confirmButton = secondDialog?.querySelector(
        '[data-confirm-action]'
      );

      confirmButton?.click();
      await wait(30);

      const afterConfirm = JSON.parse(
        localStorage.getItem('mediashelf:v2:favourites') ?? '[]'
      ).length;

      return {
        dialogPresented,
        beforeCancel,
        afterCancel,
        dialogClosedAfterCancel,
        afterConfirm,
      };
    })()
  `);

  if (
    !removeAll.dialogPresented ||
    removeAll.beforeCancel !== 2 ||
    removeAll.afterCancel !== 2 ||
    !removeAll.dialogClosedAfterCancel ||
    removeAll.afterConfirm !== 0
  ) {
    throw new Error(
      `Remove all confirmation failed: ${JSON.stringify(removeAll)}`
    );
  }

  console.log('SHELF BULK CONTROLS — PASS');
  console.log('REMOVE ALL CONFIRMATION — PASS');

  await navigate(send, evaluate, '/');

  await evaluate(`
    (() => {
      const searchLabel = Array.from(document.querySelectorAll('#search label'))
        .find((label) => label.textContent?.trim().startsWith('Search'));
      const storefrontLabel = Array.from(document.querySelectorAll('#search label'))
        .find((label) => label.textContent?.includes('Storefront'));
      const input = searchLabel?.querySelector('input[type="search"]');
      const select = storefrontLabel?.querySelector('select');
      const form = document.querySelector('#search form');

      if (!input || !select || !form) {
        throw new Error('Search controls missing for global handoff QA.');
      }

      const setNativeValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set;
      setNativeValue?.call(input, 'QA Global');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      select.value = 'all';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      // Return control to CDP before the full-route submit invalidates
      // the current execution context. The existing route waiter then
      // observes the navigation and continues the handoff assertions.
      window.setTimeout(() => form.requestSubmit(), 75);
      return true;
    })()
  `);

  await waitForRoute(evaluate, '/results');

  let globalHandoff;
  for (let index = 0; index < 40; index += 1) {
    globalHandoff = await evaluate(`
      (() => ({
        pathname: location.pathname,
        progress: Boolean(document.querySelector('progress[aria-label="Global search progress"]')),
        scanText: document.querySelector('#results')?.textContent?.includes('Apple storefronts scanned') ?? false,
        pauseVisible: Array.from(document.querySelectorAll('#results button')).some(
          (button) => button.textContent?.trim() === 'Pause'
        ),
      }))()
    `);

    if (globalHandoff.progress && globalHandoff.scanText) {
      break;
    }

    await sleep(100);
  }

  if (
    globalHandoff?.pathname !== '/results' ||
    !globalHandoff.progress ||
    !globalHandoff.scanText
  ) {
    throw new Error(
      `All Countries route handoff failed: ${JSON.stringify(globalHandoff)}`
    );
  }

  await evaluate(`
    (() => {
      const pause = Array.from(document.querySelectorAll('#results button'))
        .find((button) => button.textContent?.trim() === 'Pause');
      pause?.click();
      return true;
    })()
  `);

  console.log('ALL COUNTRIES ROUTE HANDOFF — PASS');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate(send, evaluate, '/');

  const mobile = await evaluate(`
    (() => {
      const button = document.querySelector(
        'button[aria-label*="navigation" i]'
      );
      const style = button ? getComputedStyle(button) : null;

      return {
        overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
        menuVisible:
          Boolean(button) &&
          style?.display !== 'none' &&
          style?.visibility !== 'hidden',
      };
    })()
  `);

  if (mobile.overflow) {
    throw new Error('Mobile horizontal overflow detected.');
  }

  if (!mobile.menuVisible) {
    throw new Error('Mobile navigation control is not visible.');
  }

  console.log('MOBILE BOX MODEL — PASS');
  console.log('MOBILE NAVIGATION — PASS');
  console.log('RUNTIME UI QA — PASS');

  ws.close();
} finally {
  if (chrome && !chrome.killed) {
    chrome.kill('SIGTERM');
  }

  if (!dev.killed) {
    dev.kill('SIGTERM');
  }

  await sleep(500);

  try {
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 200,
    });
  } catch (error) {
    console.warn(
      'QA temp-profile cleanup warning:',
      error instanceof Error ? error.message : error
    );
  }
}
