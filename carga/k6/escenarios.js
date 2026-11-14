/**
 * Definición de escenarios de carga (parametrizables por variables de entorno).
 *
 *  ESCENARIO   humo | baja | normal | pico | estres | tasa | personalizado
 *  VUS         usuarios virtuales objetivo (sobrescribe el del escenario)
 *  RAMP        duración del ramp-up (ej: 2m)
 *  DURACION    duración de la meseta (ej: 10m)
 *  RPS         iteraciones (sesiones de usuario) por segundo, solo para ESCENARIO=tasa
 *
 * Ejemplos:
 *  k6 run -e ESCENARIO=normal carga/k6/tienda.js
 *  k6 run -e ESCENARIO=personalizado -e VUS=80 -e RAMP=1m -e DURACION=5m carga/k6/tienda.js
 *  k6 run -e ESCENARIO=tasa -e RPS=5 -e DURACION=5m carga/k6/tienda.js
 */

const env = (k, def) => (__ENV[k] !== undefined && __ENV[k] !== '' ? __ENV[k] : def);
const num = (k, def) => Number(env(k, def));

export function construirEscenario(nombre) {
  switch (nombre) {
    case 'humo': // verificación rápida de que todo funciona
      return { executor: 'constant-vus', vus: num('VUS', 2), duration: env('DURACION', '30s') };

    case 'baja': // carga baja: pocos usuarios simultáneos
      return {
        executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '20s',
        stages: [
          { duration: env('RAMP', '1m'), target: num('VUS', 10) },
          { duration: env('DURACION', '4m'), target: num('VUS', 10) },
          { duration: '30s', target: 0 },
        ],
      };

    case 'normal': // carga sostenida "normal"
      return {
        executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '30s',
        stages: [
          { duration: env('RAMP', '2m'), target: num('VUS', 50) },
          { duration: env('DURACION', '8m'), target: num('VUS', 50) },
          { duration: '1m', target: 0 },
        ],
      };

    case 'pico': { // carga normal con un peak repentino (ej: campaña o Cyber)
      const base = num('VUS_BASE', 50);
      const peak = num('VUS', 200);
      return {
        executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '30s',
        stages: [
          { duration: '1m', target: base },
          { duration: '2m', target: base },
          { duration: env('RAMP', '30s'), target: peak }, // subida brusca
          { duration: env('DURACION', '3m'), target: peak },
          { duration: '30s', target: base },
          { duration: '2m', target: base }, // ¿se recupera el sistema?
          { duration: '30s', target: 0 },
        ],
      };
    }

    case 'estres': { // escalones crecientes para encontrar el punto de saturación
      const max = num('VUS', 400);
      const paso = env('DURACION', '2m');
      const niveles = [0.125, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
      const stages = [];
      for (const n of niveles) {
        stages.push({ duration: '30s', target: n }); // subida al escalón
        stages.push({ duration: paso, target: n });  // meseta para medir
      }
      stages.push({ duration: '1m', target: 0 });
      return { executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '30s', stages };
    }

    case 'tasa': // tasa fija de llegadas (modelo abierto, independiente de la latencia)
      return {
        executor: 'constant-arrival-rate',
        rate: num('RPS', 5), timeUnit: '1s', duration: env('DURACION', '5m'),
        preAllocatedVUs: num('VUS', 50), maxVUs: num('VUS', 50) * 4,
      };

    case 'personalizado':
      return {
        executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '30s',
        stages: [
          { duration: env('RAMP', '1m'), target: num('VUS', 20) },
          { duration: env('DURACION', '5m'), target: num('VUS', 20) },
          { duration: '30s', target: 0 },
        ],
      };

    default:
      throw new Error(`Escenario desconocido: ${nombre}`);
  }
}

/**
 * Umbrales (SLO de referencia). No abortan la prueba: el objetivo es observar la degradación completa,
 * y el resultado (cumple / no cumple) queda en el resumen para el informe.
 */
export function construirUmbrales() {
  return {
    http_req_failed: ['rate<0.01'],                 // < 1 % de errores
    'http_req_duration{tipo:pagina}': ['p(95)<800'], // p95 de páginas bajo 800 ms
    'http_req_duration{tipo:accion}': ['p(95)<1500'], // login, checkout, etc.
    checks: ['rate>0.98'],
  };
}
