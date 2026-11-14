/**
 * Acceso a datos con libSQL (@libsql/client).
 * - Local: archivo SQLite (DATABASE_URL=file:data/tienda.db).
 * - Nube: Turso (DATABASE_URL=libsql://... + DATABASE_AUTH_TOKEN), persistente y gratuito.
 * El mismo código sirve para ambos casos.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { createClient } = require('@libsql/client');
const config = require('../config');
const { categorias, productos } = require('./catalogo');

let cliente;

function db() {
  if (!cliente) {
    if (config.dbUrl.startsWith('file:') && !config.dbUrl.includes(':memory:')) {
      const archivo = config.dbUrl.replace(/^file:/, '');
      fs.mkdirSync(path.dirname(path.resolve(archivo)), { recursive: true });
    }
    cliente = createClient({ url: config.dbUrl, authToken: config.dbToken });
  }
  return cliente;
}

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS categorias (
     slug TEXT PRIMARY KEY,
     nombre TEXT NOT NULL,
     descripcion TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS productos (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     slug TEXT UNIQUE NOT NULL,
     nombre TEXT NOT NULL,
     categoria TEXT NOT NULL REFERENCES categorias(slug),
     precio INTEGER NOT NULL,
     descripcion TEXT,
     origen TEXT, region TEXT, proceso TEXT, tueste TEXT, notas TEXT, peso_g INTEGER,
     material TEXT, capacidad TEXT,
     forma TEXT, color TEXT,
     valoracion REAL DEFAULT 4.5,
     destacado INTEGER DEFAULT 0,
     busqueda TEXT -- nombre, descripción, notas, origen y región normalizados (minúsculas, sin tildes)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria)`,
  `CREATE TABLE IF NOT EXISTS usuarios (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     nombre TEXT NOT NULL,
     email TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     creado_en TEXT DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS pedidos (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
     orden_compra TEXT UNIQUE NOT NULL,
     estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | pagado | rechazado | anulado
     metodo_pago TEXT,                          -- webpay | simulado
     total INTEGER NOT NULL,
     envio INTEGER NOT NULL DEFAULT 0,
     nombre_envio TEXT, direccion TEXT, comuna TEXT, telefono TEXT,
     webpay_token TEXT,
     codigo_autorizacion TEXT,
     ga_enviado INTEGER DEFAULT 0,
     creado_en TEXT DEFAULT (datetime('now')),
     pagado_en TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_pedidos_usuario ON pedidos(usuario_id)`,
  `CREATE TABLE IF NOT EXISTS pedido_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
     producto_id INTEGER NOT NULL REFERENCES productos(id),
     nombre TEXT NOT NULL,
     precio INTEGER NOT NULL,
     cantidad INTEGER NOT NULL
   )`,
];

const COLUMNAS_PRODUCTO = [
  'slug', 'nombre', 'categoria', 'precio', 'descripcion', 'origen', 'region', 'proceso', 'tueste', 'notas',
  'peso_g', 'material', 'capacidad', 'forma', 'color', 'valoracion', 'destacado',
];

/**
 * Normaliza texto para búsquedas: minúsculas y sin tildes ("Etiopía" → "etiopia", "Ñuñoa" → "nunoa").
 * Se hace en JS porque el LIKE de SQLite distingue tildes y Turso no permite funciones SQL propias.
 * @param {string|null|undefined} texto
 * @returns {string}
 */
function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Texto de búsqueda de un producto: une los campos buscables ya normalizados. */
function textoBusqueda(p) {
  return normalizar([p.nombre, p.descripcion, p.notas, p.origen, p.region].filter(Boolean).join(' · '));
}

/**
 * Migración idempotente de la columna `busqueda`: la agrega si falta (BD creada antes de existir)
 * y llena los productos que no la tengan. En arranques posteriores solo cuesta dos consultas livianas.
 */
async function migrarBusqueda(c) {
  const { rows: columnas } = await c.execute('PRAGMA table_info(productos)');
  if (!columnas.some((col) => col.name === 'busqueda')) {
    await c.execute('ALTER TABLE productos ADD COLUMN busqueda TEXT');
  }
  const { rows } = await c.execute(
    'SELECT id, nombre, descripcion, notas, origen, region FROM productos WHERE busqueda IS NULL'
  );
  if (rows.length) {
    await c.batch(
      rows.map((p) => ({ sql: 'UPDATE productos SET busqueda = ? WHERE id = ?', args: [textoBusqueda(p), p.id] })),
      'write'
    );
    console.log(`[db] Texto de búsqueda normalizado en ${rows.length} productos.`);
  }
}

/** Crea las tablas y carga el catálogo si la base está vacía. Es idempotente. */
async function inicializar() {
  const c = db();
  if (config.dbUrl.startsWith('file:')) {
    // WAL mejora la concurrencia lectura/escritura en SQLite local
    await c.execute('PRAGMA journal_mode = WAL').catch(() => {});
  }
  await c.batch(ESQUEMA, 'write');

  const { rows } = await c.execute('SELECT COUNT(*) AS n FROM productos');
  if (Number(rows[0].n) === 0) {
    const sentencias = categorias.map((cat) => ({
      sql: 'INSERT OR IGNORE INTO categorias (slug, nombre, descripcion) VALUES (?, ?, ?)',
      args: [cat.slug, cat.nombre, cat.descripcion],
    }));
    for (const p of productos) {
      sentencias.push({
        sql: `INSERT OR IGNORE INTO productos (${COLUMNAS_PRODUCTO.join(', ')}) VALUES (${COLUMNAS_PRODUCTO.map(() => '?').join(', ')})`,
        args: COLUMNAS_PRODUCTO.map((k) => (p[k] === undefined ? null : p[k])),
      });
    }
    await c.batch(sentencias, 'write');
    console.log(`[db] Catálogo sembrado: ${productos.length} productos.`);
  }
  await migrarBusqueda(c);

  if (config.sembrarUsuariosCarga) {
    // Un solo hash para todos (misma contraseña) => arranque rápido
    const hash = bcrypt.hashSync('Carga123!', config.bcryptRounds);
    const sentencias = [];
    for (let i = 1; i <= 50; i++) {
      const n = String(i).padStart(2, '0');
      sentencias.push({
        sql: 'INSERT OR IGNORE INTO usuarios (nombre, email, password_hash) VALUES (?, ?, ?)',
        args: [`Usuario Carga ${n}`, `carga${n}@test.local`, hash],
      });
    }
    await c.batch(sentencias, 'write');
  }
}

/* ---------- Consultas de catálogo ---------- */

async function obtenerCategorias() {
  const { rows } = await db().execute(
    `SELECT c.slug, c.nombre, c.descripcion, COUNT(p.id) AS total
       FROM categorias c LEFT JOIN productos p ON p.categoria = c.slug
      GROUP BY c.slug ORDER BY c.rowid`
  );
  return rows;
}

async function obtenerDestacados(limite = 8) {
  const { rows } = await db().execute({
    sql: 'SELECT * FROM productos WHERE destacado = 1 ORDER BY valoracion DESC LIMIT ?',
    args: [limite],
  });
  return rows;
}

async function obtenerOrigenes() {
  const { rows } = await db().execute(
    "SELECT origen, COUNT(*) AS total FROM productos WHERE origen IS NOT NULL GROUP BY origen ORDER BY origen"
  );
  return rows;
}

const ORDENES = {
  relevancia: 'destacado DESC, valoracion DESC, nombre',
  precio_asc: 'precio ASC',
  precio_desc: 'precio DESC',
  nombre: 'nombre ASC',
  valoracion: 'valoracion DESC',
};

/**
 * Búsqueda con filtros combinables y paginación.
 * @param {object} f { q, categoria, tueste, origen, precioMin, precioMax, orden, pagina, porPagina }
 */
async function buscarProductos(f = {}) {
  const where = [];
  const args = [];
  if (f.q) {
    // Un solo LIKE sobre la columna normalizada (antes: 4 LIKE por fila, sensibles a tildes)
    where.push('busqueda LIKE ?');
    args.push(`%${normalizar(f.q)}%`);
  }
  if (f.categoria) { where.push('categoria = ?'); args.push(f.categoria); }
  if (f.tueste) { where.push('tueste = ?'); args.push(f.tueste); }
  if (f.origen) { where.push('origen = ?'); args.push(f.origen); }
  if (Number.isFinite(f.precioMin)) { where.push('precio >= ?'); args.push(f.precioMin); }
  if (Number.isFinite(f.precioMax)) { where.push('precio <= ?'); args.push(f.precioMax); }

  const clausula = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orden = ORDENES[f.orden] || ORDENES.relevancia;
  const porPagina = f.porPagina || config.productosPorPagina;
  const pagina = Math.max(1, f.pagina || 1);

  const [total, lista] = await Promise.all([
    db().execute({ sql: `SELECT COUNT(*) AS n FROM productos ${clausula}`, args }),
    db().execute({
      sql: `SELECT * FROM productos ${clausula} ORDER BY ${orden} LIMIT ? OFFSET ?`,
      args: [...args, porPagina, (pagina - 1) * porPagina],
    }),
  ]);
  const n = Number(total.rows[0].n);
  return { productos: lista.rows, total: n, pagina, totalPaginas: Math.max(1, Math.ceil(n / porPagina)) };
}

async function obtenerProductoPorSlug(slug) {
  const { rows } = await db().execute({
    sql: 'SELECT p.*, c.nombre AS categoria_nombre FROM productos p JOIN categorias c ON c.slug = p.categoria WHERE p.slug = ?',
    args: [slug],
  });
  return rows[0] || null;
}

async function obtenerProductosPorIds(ids) {
  if (!ids.length) return [];
  const { rows } = await db().execute({
    sql: `SELECT * FROM productos WHERE id IN (${ids.map(() => '?').join(',')})`,
    args: ids,
  });
  return rows;
}

async function obtenerRelacionados(producto, limite = 4) {
  const { rows } = await db().execute({
    sql: 'SELECT * FROM productos WHERE categoria = ? AND id <> ? ORDER BY valoracion DESC LIMIT ?',
    args: [producto.categoria, producto.id, limite],
  });
  return rows;
}

/* ---------- Usuarios ---------- */

async function crearUsuario({ nombre, email, passwordHash }) {
  const r = await db().execute({
    sql: 'INSERT INTO usuarios (nombre, email, password_hash) VALUES (?, ?, ?)',
    args: [nombre, email, passwordHash],
  });
  return Number(r.lastInsertRowid);
}

async function obtenerUsuarioPorEmail(email) {
  const { rows } = await db().execute({ sql: 'SELECT * FROM usuarios WHERE email = ?', args: [email] });
  return rows[0] || null;
}

/* ---------- Pedidos ---------- */

/**
 * Crea el pedido y sus ítems en un solo batch atómico (una transacción).
 * Se usa batch en vez de transacción interactiva porque funciona igual en archivo local y en Turso
 * y evita bloqueos bajo carga concurrente.
 */
async function crearPedido({ usuarioId, ordenCompra, total, envio, items, datosEnvio }) {
  const sentencias = [
    {
      sql: `INSERT INTO pedidos (usuario_id, orden_compra, total, envio, nombre_envio, direccion, comuna, telefono)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [usuarioId, ordenCompra, total, envio, datosEnvio.nombre, datosEnvio.direccion, datosEnvio.comuna, datosEnvio.telefono],
    },
    ...items.map((it) => ({
      sql: `INSERT INTO pedido_items (pedido_id, producto_id, nombre, precio, cantidad)
            VALUES ((SELECT id FROM pedidos WHERE orden_compra = ?), ?, ?, ?, ?)`,
      args: [ordenCompra, it.id, it.nombre, it.precio, it.cantidad],
    })),
  ];
  const resultados = await db().batch(sentencias, 'write');
  return Number(resultados[0].lastInsertRowid);
}

async function actualizarPedido(id, campos) {
  const claves = Object.keys(campos);
  await db().execute({
    sql: `UPDATE pedidos SET ${claves.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    args: [...claves.map((k) => campos[k]), id],
  });
}

async function obtenerPedido(id) {
  const { rows } = await db().execute({ sql: 'SELECT * FROM pedidos WHERE id = ?', args: [id] });
  if (!rows[0]) return null;
  const items = await db().execute({ sql: 'SELECT * FROM pedido_items WHERE pedido_id = ?', args: [id] });
  return { ...rows[0], items: items.rows };
}

async function obtenerPedidoPorOrden(ordenCompra) {
  const { rows } = await db().execute({ sql: 'SELECT * FROM pedidos WHERE orden_compra = ?', args: [ordenCompra] });
  return rows[0] || null;
}

async function obtenerPedidosDeUsuario(usuarioId) {
  const { rows } = await db().execute({
    sql: 'SELECT * FROM pedidos WHERE usuario_id = ? ORDER BY id DESC LIMIT 20',
    args: [usuarioId],
  });
  return rows;
}

module.exports = {
  db, inicializar, normalizar,
  obtenerCategorias, obtenerDestacados, obtenerOrigenes, buscarProductos, obtenerProductoPorSlug,
  obtenerProductosPorIds, obtenerRelacionados,
  crearUsuario, obtenerUsuarioPorEmail,
  crearPedido, actualizarPedido, obtenerPedido, obtenerPedidoPorOrden, obtenerPedidosDeUsuario,
};
