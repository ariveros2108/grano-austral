/**
 * Métricas del lado servidor para el análisis de desempeño (Fase 2).
 * - Mide el tiempo de respuesta de cada petición y lo agrega por ruta.
 * - Calcula promedio, mediana y percentiles p90/p95/p99 sobre una ventana de las últimas N muestras.
 * - Cuenta respuestas 4xx/5xx (tasa de error) y calcula throughput (req/s).
 * - Expone uso de CPU, memoria y retardo del event loop del proceso Node.
 * Además agrega la cabecera Server-Timing, visible en las DevTools del navegador.
 */
const { monitorEventLoopDelay } = require('perf_hooks');

const VENTANA = 5000; // muestras guardadas por ruta
const inicio = Date.now();
const rutas = new Map(); // clave "GET /productos" -> { n, err4, err5, suma, muestras: [] }
const global = { n: 0, err4: 0, err5: 0, muestras: [], ultimos: [] }; // ultimos = timestamps para req/s

const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();

let cpuPrevio = process.cpuUsage();
let tiempoPrevio = process.hrtime.bigint();

function registrar(clave, ms, status) {
  let r = rutas.get(clave);
  if (!r) { r = { n: 0, err4: 0, err5: 0, suma: 0, muestras: [] }; rutas.set(clave, r); }
  for (const obj of [r, global]) {
    obj.n++;
    if (status >= 500) obj.err5++;
    else if (status >= 400) obj.err4++;
    obj.muestras.push(ms);
    if (obj.muestras.length > VENTANA) obj.muestras.shift();
  }
  r.suma += ms;
  const ahora = Date.now();
  global.ultimos.push(ahora);
  while (global.ultimos.length && global.ultimos[0] < ahora - 60000) global.ultimos.shift();
}

/** Middleware Express: mide la duración de cada respuesta. */
function middleware(req, res, next) {
  const t0 = process.hrtime.bigint();
  const writeHead = res.writeHead;
  res.writeHead = function (...args) {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (!res.getHeader('Server-Timing')) res.setHeader('Server-Timing', `app;dur=${ms.toFixed(1)}`);
    return writeHead.apply(this, args);
  };
  res.on('finish', () => {
    if (req.path.startsWith('/css') || req.path.startsWith('/js') || req.path === '/favicon.svg') return;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    // Se agrupa por patrón de ruta (ej: /producto/:slug) para no generar una clave por producto
    const patron = req.route ? req.baseUrl + req.route.path : req.path.startsWith('/img/') ? '/img/*' : 'otras';
    registrar(`${req.method} ${patron}`, ms, res.statusCode);
  });
  next();
}

function percentil(ordenadas, p) {
  if (!ordenadas.length) return 0;
  const idx = Math.min(ordenadas.length - 1, Math.ceil((p / 100) * ordenadas.length) - 1);
  return ordenadas[Math.max(0, idx)];
}

function resumen(muestras) {
  const o = [...muestras].sort((a, b) => a - b);
  const prom = o.length ? o.reduce((a, b) => a + b, 0) / o.length : 0;
  const r = (x) => Math.round(x * 10) / 10;
  return { promedio: r(prom), mediana: r(percentil(o, 50)), p90: r(percentil(o, 90)), p95: r(percentil(o, 95)), p99: r(percentil(o, 99)), max: r(o[o.length - 1] || 0) };
}

function usoCpu() {
  const ahora = process.hrtime.bigint();
  const uso = process.cpuUsage(cpuPrevio);
  const transcurridoUs = Number(ahora - tiempoPrevio) / 1000;
  cpuPrevio = process.cpuUsage();
  tiempoPrevio = ahora;
  return transcurridoUs > 0 ? Math.round(((uso.user + uso.system) / transcurridoUs) * 1000) / 10 : 0;
}

function instantanea() {
  const mem = process.memoryUsage();
  const mb = (b) => Math.round((b / 1048576) * 10) / 10;
  const ahora = Date.now();
  const ult10 = global.ultimos.filter((t) => t >= ahora - 10000).length;
  return {
    timestamp: new Date().toISOString(),
    uptime_s: Math.round((ahora - inicio) / 1000),
    proceso: {
      cpu_pct_desde_ultima_lectura: usoCpu(),
      memoria_mb: { rss: mb(mem.rss), heap_usado: mb(mem.heapUsed), heap_total: mb(mem.heapTotal) },
      event_loop_ms: {
        promedio: Math.round((eventLoop.mean / 1e6) * 10) / 10,
        p99: Math.round((eventLoop.percentile(99) / 1e6) * 10) / 10,
        max: Math.round((eventLoop.max / 1e6) * 10) / 10,
      },
    },
    global: {
      peticiones: global.n,
      throughput_rps_10s: Math.round((ult10 / 10) * 10) / 10,
      throughput_rps_60s: Math.round((global.ultimos.length / 60) * 10) / 10,
      tasa_error_pct: global.n ? Math.round(((global.err4 + global.err5) / global.n) * 1000) / 10 : 0,
      errores_4xx: global.err4,
      errores_5xx: global.err5,
      latencia_ms: resumen(global.muestras),
    },
    rutas: Object.fromEntries(
      [...rutas.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([k, r]) => [k, { peticiones: r.n, errores_4xx: r.err4, errores_5xx: r.err5, latencia_ms: resumen(r.muestras) }])
    ),
  };
}

function reiniciar() {
  rutas.clear();
  Object.assign(global, { n: 0, err4: 0, err5: 0, muestras: [], ultimos: [] });
  eventLoop.reset();
}

module.exports = { middleware, instantanea, reiniciar };
