const CACHE_NAME = 'sunday-v3.0';

const ASSETS_TO_CACHE = [
  './',
  './SunDay-v3.html',
  './css/main.css',
  './css/dashboard.css',
  './css/attendance.css',
  './css/assignment.css',
  './js/xlsx-loader.js',
  './js/data-attendance.js',
  './js/data-assignment.js',
  './js/calc.js',
  './js/bridge.js',
  './js/scheduler.js',
  './js/company.js',
  './js/ui-dashboard.js',
  './js/ui-attendance.js',
  './js/ui-assignment.js',
  './js/ui-settings.js',
  './js/export.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './manifest.json'
];

// התקנה - שמירת כל הקבצים במטמון
self.addEventListener('install', event => {
  console.log('☀️ SunDay SW: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('☀️ SunDay SW: Caching assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// הפעלה - ניקוי מטמון ישן
self.addEventListener('activate', event => {
  console.log('☀️ SunDay SW: Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// בקשות רשת - אסטרטגיית "Network First, Cache Fallback"
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ספריית XLSX - תמיד מהרשת (CDN)
  if (url.hostname !== location.hostname) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // שמור עותק במטמון
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // קבצים מקומיים - נסה רשת קודם, אם נכשל - מטמון
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then(cached => {
            if (cached) return cached;
            // דף ברירת מחדל אם אין כלום
            if (event.request.destination === 'document') {
              return caches.match('./SunDay-v3.html');
            }
          });
      })
  );
});