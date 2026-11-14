#!/usr/bin/env node
/**
 * Monitor de signos vitales del servidor durante una prueba de carga.
 * Consulta /api/metricas cada N segundos y guarda una fila por muestra en un CSV
 * (CPU, memoria, event loop, throughput, latencias y errores), listo para graficar en Excel / Power BI.
 *
 * Uso (en otra terminal mientras corre k6):
 *   node carga/monitor.js https://tu-sitio.onrender.com 5 resultados/monitor-normal.csv
 *   (argumentos: URL base, intervalo en segundos, archivo de salida)
 * Variables opcionales: METRICAS_TOKEN si el servidor lo exige.
 * Detener con Ctrl+C.
 */
const fs = require('fs');
const path = require('path');

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const intervalo = Number(process.argv[3] || 5) * 1000;
const salida = process.argv[4] || `resultados/monitor-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.csv`;
const token = process.env.METRICAS_TOKEN || '';

fs.mkdirSync(path.dirname(path.resolve(salida)), { recursive: true });
const columnas = [
  'timestamp', 'uptime_s', 'cpu_pct', 'rss_mb', 'heap_mb', 'event_loop_p99_ms', 'peticiones', 'rps_10s',
  'lat_prom_ms', 'lat_mediana_ms', 'lat_p90_ms', 'lat_p95_ms', 'lat_p99_ms', 'errores_4xx', 'errores_5xx', 'tasa_error_pct', 'latencia_sonda_ms',
];
fs.writeFileSync(salida, columnas.join(',') + '\n');
console.log(`Monitoreando ${base}/api/metricas cada ${intervalo / 1000}s → ${salida}`);

async function muestrear() {
  const t0 = Date.now();
  try {
    const r = await fetch(`${base}/api/metricas`, { headers: { 'x-metricas-token': token } });
    const sonda = Date.now() - t0; // latencia vista desde el cliente
    const m = await r.json();
    const g = m.global;
    const fila = [
      m.timestamp, m.uptime_s, m.proceso.cpu_pct_desde_ultima_lectura, m.proceso.memoria_mb.rss, m.proceso.memoria_mb.heap_usado,
      m.proceso.event_loop_ms.p99, g.peticiones, g.throughput_rps_10s, g.latencia_ms.promedio, g.latencia_ms.mediana,
      g.latencia_ms.p90, g.latencia_ms.p95, g.latencia_ms.p99, g.errores_4xx, g.errores_5xx, g.tasa_error_pct, sonda,
    ];
    fs.appendFileSync(salida, fila.join(',') + '\n');
    console.log(`${m.timestamp.slice(11, 19)}  cpu ${String(fila[2]).padStart(5)}%  rss ${fila[3]}MB  rps ${fila[7]}  p95 ${fila[11]}ms  err ${fila[15]}%  sonda ${sonda}ms`);
  } catch (e) {
    fs.appendFileSync(salida, [new Date().toISOString(), ...Array(columnas.length - 2).fill(''), Date.now() - t0].join(',') + '\n');
    console.log(`${new Date().toISOString().slice(11, 19)}  sin respuesta (${e.message})`);
  }
}

muestrear();
setInterval(muestrear, intervalo);
