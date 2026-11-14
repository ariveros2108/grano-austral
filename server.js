/**
 * Punto de entrada: inicializa la base de datos y levanta el servidor HTTP.
 */
const config = require('./src/config');
const db = require('./src/db');
const app = require('./src/app');

if (config.entorno === 'production' && config.sessionSecret === 'solo-para-desarrollo-cambiar') {
  console.warn('[aviso] Define SESSION_SECRET en producción.');
}

db.inicializar()
  .then(() => {
    app.listen(config.puerto, () => {
      console.log(`Grano Austral escuchando en http://localhost:${config.puerto} (${config.entorno})`);
      console.log(`GA4: ${config.gaId || 'sin GA_MEASUREMENT_ID (eventos solo en consola)'} · BD: ${config.dbUrl.split('?')[0]}`);
    });
  })
  .catch((e) => {
    console.error('No se pudo inicializar la base de datos:', e);
    process.exit(1);
  });
