/**
 * Script del cliente.
 * Envía las Core Web Vitals (LCP, INP, CLS) y también FCP y TTFB a GA4 como eventos,
 * siguiendo la recomendación oficial de Google (https://github.com/GoogleChrome/web-vitals).
 * En GA4 se analizan con el parámetro personalizado "metric_value" / "metric_rating".
 */
(function () {
  function enviarAGA(metrica) {
    if (typeof gtag !== 'function') return;
    gtag('event', metrica.name, {
      value: metrica.delta, // GA4 suma "value": se envía el delta para no duplicar
      metric_id: metrica.id, // permite agrupar los deltas de una misma medición
      metric_value: metrica.value,
      metric_delta: metrica.delta,
      metric_rating: metrica.rating, // good | needs-improvement | poor
      page_path: location.pathname,
    });
  }

  function iniciar() {
    if (!window.webVitals) return;
    var wv = window.webVitals;
    wv.onLCP(enviarAGA);
    wv.onINP(enviarAGA);
    wv.onCLS(enviarAGA);
    wv.onFCP(enviarAGA);
    wv.onTTFB(enviarAGA);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  // Filtros: aplicar automáticamente al cambiar un select del catálogo
  var form = document.getElementById('form-filtros');
  if (form) {
    form.querySelectorAll('select').forEach(function (s) {
      s.addEventListener('change', function () { form.submit(); });
    });
  }
})();
