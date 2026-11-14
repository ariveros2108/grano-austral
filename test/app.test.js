/**
 * Tests automáticos de integración (node:test + supertest).
 * Ejecutar con: npm test
 * Usan una base SQLite temporal y desactivan Webpay (se prueba el pago simulado).
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const archivoDb = path.join(os.tmpdir(), `grano-test-${process.pid}.db`);
process.env.DATABASE_URL = `file:${archivoDb}`;
process.env.PAGO_SIMULADO_HABILITADO = 'true';
process.env.BCRYPT_ROUNDS = '4';

const request = require('supertest');
const db = require('../src/db');
const app = require('../src/app');

before(async () => { await db.inicializar(); });
after(() => { for (const f of [archivoDb, `${archivoDb}-wal`, `${archivoDb}-shm`]) fs.rmSync(f, { force: true }); });

test('páginas públicas responden 200', async () => {
  for (const url of ['/', '/productos', '/producto/huila-lavado-250-g', '/carrito', '/login', '/registro', '/nosotros', '/salud']) {
    const r = await request(app).get(url);
    assert.strictEqual(r.status, 200, url);
  }
});

test('404 para rutas y productos inexistentes', async () => {
  assert.strictEqual((await request(app).get('/no-existe')).status, 404);
  assert.strictEqual((await request(app).get('/producto/no-existe')).status, 404);
});

test('búsqueda y filtros acotan resultados', async () => {
  const todos = await db.buscarProductos({});
  const oscuros = await db.buscarProductos({ tueste: 'oscuro' });
  const etiopia = await db.buscarProductos({ q: 'Etiopía' });
  const baratos = await db.buscarProductos({ precioMax: 6000, orden: 'precio_asc' });
  assert.ok(todos.total > 40);
  assert.ok(oscuros.total > 0 && oscuros.total < todos.total);
  assert.ok(oscuros.productos.every((p) => p.tueste === 'oscuro'));
  assert.ok(etiopia.total > 0);
  assert.ok(baratos.productos.every((p) => p.precio <= 6000));
  const html = (await request(app).get('/productos?q=chocolate')).text;
  assert.match(html, /"search"/); // evento GA4 search
});

test('página de detalle incluye evento view_item', async () => {
  const r = await request(app).get('/producto/chemex-6-tazas');
  assert.match(r.text, /"view_item"/);
  assert.match(r.text, /Chemex 6 tazas/);
});

test('imagen SVG del producto', async () => {
  const r = await request(app).get('/img/producto/huila-lavado-250-g.svg');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers['content-type'], /svg/);
});

test('flujo completo: carrito → registro → checkout simulado → pedido pagado', async () => {
  const agente = request.agent(app);
  await agente.post('/carrito/agregar').type('form').send({ producto_id: 1, cantidad: 2 }).expect(302);
  let carrito = await agente.get('/carrito');
  assert.match(carrito.text, /"add_to_cart"/);
  assert.match(carrito.text, /contador-carrito">2</);

  // El checkout exige sesión
  const sinLogin = await agente.get('/checkout');
  assert.strictEqual(sinLogin.headers.location, '/login');

  const email = `test${Date.now()}@test.cl`;
  const reg = await agente.post('/registro').type('form').send({ nombre: 'Tester', email, password: 'secreto1' });
  assert.strictEqual(reg.headers.location, '/checkout');

  const checkout = await agente.get('/checkout');
  assert.match(checkout.text, /"begin_checkout"/);
  assert.match(checkout.text, /"sign_up"/);

  const pago = await agente.post('/checkout').type('form').send({ nombre: 'Tester', direccion: 'Calle 123', comuna: 'Ñuñoa', metodo: 'simulado' });
  assert.match(pago.headers.location, /^\/pedido\/\d+$/);

  const pedido = await agente.get(pago.headers.location);
  assert.match(pedido.text, /data-estado="pagado"/);
  assert.match(pedido.text, /"purchase"/);
  // purchase se envía solo una vez
  const otraVez = await agente.get(pago.headers.location);
  assert.doesNotMatch(otraVez.text, /"purchase"/);
  carrito = await agente.get('/carrito');
  assert.match(carrito.text, /contador-carrito">0</);
});

test('login con credenciales incorrectas devuelve 401', async () => {
  const r = await request(app).post('/login').type('form').send({ email: 'carga01@test.local', password: 'mala' });
  assert.strictEqual(r.status, 401);
});

test('usuarios de carga pueden iniciar sesión', async () => {
  const r = await request(app).post('/login').type('form').send({ email: 'carga01@test.local', password: 'Carga123!' });
  assert.strictEqual(r.status, 302);
});

test('validación de registro', async () => {
  const r = await request(app).post('/registro').type('form').send({ nombre: 'X', email: 'malo', password: '1' });
  assert.strictEqual(r.status, 422);
});

test('retorno de Webpay anulado marca el pedido', async () => {
  const agente = request.agent(app);
  await agente.post('/login').type('form').send({ email: 'carga02@test.local', password: 'Carga123!' });
  const usuario = await db.obtenerUsuarioPorEmail('carga02@test.local');
  const orden = 'TEST-ANULADO-1';
  const id = await db.crearPedido({
    usuarioId: Number(usuario.id), ordenCompra: orden, total: 1000, envio: 0,
    items: [{ id: 1, nombre: 'x', precio: 1000, cantidad: 1 }], datosEnvio: { nombre: 'a', direccion: 'b', comuna: 'c', telefono: '' },
  });
  const r = await agente.get(`/checkout/retorno?TBK_TOKEN=abc&TBK_ORDEN_COMPRA=${orden}&TBK_ID_SESION=1`);
  assert.strictEqual(r.headers.location, `/pedido/${id}`);
  const p = await db.obtenerPedido(id);
  assert.strictEqual(p.estado, 'anulado');
});

test('métricas exponen percentiles y throughput', async () => {
  const r = await request(app).get('/api/metricas');
  assert.strictEqual(r.status, 200);
  for (const k of ['promedio', 'mediana', 'p90', 'p95', 'p99']) assert.ok(k in r.body.global.latencia_ms);
  assert.ok('throughput_rps_10s' in r.body.global);
  assert.ok(r.body.proceso.memoria_mb.rss > 0);
});
