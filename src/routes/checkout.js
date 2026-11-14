/**
 * Checkout y pago.
 * - Pago real de prueba: Webpay Plus de Transbank en ambiente de INTEGRACIÓN (sandbox público).
 *   No se mueve dinero real. Tarjeta de prueba: VISA 4051 8856 0044 6623, CVV 123, cualquier fecha futura;
 *   en la autenticación del banco: RUT 11.111.111-1, clave 123.
 * - Pago simulado: solo para los generadores de carga (PAGO_SIMULADO_HABILITADO=true), para no
 *   enviar miles de transacciones al sandbox de Transbank durante las pruebas de estrés.
 */
const express = require('express');
const crypto = require('crypto');
const { WebpayPlus, Options, IntegrationApiKeys, IntegrationCommerceCodes, Environment } = require('transbank-sdk');
const db = require('../db');
const config = require('../config');
const { carritoDetallado, itemGA, encolarEvento, flash } = require('../lib/utilidades');
const { requiereLogin } = require('./cuenta');

const router = express.Router();

const transaccionWebpay = () =>
  new WebpayPlus.Transaction(
    new Options(
      config.webpayCommerceCode || IntegrationCommerceCodes.WEBPAY_PLUS,
      config.webpayApiKey || IntegrationApiKeys.WEBPAY,
      Environment.Integration
    )
  );

const urlBase = (req) => config.baseUrl || `${req.protocol}://${req.get('host')}`;

/** Orden de compra única (Webpay acepta máximo 26 caracteres). */
const nuevaOrden = () => `GA-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`.toUpperCase();

router.get('/checkout', requiereLogin, async (req, res) => {
  const carrito = await carritoDetallado(req);
  if (!carrito.items.length) {
    flash(req, 'info', 'Tu carrito está vacío.');
    return res.redirect('/carrito');
  }
  res.render('checkout', {
    titulo: 'Finalizar compra',
    carrito,
    datos: { nombre: req.session.usuario.nombre },
    error: null,
    pagoSimulado: config.pagoSimulado,
    ga: [['begin_checkout', { currency: 'CLP', value: carrito.total, items: carrito.items.map((it) => itemGA(it, it.cantidad)) }]],
  });
});

router.post('/checkout', requiereLogin, async (req, res) => {
  const carrito = await carritoDetallado(req);
  if (!carrito.items.length) return res.redirect('/carrito');

  const datosEnvio = {
    nombre: String(req.body.nombre || '').trim().slice(0, 80),
    direccion: String(req.body.direccion || '').trim().slice(0, 150),
    comuna: String(req.body.comuna || '').trim().slice(0, 60),
    telefono: String(req.body.telefono || '').trim().slice(0, 20),
  };
  if (!datosEnvio.nombre || !datosEnvio.direccion || !datosEnvio.comuna) {
    return res.status(422).render('checkout', {
      titulo: 'Finalizar compra', carrito, datos: datosEnvio, pagoSimulado: config.pagoSimulado, ga: [],
      error: 'Completa nombre, dirección y comuna.',
    });
  }

  const metodo = req.body.metodo === 'simulado' && config.pagoSimulado ? 'simulado' : 'webpay';
  const ordenCompra = nuevaOrden();
  const pedidoId = await db.crearPedido({
    usuarioId: req.session.usuario.id, ordenCompra, total: carrito.total, envio: carrito.envio, items: carrito.items, datosEnvio,
  });
  encolarEvento(req, 'add_payment_info', {
    currency: 'CLP', value: carrito.total, payment_type: metodo, items: carrito.items.map((it) => itemGA(it, it.cantidad)),
  });

  if (metodo === 'simulado') {
    await db.actualizarPedido(pedidoId, {
      estado: 'pagado', metodo_pago: 'simulado', codigo_autorizacion: 'SIM' + crypto.randomInt(100000, 999999), pagado_en: new Date().toISOString(),
    });
    return res.redirect(`/pedido/${pedidoId}`);
  }

  try {
    const respuesta = await transaccionWebpay().create(ordenCompra, String(req.session.usuario.id), carrito.total, `${urlBase(req)}/checkout/retorno`);
    await db.actualizarPedido(pedidoId, { metodo_pago: 'webpay', webpay_token: respuesta.token });
    // Webpay exige que el navegador envíe el token por POST a su URL: se usa un formulario autoenviado
    res.render('webpay-redirigir', { titulo: 'Redirigiendo a Webpay…', url: respuesta.url, token: respuesta.token });
  } catch (e) {
    console.error('[webpay] Error al crear transacción:', e.message);
    await db.actualizarPedido(pedidoId, { estado: 'rechazado', metodo_pago: 'webpay' });
    flash(req, 'error', 'No pudimos conectar con Webpay. Intenta nuevamente en unos minutos.');
    res.redirect('/checkout');
  }
});

/**
 * Retorno desde Webpay (puede llegar por GET o POST según el caso):
 *  - token_ws                      -> flujo normal: confirmar (commit) la transacción.
 *  - TBK_TOKEN + TBK_ORDEN_COMPRA  -> el usuario anuló el pago en el formulario de Webpay.
 *  - solo TBK_ORDEN_COMPRA         -> se agotó el tiempo en Webpay.
 * No se depende de la cookie de sesión aquí: el pedido se busca por su orden de compra.
 */
router.all('/checkout/retorno', async (req, res) => {
  const p = { ...req.query, ...(req.body || {}) };
  try {
    if (p.token_ws && !p.TBK_TOKEN) {
      const r = await transaccionWebpay().commit(p.token_ws);
      const pedido = await db.obtenerPedidoPorOrden(r.buy_order);
      if (!pedido) return res.status(404).render('error', { titulo: 'Pedido no encontrado', mensaje: 'No encontramos el pedido asociado al pago.' });
      const aprobado = r.status === 'AUTHORIZED' && Number(r.response_code) === 0;
      await db.actualizarPedido(pedido.id, aprobado
        ? { estado: 'pagado', codigo_autorizacion: r.authorization_code, pagado_en: new Date().toISOString() }
        : { estado: 'rechazado' });
      return res.redirect(`/pedido/${pedido.id}`);
    }
    if (p.TBK_ORDEN_COMPRA) {
      const pedido = await db.obtenerPedidoPorOrden(p.TBK_ORDEN_COMPRA);
      if (pedido) {
        await db.actualizarPedido(pedido.id, { estado: 'anulado' });
        return res.redirect(`/pedido/${pedido.id}`);
      }
    }
    res.status(400).render('error', { titulo: 'Pago no válido', mensaje: 'La respuesta de Webpay no es válida.' });
  } catch (e) {
    console.error('[webpay] Error en retorno:', e.message);
    res.status(502).render('error', { titulo: 'Error en el pago', mensaje: 'No pudimos confirmar el pago con Webpay. Revisa tu historial de pedidos.' });
  }
});

router.get('/pedido/:id', requiereLogin, async (req, res, next) => {
  const pedido = await db.obtenerPedido(Number(req.params.id));
  if (!pedido || Number(pedido.usuario_id) !== req.session.usuario.id) return next();

  const ga = [];
  if (pedido.estado === 'pagado') {
    req.session.carrito = {}; // la compra se concretó: se vacía el carrito
    if (!Number(pedido.ga_enviado)) {
      // El evento purchase se envía UNA sola vez por pedido (evita duplicar ingresos en GA4)
      ga.push(['purchase', {
        transaction_id: pedido.orden_compra, currency: 'CLP', value: Number(pedido.total), shipping: Number(pedido.envio),
        payment_type: pedido.metodo_pago,
        items: pedido.items.map((it) => ({ item_id: String(it.producto_id), item_name: it.nombre, price: Number(it.precio), quantity: Number(it.cantidad) })),
      }]);
      await db.actualizarPedido(pedido.id, { ga_enviado: 1 });
    }
  }
  res.render('pedido', { titulo: `Pedido ${pedido.orden_compra}`, pedido, ga });
});

module.exports = router;
