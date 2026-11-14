/**
 * Generador de carga de Grano Austral (k6).
 *
 * Simula usuarios concurrentes con 4 comportamientos distintos, elegidos al azar en cada
 * iteración (una iteración = una sesión de un visitante):
 *
 *   navegante  40 %  inicio → categoría → 1-3 productos → se va
 *   buscador   25 %  inicio → búsqueda → filtros/orden → producto → se va
 *   abandono   20 %  navega → agrega al carrito → ve el carrito (a veces el checkout) → se va
 *   comprador  15 %  inicia sesión → navega → agrega 1-3 productos → checkout → paga (simulado)
 *
 * Los pesos se pueden cambiar con MIX="40,25,20,15" (navegante,buscador,abandono,comprador).
 * Tiempo de "pensar" entre páginas: THINK_MIN / THINK_MAX en segundos (por defecto 1–4 s).
 * Recursos estáticos (css/js/svg) como un navegador sin caché la primera vez: RECURSOS=true|false.
 *
 * Uso:
 *   k6 run -e BASE_URL=https://tu-sitio.onrender.com -e ESCENARIO=normal carga/k6/tienda.js
 * Reporte HTML nativo de k6:
 *   K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=resultados/normal.html k6 run ...
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { construirEscenario, construirUmbrales } from './escenarios.js';

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ESCENARIO = __ENV.ESCENARIO || 'humo';
const THINK_MIN = Number(__ENV.THINK_MIN || 1);
const THINK_MAX = Number(__ENV.THINK_MAX || 4);
const RECURSOS = (__ENV.RECURSOS || 'true') === 'true';
const MIX = (__ENV.MIX || '40,25,20,15').split(',').map(Number);

// Nombres de página: se declara un umbral amplio por cada una para que k6 reporte sus percentiles por separado
const PAGINAS = ['inicio', 'listado_categoria', 'busqueda', 'busqueda_filtrada', 'detalle_producto', 'carrito', 'checkout',
  'checkout_sin_sesion', 'login_form', 'login', 'agregar_carrito', 'pagar', 'confirmacion_pedido', 'estaticos'];
const umbralesPorPagina = Object.fromEntries(PAGINAS.map((n) => [`http_req_duration{name:${n}}`, ['p(95)<3000']]));

export const options = {
  scenarios: { [ESCENARIO]: { ...construirEscenario(ESCENARIO), exec: 'sesion' } },
  thresholds: { ...construirUmbrales(ESCENARIO), ...umbralesPorPagina },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'min', 'max'],
  userAgent: 'k6-grano-austral/1.0 (prueba de carga INFB8091)',
  insecureSkipTLSVerify: false,
  discardResponseBodies: false,
};

/* ---------- Métricas personalizadas (embudo de conversión sintético) ---------- */
const sesiones = new Counter('embudo_1_sesiones');
const vistasProducto = new Counter('embudo_2_vistas_producto');
const agregados = new Counter('embudo_3_agregar_carrito');
const checkouts = new Counter('embudo_4_checkout');
const compras = new Counter('embudo_5_compras');
const tasaCompraOk = new Rate('compra_exitosa');
const duracionCompra = new Trend('duracion_flujo_compra_ms', true);

/* ---------- Datos de apoyo ---------- */
const CATEGORIAS = ['cafe-grano', 'cafe-molido', 'capsulas', 'metodos', 'accesorios', 'tazas'];
const BUSQUEDAS = ['chocolate', 'Etiopía', 'Colombia', 'frutos rojos', 'molinillo', 'prensa', 'blend', 'caramelo', 'V60', 'termo', 'miel', 'kenia'];
const ORDENES = ['relevancia', 'precio_asc', 'precio_desc', 'valoracion'];
const TUESTES = ['', 'claro', 'medio', 'oscuro'];
const COMUNAS = ['Santiago', 'Ñuñoa', 'Providencia', 'Maipú', 'La Florida', 'Puente Alto', 'San Miguel', 'Macul'];

const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];
const entre = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pensar = () => sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));

/* ---------- Helpers HTTP ---------- */
let recursosCargados = false;

/** GET de una página HTML. `nombre` agrupa URLs distintas bajo una misma métrica (ej: detalle). */
function pagina(ruta, nombre) {
  const r = http.get(`${BASE}${ruta}`, { tags: { name: nombre, tipo: 'pagina' } });
  check(r, { [`${nombre}: 200`]: (x) => x.status === 200 });
  if (RECURSOS && !recursosCargados && r.status === 200) {
    // Primera página de la sesión: el navegador descarga CSS, JS e imágenes (luego quedan en caché)
    const imgs = [...new Set((r.body.match(/\/img\/producto\/[a-z0-9-]+\.svg/g) || []))].slice(0, 8);
    const pedidos = ['/css/estilos.css', '/js/app.js', '/js/web-vitals.iife.js', '/img/logo.svg', ...imgs]
      .map((u) => ['GET', `${BASE}${u}`, null, { tags: { name: 'estaticos', tipo: 'recurso' } }]);
    http.batch(pedidos);
    recursosCargados = true;
  }
  return r;
}

function post(ruta, datos, nombre) {
  // redirects: 0 para medir la acción (POST) por separado de la página a la que redirige
  const r = http.post(`${BASE}${ruta}`, datos, { redirects: 0, tags: { name: nombre, tipo: 'accion' } });
  check(r, { [`${nombre}: redirige (302)`]: (x) => x.status === 302 });
  return r;
}

/** Sigue una redirección relativa (Location) como lo haría el navegador. */
function seguir(r, nombre) {
  const loc = r.headers.Location || r.headers.location;
  if (!loc) return null;
  return pagina(loc.startsWith('http') ? loc.replace(/^https?:\/\/[^/]+/, '') : loc, nombre);
}

const enlacesProducto = (html) => [...new Set((html.match(/\/producto\/[a-z0-9-]+/g) || []))];
const idProducto = (html) => { const m = html.match(/name="producto_id" value="(\d+)"/); return m ? m[1] : null; };

function verProducto(html) {
  const enlaces = enlacesProducto(html);
  if (!enlaces.length) return null;
  const r = pagina(azar(enlaces), 'detalle_producto');
  vistasProducto.add(1);
  return r;
}

function agregarAlCarrito(htmlDetalle) {
  const id = idProducto(htmlDetalle);
  if (!id) return false;
  const r = post('/carrito/agregar', { producto_id: id, cantidad: String(entre(1, 2)), volver: '/carrito' }, 'agregar_carrito');
  agregados.add(1);
  return r.status === 302;
}

/* ---------- Comportamientos ---------- */

function navegante() {
  group('navegante', () => {
    const inicio = pagina('/', 'inicio');
    pensar();
    const lista = pagina(`/productos?categoria=${azar(CATEGORIAS)}`, 'listado_categoria');
    pensar();
    let html = lista.body;
    for (let i = 0; i < entre(1, 3); i++) {
      const d = verProducto(i === 0 ? html : Math.random() < 0.5 ? html : inicio.body);
      if (d) html = d.body;
      pensar();
    }
  });
}

function buscador() {
  group('buscador', () => {
    pagina('/', 'inicio');
    pensar();
    const q = encodeURIComponent(azar(BUSQUEDAS));
    let r = pagina(`/productos?q=${q}`, 'busqueda');
    pensar();
    if (Math.random() < 0.6) {
      r = pagina(`/productos?q=${q}&tueste=${azar(TUESTES)}&orden=${azar(ORDENES)}`, 'busqueda_filtrada');
      pensar();
    }
    if (enlacesProducto(r.body).length) {
      verProducto(r.body);
    } else {
      // sin resultados: el usuario vuelve al catálogo completo
      verProducto(pagina('/productos?orden=valoracion', 'listado_categoria').body);
    }
    pensar();
  });
}

function abandono() {
  group('abandono_carrito', () => {
    pagina('/', 'inicio');
    pensar();
    const lista = pagina(`/productos?categoria=${azar(CATEGORIAS)}`, 'listado_categoria');
    pensar();
    const d = verProducto(lista.body);
    pensar();
    if (d && agregarAlCarrito(d.body)) {
      pagina('/carrito', 'carrito');
      pensar();
      if (Math.random() < 0.3) {
        // llega al checkout pero no tiene sesión y abandona en el login
        pagina('/checkout', 'checkout_sin_sesion');
        checkouts.add(1);
      }
    }
  });
}

function comprador() {
  group('comprador', () => {
    const t0 = Date.now();
    let ok = false;
    // Usuarios precargados carga01..carga50@test.local (contraseña Carga123!)
    const email = `carga${String(entre(1, 50)).padStart(2, '0')}@test.local`;
    pagina('/login', 'login_form');
    pensar();
    const login = post('/login', { email, password: 'Carga123!' }, 'login');
    if (login.status !== 302) { tasaCompraOk.add(false); return; }
    pensar();

    let lista = pagina(`/productos?categoria=${azar(CATEGORIAS.slice(0, 4))}`, 'listado_categoria');
    pensar();
    const items = entre(1, 3);
    for (let i = 0; i < items; i++) {
      const d = verProducto(lista.body);
      pensar();
      if (d) agregarAlCarrito(d.body);
      if (i < items - 1) { lista = pagina(`/productos?categoria=${azar(CATEGORIAS)}`, 'listado_categoria'); pensar(); }
    }
    pagina('/carrito', 'carrito');
    pensar();
    const co = pagina('/checkout', 'checkout');
    checkouts.add(1);
    pensar();
    // Si la sesión se perdió, /checkout redirige al login: se detecta por la URL final
    if (co.status === 200 && check(co, { 'checkout con sesión': (x) => x.url.endsWith('/checkout') })) {
      const pago = post('/checkout', {
        nombre: `Cliente ${email}`, direccion: `Av. Siempre Viva ${entre(100, 9999)}`, comuna: azar(COMUNAS), telefono: '+56911111111', metodo: 'simulado',
      }, 'pagar');
      const conf = seguir(pago, 'confirmacion_pedido');
      ok = !!conf && check(conf, { 'pedido pagado': (x) => x.body.includes('data-estado="pagado"') });
      if (ok) compras.add(1);
    }
    tasaCompraOk.add(ok);
    duracionCompra.add(Date.now() - t0);
  });
}

/* ---------- Función que ejecuta cada usuario virtual ---------- */
export function sesion() {
  // Cada iteración es un visitante nuevo: sin cookies ni caché
  http.cookieJar().clear(BASE);
  recursosCargados = false;
  sesiones.add(1);

  const total = MIX.reduce((a, b) => a + b, 0);
  let x = Math.random() * total;
  const perfiles = [navegante, buscador, abandono, comprador];
  for (let i = 0; i < perfiles.length; i++) {
    if ((x -= MIX[i]) < 0) return perfiles[i]();
  }
  return navegante();
}

/* ---------- Preparación y resumen ---------- */
export function setup() {
  const salud = http.get(`${BASE}/salud`, { tags: { name: 'salud', tipo: 'sistema' } });
  if (salud.status !== 200) throw new Error(`El sitio no responde en ${BASE} (status ${salud.status})`);
  // Reinicia las métricas del servidor para que /api/metricas refleje solo este escenario
  http.post(`${BASE}/api/metricas/reset`, null, { headers: { 'x-metricas-token': __ENV.METRICAS_TOKEN || '' }, tags: { name: 'salud', tipo: 'sistema' } });
  console.log(`Escenario "${ESCENARIO}" contra ${BASE}`);
}

export function teardown() {
  const r = http.get(`${BASE}/api/metricas`, { headers: { 'x-metricas-token': __ENV.METRICAS_TOKEN || '' }, tags: { name: 'salud', tipo: 'sistema' } });
  if (r.status === 200) {
    const m = r.json();
    console.log(`[servidor] peticiones=${m.global.peticiones} p95=${m.global.latencia_ms.p95}ms error=${m.global.tasa_error_pct}% rss=${m.proceso.memoria_mb.rss}MB`);
  }
}

/** Genera un resumen JSON (para gráficos) y uno en texto legible, ambos en ./resultados */
export function handleSummary(data) {
  const fecha = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = `resultados/${ESCENARIO}-${fecha}`;
  const m = data.metrics;
  const v = (nombre, campo) => (m[nombre] && m[nombre].values[campo] !== undefined ? m[nombre].values[campo] : 0);
  const ms = (x) => `${Number(x).toFixed(1)} ms`;

  const lineas = [];
  lineas.push(`RESUMEN — escenario "${ESCENARIO}" contra ${BASE}`);
  lineas.push(`Duración: ${(data.state.testRunDurationMs / 1000).toFixed(0)} s · VUs máx: ${v('vus_max', 'max') || v('vus_max', 'value')}`);
  lineas.push('');
  lineas.push('Tiempo de respuesta HTTP (todas las peticiones):');
  lineas.push(`  promedio ${ms(v('http_req_duration', 'avg'))} | mediana ${ms(v('http_req_duration', 'med'))} | p90 ${ms(v('http_req_duration', 'p(90)'))} | p95 ${ms(v('http_req_duration', 'p(95)'))} | p99 ${ms(v('http_req_duration', 'p(99)'))} | máx ${ms(v('http_req_duration', 'max'))}`);
  lineas.push(`Throughput: ${v('http_reqs', 'rate').toFixed(2)} req/s (${v('http_reqs', 'count')} peticiones)`);
  lineas.push(`Tasa de error HTTP: ${(v('http_req_failed', 'rate') * 100).toFixed(2)} %`);
  lineas.push(`Checks OK: ${(v('checks', 'rate') * 100).toFixed(2)} %`);
  lineas.push('');
  lineas.push('Embudo sintético:');
  lineas.push(`  sesiones ${v('embudo_1_sesiones', 'count')} → vistas producto ${v('embudo_2_vistas_producto', 'count')} → agregar carrito ${v('embudo_3_agregar_carrito', 'count')} → checkout ${v('embudo_4_checkout', 'count')} → compras ${v('embudo_5_compras', 'count')}`);
  lineas.push(`  compras exitosas: ${(v('compra_exitosa', 'rate') * 100).toFixed(1)} % · duración flujo compra p95: ${ms(v('duracion_flujo_compra_ms', 'p(95)'))}`);
  lineas.push('');
  lineas.push('Por página (p95):');
  for (const clave of Object.keys(m).filter((k) => k.startsWith('http_req_duration{name:')).sort()) {
    lineas.push(`  ${clave.slice(23, -1).padEnd(24)} p95 ${ms(m[clave].values['p(95)'])}  (mediana ${ms(m[clave].values.med)})`);
  }
  lineas.push('');
  lineas.push('Umbrales:');
  for (const [k, met] of Object.entries(m)) {
    if (met.thresholds) for (const [t, r] of Object.entries(met.thresholds)) lineas.push(`  ${r.ok ? 'CUMPLE   ' : 'NO CUMPLE'} ${k} ${t}`);
  }
  const texto = lineas.join('\n') + '\n';
  return { stdout: texto, [`${base}.json`]: JSON.stringify(data, null, 2), [`${base}.txt`]: texto };
}
