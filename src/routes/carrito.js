/**
 * Carrito de compras. Se guarda en la cookie de sesión (sin estado en el servidor),
 * lo que simplifica escalar horizontalmente y medir el desempeño.
 */
const express = require('express');
const db = require('../db');
const { carritoCrudo, carritoDetallado, itemGA, encolarEvento, flash } = require('../lib/utilidades');

const router = express.Router();
const MAX_POR_PRODUCTO = 20;

router.get('/carrito', async (req, res) => {
  const carrito = await carritoDetallado(req);
  res.render('carrito', {
    titulo: 'Tu carrito',
    carrito,
    ga: [['view_cart', { currency: 'CLP', value: carrito.subtotal, items: carrito.items.map((it) => itemGA(it, it.cantidad)) }]],
  });
});

router.post('/carrito/agregar', async (req, res) => {
  const id = Number(req.body.producto_id);
  const cantidad = Math.max(1, Math.min(MAX_POR_PRODUCTO, Number(req.body.cantidad) || 1));
  const [producto] = await db.obtenerProductosPorIds([id]);
  if (!producto) {
    flash(req, 'error', 'El producto no existe.');
    return res.redirect('/productos');
  }
  const carrito = carritoCrudo(req);
  carrito[id] = Math.min(MAX_POR_PRODUCTO, (Number(carrito[id]) || 0) + cantidad);
  req.session.carrito = { ...carrito }; // reasignar para que cookie-session detecte el cambio
  encolarEvento(req, 'add_to_cart', { currency: 'CLP', value: Number(producto.precio) * cantidad, items: [itemGA(producto, cantidad)] });
  flash(req, 'ok', `Agregaste ${cantidad} × ${producto.nombre} al carrito.`);
  // Volver a la página de origen si se indicó (ej: seguir comprando)
  const volver = typeof req.body.volver === 'string' && req.body.volver.startsWith('/') && !req.body.volver.startsWith('//') ? req.body.volver : '/carrito';
  res.redirect(volver);
});

router.post('/carrito/actualizar', async (req, res) => {
  const id = Number(req.body.producto_id);
  const cantidad = Math.max(0, Math.min(MAX_POR_PRODUCTO, Number(req.body.cantidad) || 0));
  const carrito = carritoCrudo(req);
  const anterior = Number(carrito[id]) || 0;
  const [producto] = await db.obtenerProductosPorIds([id]);
  if (producto && anterior !== cantidad) {
    const diff = cantidad - anterior;
    encolarEvento(req, diff > 0 ? 'add_to_cart' : 'remove_from_cart', {
      currency: 'CLP', value: Number(producto.precio) * Math.abs(diff), items: [itemGA(producto, Math.abs(diff))],
    });
  }
  if (cantidad === 0) delete carrito[id];
  else carrito[id] = cantidad;
  req.session.carrito = { ...carrito };
  res.redirect('/carrito');
});

router.post('/carrito/eliminar', async (req, res) => {
  const id = Number(req.body.producto_id);
  const carrito = carritoCrudo(req);
  const [producto] = await db.obtenerProductosPorIds([id]);
  if (producto && carrito[id]) {
    encolarEvento(req, 'remove_from_cart', { currency: 'CLP', value: Number(producto.precio) * carrito[id], items: [itemGA(producto, carrito[id])] });
  }
  delete carrito[id];
  req.session.carrito = { ...carrito };
  res.redirect('/carrito');
});

module.exports = router;
