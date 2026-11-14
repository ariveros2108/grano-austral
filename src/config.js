/**
 * Configuración central de la aplicación.
 * Todo se lee desde variables de entorno (ver .env.example) con valores por defecto
 * pensados para desarrollo local.
 */
const bool = (v, def = false) => (v === undefined ? def : ['1', 'true', 'si', 'yes'].includes(String(v).toLowerCase()));

const config = {
  puerto: Number(process.env.PORT || 3000),
  entorno: process.env.NODE_ENV || 'development',

  // Base de datos: SQLite local por defecto; en la nube se usa Turso (libSQL) con DATABASE_URL + DATABASE_AUTH_TOKEN
  dbUrl: process.env.DATABASE_URL || 'file:data/tienda.db',
  dbToken: process.env.DATABASE_AUTH_TOKEN || undefined,

  // Sesión (cookie firmada). En producción DEBE definirse SESSION_SECRET.
  sessionSecret: process.env.SESSION_SECRET || 'solo-para-desarrollo-cambiar',
  // Cookie solo por HTTPS: activada por defecto en producción (el proveedor cloud entrega HTTPS)
  cookieSegura: bool(process.env.COOKIE_SEGURA, (process.env.NODE_ENV || 'development') === 'production'),

  // Google Analytics 4. Si está vacío, los eventos se muestran en la consola del navegador.
  gaId: process.env.GA_MEASUREMENT_ID || '',
  gaDebug: bool(process.env.GA_DEBUG, false),

  // Webpay Plus (Transbank) en ambiente de INTEGRACIÓN (sandbox). Nunca se usa producción.
  webpayCommerceCode: process.env.WEBPAY_COMMERCE_CODE || undefined,
  webpayApiKey: process.env.WEBPAY_API_KEY || undefined,
  baseUrl: process.env.BASE_URL || '', // si está vacío se deduce de la petición

  // Pago simulado: permite a los generadores de carga completar compras sin pasar por Webpay.
  pagoSimulado: bool(process.env.PAGO_SIMULADO_HABILITADO, true),

  // Costo de bcrypt (afecta CPU en login/registro: dato interesante para la Fase 2)
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),

  // Crea usuarios carga01..carga50@test.local para los generadores de carga
  sembrarUsuariosCarga: bool(process.env.SEMBRAR_USUARIOS_CARGA, true),

  // Si se define, /api/metricas exige ?token=...
  metricasToken: process.env.METRICAS_TOKEN || '',

  productosPorPagina: 12,
};

module.exports = config;
