/**
 * Generador de tráfico con NAVEGADOR REAL (k6/browser + Chromium/Edge sin ventana).
 *
 * A diferencia de tienda.js (HTTP puro), aquí se ejecuta el JavaScript de la página: gtag.js corre y
 * GA4 recibe sesiones, eventos de e-commerce, engagement y Core Web Vitals. Además k6 mide por su cuenta
 * los Web Vitals de cada página (browser_web_vital_lcp, _fcp, _cls, _ttfb, _inp), lo que permite comparar
 * la experiencia de usuario "sin carga" vs "con carga" (correr este script mientras tienda.js genera carga).
 *
 * Perfiles (mismos pesos que tienda.js, MIX="40,25,20,15"):
 *   navegante · buscador · abandono de carrito · comprador (usuarios carga01..50, pago simulado)
 *
 * Cada sesión entra con ?utm_source=k6-browser&utm_medium=sintetico&utm_campaign=<ETIQUETA>, para poder
 * separar (o excluir) este tráfico en GA4 por "Fuente / medio de la sesión".
 *
 * Parámetros: BASE_URL, NAVEGADORES (sesiones en paralelo, def. 3), DURACION (def. 10m), MIX,
 *             ETIQUETA (def. "sin-carga"; ej: "con-carga"), PENSAR_MIN / PENSAR_MAX (s, def. 2–6).
 * Navegador: K6_BROWSER_EXECUTABLE_PATH apunta a Chrome o Edge si no están en la ruta por defecto.
 *
 * Uso (PowerShell):
 *   $env:K6_BROWSER_EXECUTABLE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
 *   k6 run -e BASE_URL=https://grano-austral.onrender.com -e NAVEGADORES=3 -e DURACION=10m carga/k6/navegador.js
 *
 * Desempeño: cada navegador usa ~200-300 MB de RAM y CPU del PC generador; con más de 5 en paralelo el
 * propio PC puede convertirse en el cuello de botella y distorsionar los Web Vitals medidos.
 */
import { browser } from 'k6/browser';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const NAVEGADORES = Number(__ENV.NAVEGADORES || 3);
const DURACION = __ENV.DURACION || '10m';
const ETIQUETA = __ENV.ETIQUETA || 'sin-carga';
const MIX = (__ENV.MIX || '40,25,20,15').split(',').map(Number);
const PENSAR_MIN = Number(__ENV.PENSAR_MIN || 2);
const PENSAR_MAX = Number(__ENV.PENSAR_MAX || 6);
const UTM = `utm_source=k6-browser&utm_medium=sintetico&utm_campaign=${encodeURIComponent(ETIQUETA)}`;

export const options = {
  scenarios: {
    navegador: {
      executor: 'constant-vus',
      vus: NAVEGADORES,
      duration: DURACION,
      gracefulStop: '60s',
      exec: 'sesion',
      options: { browser: { type: 'chromium' } },
    },
  },
  // p75 es el percentil que usa Google para evaluar los Core Web Vitals
  summaryTrendStats: ['avg', 'med', 'p(75)', 'p(90)', 'p(95)', 'max'],
  thresholds: { checks: ['rate>0.9'] },
};

/* ---------- Métricas propias ---------- */
const sesiones = new Counter('nav_sesiones');
const vistasProducto = new Counter('nav_vistas_producto');
const agregados = new Counter('nav_agregar_carrito');
const checkouts = new Counter('nav_checkout');
const compras = new Counter('nav_compras');
const sesionOk = new Rate('nav_sesion_sin_error');

/* ---------- Datos de apoyo ---------- */
const CATEGORIAS = ['cafe-grano', 'cafe-molido', 'capsulas', 'metodos', 'accesorios', 'tazas'];
const BUSQUEDAS = ['chocolate', 'etiopia', 'Colombia', 'frutos rojos', 'molinillo', 'prensa', 'blend', 'caramelo', 'V60', 'termo', 'miel', 'kenia'];
const ORDENES = ['relevancia', 'precio_asc', 'precio_desc', 'valoracion'];
const TUESTES = ['claro', 'medio', 'oscuro'];
const COMUNAS = ['Santiago', 'Ñuñoa', 'Providencia', 'Maipú', 'La Florida', 'Puente Alto', 'San Miguel', 'Macul'];

const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];
const entre = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/** Pausa de "lectura" con scroll, como una persona revisando la página. */
async function leer(page) {
  const pasos = entre(1, 3);
  for (let i = 0; i < pasos; i++) {
    // k6/browser no implementa mouse.wheel: el scroll se hace desde la página
    await page.evaluate((y) => window.scrollBy(0, y), entre(300, 700));
    await page.waitForTimeout(((PENSAR_MAX - PENSAR_MIN) * Math.random() + PENSAR_MIN) * 1000 / pasos);
  }
}

/** Ejecuta una acción que provoca navegación y espera a que cargue la página nueva. */
async function navegar(page, accion) {
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), accion()]);
}

/** Hace clic en un elemento al azar que cumpla el selector (si existe) y espera la navegación. */
async function clicAzar(page, selector) {
  const elementos = await page.$$(selector);
  if (!elementos.length) return false;
  await navegar(page, () => azar(elementos).click());
  return true;
}

async function verProducto(page) {
  const ok = await clicAzar(page, 'main a[href^="/producto/"]');
  if (ok) vistasProducto.add(1);
  return ok;
}

async function agregarAlCarrito(page) {
  const boton = page.locator('form.agregar button[type="submit"]');
  await navegar(page, () => boton.click());
  agregados.add(1);
  return check(page, { 'agregar → carrito': (p) => p.url().includes('/carrito') });
}

/* ---------- Comportamientos ---------- */

async function navegante(page) {
  await leer(page);
  await clicAzar(page, 'nav.nav-categorias a[href^="/productos?categoria="]');
  await leer(page);
  for (let i = 0; i < entre(1, 3); i++) {
    if (!(await verProducto(page))) break;
    await leer(page);
  }
}

async function buscador(page) {
  await leer(page);
  await page.locator('input[name="q"]').fill(azar(BUSQUEDAS));
  await navegar(page, () => page.locator('form.buscador button[type="submit"]').click());
  await leer(page);
  if (Math.random() < 0.6) {
    // k6 no tiene la clase URL: los filtros se agregan a la URL de resultados (?q=...)
    const sep = page.url().includes('?') ? '&' : '?';
    await page.goto(`${page.url()}${sep}tueste=${azar(TUESTES)}&orden=${azar(ORDENES)}`, { waitUntil: 'load' });
    await leer(page);
  }
  if (!(await verProducto(page))) {
    await page.goto(`${BASE}/productos?orden=valoracion`, { waitUntil: 'load' });
    await verProducto(page);
  }
  await leer(page);
}

async function abandono(page) {
  await leer(page);
  await clicAzar(page, 'nav.nav-categorias a[href^="/productos?categoria="]');
  await leer(page);
  if (!(await verProducto(page))) return;
  await leer(page);
  if (!(await agregarAlCarrito(page))) return;
  await leer(page);
  if (Math.random() < 0.3) {
    // se arrepiente de un producto (remove_from_cart)
    await clicAzar(page, 'form[action="/carrito/eliminar"] button');
    await leer(page);
  }
  if (Math.random() < 0.3 && (await page.$('a[href="/checkout"]'))) {
    // llega al checkout, se le pide iniciar sesión y abandona
    await navegar(page, () => page.locator('a[href="/checkout"]').click());
    checkouts.add(1);
    await leer(page);
  }
}

async function comprador(page) {
  const email = `carga${String(entre(1, 50)).padStart(2, '0')}@test.local`;
  await leer(page);
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill('Carga123!');
  await navegar(page, () => page.locator('form[action="/login"] button[type="submit"]').click());
  if (!check(page, { 'login correcto': (p) => !p.url().includes('/login') })) return false;
  await leer(page);

  const items = entre(1, 2);
  for (let i = 0; i < items; i++) {
    await page.goto(`${BASE}/productos?categoria=${azar(CATEGORIAS.slice(0, 4))}`, { waitUntil: 'load' });
    await leer(page);
    if (await verProducto(page)) {
      await leer(page);
      await agregarAlCarrito(page);
      await leer(page);
    }
  }
  if (!(await page.$('a[href="/checkout"]'))) return false;
  await navegar(page, () => page.locator('a[href="/checkout"]').click());
  checkouts.add(1);
  await page.locator('input[name="direccion"]').fill(`Av. Ficticia ${entre(100, 9999)}`);
  await page.locator('input[name="comuna"]').fill(azar(COMUNAS));
  await page.locator('input[name="telefono"]').fill('+56 9 0000 0000');
  await page.locator('input[name="metodo"][value="simulado"]').check();
  await leer(page);
  await navegar(page, () => page.locator('form[action="/checkout"] button[type="submit"]').click());
  const pagado = (await page.content()).includes('data-estado="pagado"');
  check(page, { 'pedido pagado': () => pagado });
  if (pagado) compras.add(1);
  return pagado;
}

/* ---------- Sesión de un visitante (contexto nuevo = usuario nuevo, sin cookies ni caché) ---------- */
export async function sesion() {
  const contexto = await browser.newContext({ locale: 'es-CL', timezoneId: 'America/Santiago', viewport: { width: 1366, height: 768 } });
  const page = await contexto.newPage();
  let ok = true;
  try {
    sesiones.add(1);
    await page.goto(`${BASE}/?${UTM}`, { waitUntil: 'load' });
    const total = MIX.reduce((a, b) => a + b, 0);
    let x = Math.random() * total;
    const perfiles = [navegante, buscador, abandono, comprador];
    let perfil = navegante;
    for (let i = 0; i < perfiles.length; i++) {
      if ((x -= MIX[i]) < 0) { perfil = perfiles[i]; break; }
    }
    const resultado = await perfil(page);
    if (resultado === false) ok = false;
    // Deja que gtag envíe los eventos pendientes (los envía en lotes) antes de cerrar
    await page.waitForTimeout(3000);
  } catch (e) {
    ok = false;
    console.warn(`[navegador] sesión con error: ${e.message || e}`);
  } finally {
    sesionOk.add(ok);
    await page.close();
    await contexto.close();
  }
}

export function setup() {
  console.log(`Navegador real: ${NAVEGADORES} en paralelo, ${DURACION}, etiqueta "${ETIQUETA}" contra ${BASE}`);
}

/** Resumen en texto y JSON en ./resultados (Web Vitals con p75, el percentil de referencia de Google). */
export function handleSummary(data) {
  const fecha = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = `resultados/navegador-${ETIQUETA}-${fecha}`;
  const m = data.metrics;
  const v = (n, c) => (m[n] && m[n].values[c] !== undefined ? m[n].values[c] : null);
  const fmt = (x, cls) => (x === null ? '—' : cls ? x.toFixed(3) : `${x.toFixed(0)} ms`);

  const l = [];
  l.push(`RESUMEN NAVEGADOR — etiqueta "${ETIQUETA}" contra ${BASE}`);
  l.push(`Duración: ${(data.state.testRunDurationMs / 1000).toFixed(0)} s · navegadores en paralelo: ${NAVEGADORES}`);
  l.push('');
  l.push('Core Web Vitals medidos por k6 (p75 = referencia de Google; bueno: LCP ≤ 2500 ms, INP ≤ 200 ms, CLS ≤ 0,1):');
  for (const [n, nombre, cls] of [['lcp', 'LCP', false], ['inp', 'INP', false], ['cls', 'CLS', true], ['fcp', 'FCP', false], ['ttfb', 'TTFB', false]]) {
    const k = `browser_web_vital_${n}`;
    l.push(`  ${nombre.padEnd(5)} p75 ${fmt(v(k, 'p(75)'), cls).padStart(9)} | mediana ${fmt(v(k, 'med'), cls).padStart(9)} | p95 ${fmt(v(k, 'p(95)'), cls).padStart(9)}`);
  }
  l.push('');
  l.push(`Sesiones: ${v('nav_sesiones', 'count') || 0} → vistas producto ${v('nav_vistas_producto', 'count') || 0} → agregar carrito ${v('nav_agregar_carrito', 'count') || 0} → checkout ${v('nav_checkout', 'count') || 0} → compras ${v('nav_compras', 'count') || 0}`);
  l.push(`Sesiones sin error: ${((v('nav_sesion_sin_error', 'rate') || 0) * 100).toFixed(1)} % · checks OK: ${((v('checks', 'rate') || 0) * 100).toFixed(1)} %`);
  l.push(`En GA4: Fuente / medio = k6-browser / sintetico · campaña = ${ETIQUETA}`);
  const texto = l.join('\n') + '\n';
  return { stdout: texto, [`${base}.json`]: JSON.stringify(data, null, 2), [`${base}.txt`]: texto };
}
