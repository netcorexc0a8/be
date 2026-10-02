import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Генерирует sw.js со списком всех файлов сборки, чтобы приложение
 * целиком сохранялось на телефоне и работало без интернета.
 */
function serviceWorker(): Plugin {
  return {
    name: 'offline-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicFiles = readdirSync(new URL('./public', import.meta.url));
      const files = [...new Set(['./', 'index.html', ...Object.keys(bundle), ...publicFiles])].filter(
        (f) => !f.endsWith('.map'),
      );
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: SW_SOURCE.replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files)),
      });
    },
  };
}

const SW_SOURCE = `// Создано при сборке, не редактировать вручную.
const CACHE = 'formula-calculator-__VERSION__';
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Страница: сначала сеть (чтобы сразу видеть новую версию), без сети или при медленной сети — сохранённая копия.
async function freshPage(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request, { cache: 'no-cache' }).then((response) => {
    if (response.ok) cache.put('index.html', response.clone());
    return response;
  });
  network.catch(() => {});
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
  } catch {
    // нет сети
  }
  return (await cache.match('index.html')) || network;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(freshPage(request));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)));
});
`;

export default defineConfig({
  // относительные пути: приложение работает и на GitHub Pages (/be/), и локально
  base: './',
  plugins: [serviceWorker()],
});
