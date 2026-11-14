/**
 * Endpoints técnicos para monitoreo y pruebas de carga.
 *  GET  /salud               -> estado del servicio y de la base de datos (health check del proveedor cloud).
 *  GET  /api/metricas        -> latencias (prom, mediana, p90/p95/p99), throughput, errores, CPU, memoria.
 *  POST /api/metricas/reset  -> reinicia los contadores (útil al comenzar cada escenario de carga).
 */
const express = require('express');
const db = require('../db');
const config = require('../config');
const metricas = require('../lib/metricas');

const router = express.Router();

const autorizado = (req) => !config.metricasToken || req.query.token === config.metricasToken || req.get('x-metricas-token') === config.metricasToken;

router.get('/salud', async (req, res) => {
  const t0 = Date.now();
  try {
    await db.db().execute('SELECT 1');
    res.json({ estado: 'ok', db_ms: Date.now() - t0, uptime_s: Math.round(process.uptime()) });
  } catch (e) {
    res.status(503).json({ estado: 'error', detalle: e.message });
  }
});

router.get('/api/metricas', (req, res) => {
  if (!autorizado(req)) return res.status(401).json({ error: 'token requerido' });
  res.set('Cache-Control', 'no-store').json(metricas.instantanea());
});

router.post('/api/metricas/reset', (req, res) => {
  if (!autorizado(req)) return res.status(401).json({ error: 'token requerido' });
  metricas.reiniciar();
  res.json({ ok: true });
});

module.exports = router;
