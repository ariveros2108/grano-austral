/**
 * Configuración de la aplicación Express (sin levantar el servidor, para poder testearla).
 */
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const config = require('./config');
const metricas = require('./lib/metricas');
const { clp, cantidadEnCarrito } = require('./lib/utilidades');
const { esc } = require('./lib/imagenes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1); // detrás del proxy HTTPS del proveedor cloud
app.disable('x-powered-by');

// Valores por defecto para las vistas (por si se renderiza un error antes del middleware de sesión)
Object.assign(app.locals, {
  gaId: config.gaId, gaDebug: config.gaDebug, clp, esc,
  usuario: null, cantidadCarrito: 0, flash: null, gaPendientes: [], q: '', rutaActual: '',
});

app.use(metricas.middleware);
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: config.entorno === 'production' ? '1d' : 0 }));
// Librería web-vitals servida desde node_modules (sin CDN externo)
app.get('/js/web-vitals.iife.js', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'node_modules', 'web-vitals', 'dist', 'web-vitals.iife.js'), { maxAge: '7d' })
);
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(
  cookieSession({
    name: 'ga_sesion',
    keys: [config.sessionSecret],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    httpOnly: true,
    secure: config.cookieSegura,
  })
);

// Variables disponibles en todas las vistas
app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  res.locals.cantidadCarrito = cantidadEnCarrito(req);
  res.locals.clp = clp;
  res.locals.esc = esc;
  res.locals.gaId = config.gaId;
  res.locals.gaDebug = config.gaDebug;
  res.locals.rutaActual = req.path;
  res.locals.q = typeof req.query.q === 'string' ? req.query.q : '';
  // Mensaje flash y eventos GA4 encolados: se leen una vez y se borran
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.gaPendientes = req.method === 'GET' ? req.session.gaEventos || [] : [];
  if (req.method === 'GET' && req.session.gaEventos) delete req.session.gaEventos;
  next();
});

app.use(require('./routes/sistema'));
app.use(require('./routes/tienda'));
app.use(require('./routes/carrito'));
app.use(require('./routes/cuenta').router);
app.use(require('./routes/checkout'));

app.get('/nosotros', (req, res) => res.render('nosotros', { titulo: 'Sobre este proyecto' }));

// 404
app.use((req, res) => {
  res.status(404).render('error', { titulo: 'Página no encontrada', mensaje: 'La página que buscas no existe o fue movida.' });
});

// Errores no controlados (Express 5 captura también los errores de funciones async)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).render('error', { titulo: 'Error del servidor', mensaje: 'Ocurrió un error inesperado. Intenta nuevamente.' });
});

module.exports = app;
