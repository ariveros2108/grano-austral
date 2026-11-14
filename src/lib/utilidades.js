/**
 * Utilidades compartidas: formato de moneda, carrito en sesión y eventos GA4.
 */
const db = require('../db');

const ENVIO_GRATIS_DESDE = 30000;
const COSTO_ENVIO = 3990;

/** Formatea un entero como pesos chilenos: 12990 -> "$12.990" */
const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');

/* ---------- Carrito (guardado en la cookie de sesión como { idProducto: cantidad }) ---------- */

function carritoCrudo(req) {
  if (!req.session.carrito || typeof req.session.carrito !== 'object') req.session.carrito = {};
  return req.session.carrito;
}

function cantidadEnCarrito(req) {
  return Object.values(req.session?.carrito || {}).reduce((a, b) => a + Number(b), 0);
}

/** Devuelve el carrito con los datos actuales de cada producto desde la BD. */
async function carritoDetallado(req) {
  const crudo = carritoCrudo(req);
  const ids = Object.keys(crudo).map(Number).filter(Boolean);
  const productos = await db.obtenerProductosPorIds(ids);
  const items = productos.map((p) => ({
    id: Number(p.id), slug: p.slug, nombre: p.nombre, categoria: p.categoria, precio: Number(p.precio),
    cantidad: Number(crudo[p.id]), subtotal: Number(p.precio) * Number(crudo[p.id]),
  }));
  const subtotal = items.reduce((a, it) => a + it.subtotal, 0);
  const envio = subtotal === 0 || subtotal >= ENVIO_GRATIS_DESDE ? 0 : COSTO_ENVIO;
  return { items, subtotal, envio, total: subtotal + envio, cantidad: items.reduce((a, it) => a + it.cantidad, 0) };
}

/* ---------- GA4 ---------- */

/** Convierte un producto al formato "item" de GA4 (comercio electrónico). */
function itemGA(p, cantidad = 1, extra = {}) {
  return {
    item_id: String(p.slug || p.id),
    item_name: p.nombre,
    item_brand: 'Grano Austral',
    item_category: p.categoria,
    ...(p.origen ? { item_category2: p.origen } : {}),
    price: Number(p.precio),
    quantity: Number(cantidad),
    ...extra,
  };
}

/**
 * Encola un evento GA4 en la sesión para que se envíe en la próxima página renderizada.
 * Útil después de un POST + redirect (agregar al carrito, login, registro...), donde
 * el evento no se puede disparar en el navegador antes de la redirección.
 */
function encolarEvento(req, nombre, parametros = {}) {
  if (!Array.isArray(req.session.gaEventos)) req.session.gaEventos = [];
  req.session.gaEventos.push([nombre, parametros]);
  // Límite para que la cookie no crezca indefinidamente
  if (req.session.gaEventos.length > 5) req.session.gaEventos.splice(0, req.session.gaEventos.length - 5);
}

/** Mensaje flash de una sola vez (éxito/error) para mostrar tras una redirección. */
function flash(req, tipo, texto) {
  req.session.flash = { tipo, texto };
}

module.exports = { clp, carritoCrudo, cantidadEnCarrito, carritoDetallado, itemGA, encolarEvento, flash, ENVIO_GRATIS_DESDE, COSTO_ENVIO };
