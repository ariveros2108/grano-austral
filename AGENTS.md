# AGENTS.md — Grano Austral (INFB8091 Desempeño de Sistemas, UTEM)

Instrucciones para cualquier agente generativo de codificación (Claude Code, Codex, Copilot, Gemini, etc.) que trabaje en este repositorio. **Léelas completas al iniciar cada sesión.**

## 1. El proyecto

Trabajo semestral del ramo **INFB8091 Desempeño de Sistemas** (UTEM, 2° semestre 2026). El enunciado completo está en `docs/enunciado.pdf`.

- **Objetivo:** diseñar, implementar y evaluar el desempeño de un sitio de comercio electrónico bajo distintas condiciones de carga (performance engineering).
- **Opción elegida:** Opción 1 — Comercio electrónico.
- **Comercio:** **Grano Austral**, tostaduría *ficticia* de café de especialidad en Santiago. Vende café en grano y molido, cápsulas, métodos de preparación, accesorios y tazas. Precios en CLP. Paleta: espresso `#3b2a20`, crema `#f6efe6`, cobre `#c26a2d`, verde austral `#2f5d50`. Las imágenes de producto son SVG generados en `src/lib/imagenes.js` (no usar fotos con derechos de autor).
- **Fases:**
  - 1.1 Sitio funcional mínimo: catálogo con filtros/búsqueda, carrito, checkout con sandbox de pago chileno (Webpay Plus integración), registro/login, páginas con distinta carga de datos, GA4 con eventos de e-commerce y métricas de engagement.
  - 1.2 Generadores de carga (k6) con usuarios de comportamiento distinto y escenarios baja / normal / pico / estrés.
  - 2 Análisis de desempeño: latencia (promedio, mediana, p90/p95/p99), throughput, tasa de error, CPU/memoria/I-O, punto de saturación; Core Web Vitals, rebote, duración de sesión y embudo en GA4, comparando condiciones normales vs. bajo carga.

## 2. Stack y arquitectura

| Capa | Tecnología |
|---|---|
| Servidor | Node.js ≥ 20 + Express 5, render en servidor con EJS |
| Base de datos | libSQL (`@libsql/client`): SQLite local (`file:data/tienda.db`) o Turso en la nube |
| Sesión | `cookie-session` (cookie firmada, sin estado en el servidor) |
| Autenticación | `bcryptjs` (costo `BCRYPT_ROUNDS`) |
| Pago | `transbank-sdk` Webpay Plus, **solo ambiente de integración** + modo simulado para pruebas de carga |
| Analítica | GA4 vía `gtag.js` + librería `web-vitals` (LCP, INP, CLS, FCP, TTFB → eventos GA4) |
| Métricas servidor | `src/lib/metricas.js` → `GET /api/metricas` (percentiles, rps, errores, CPU, memoria, event loop) |
| Carga | k6 (`carga/k6/`), monitor de signos vitales (`carga/monitor.js`) |
| Tests | `node:test` + `supertest` (`test/`) |
| Deploy | Render (Web Service gratuito) + Turso (BD gratuita) |

Estructura:

```
server.js              arranque (inicializa BD y escucha)
src/app.js             configuración Express (middlewares, rutas, errores)
src/config.js          variables de entorno
src/db/                esquema, semilla del catálogo y consultas
src/lib/               métricas, carrito/GA4/utilidades, imágenes SVG
src/routes/            tienda, carrito, cuenta, checkout, sistema
views/                 plantillas EJS (partials/ = cabecera, pie, tarjeta)
public/                css, js del cliente, logo
carga/k6/              generadores de carga y escenarios
carga/monitor.js       muestreo de /api/metricas a CSV
test/                  tests automáticos
docs/                  enunciado y documentación
```

## 3. Comandos

```bash
npm install            # dependencias
npm run dev            # servidor con recarga (http://localhost:3000)
npm test               # tests automáticos (OBLIGATORIO antes de terminar una tarea)
npm run carga:humo     # prueba de carga corta contra localhost
k6 run -e BASE_URL=https://... -e ESCENARIO=normal carga/k6/tienda.js
```

## 4. Reglas de trabajo para el agente

1. **Registro de prompts (obligatorio por el enunciado).** Cada prompt del usuario se registra **completo** en `LogFile.txt` con fecha y hora (hora de Chile). En Claude Code esto lo hace automáticamente el hook `.claude/hooks/registrar-prompt.js`. Otros agentes deben agregarlo manualmente.
   Al **terminar** cada respuesta, el agente agrega bajo esa entrada un bloque `RESULTADO:` con una explicación resumida de lo que generó (qué instaló, qué diseñó, qué archivos cambió) y `MODELO:` con el modelo usado (ej: `Claude Opus 4.x`, `Claude Sonnet 4.x`).
2. **Al iniciar una sesión nueva**, leer las últimas entradas de `LogFile.txt` y `git log --oneline -15` para recuperar el contexto antes de proponer cambios.
3. **Control de versiones.** Usar git. Si una funcionalidad deja de funcionar, revisar `git diff` / `git log -p` para ver qué cambió antes de “arreglar a ciegas”.
4. **Explicar antes de implementar.** Antes de modificar código, explicar qué se hará y en qué archivos/módulos. **Aplicar solo después de la confirmación del usuario.**
5. **Al terminar una modificación, preguntar** si se hace commit de la versión y si se quiere hacer deploy.
6. **Testing automático:** proponer o actualizar tests para cada pieza nueva y ejecutar `npm test` antes de dar por terminada una tarea. Verificar sintaxis con `node --check <archivo>` si se tocan archivos no cubiertos por tests.
7. **Idioma:** español neutro latinoamericano en código (nombres, comentarios), interfaz, commits y documentación.
8. **Documentar el código:** cada archivo con un comentario inicial de propósito; funciones no triviales con JSDoc breve.
9. **No romper la instrumentación:** al cambiar vistas o rutas, mantener los eventos GA4 (`view_item_list`, `search`, `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_payment_info`, `purchase`, `sign_up`, `login`) y el middleware de métricas. Si cambia una ruta, actualizar los scripts de k6.
10. **Seguridad:** nunca subir secretos (`.env` está en `.gitignore`). Webpay solo en ambiente de **integración**. No usar marcas, logos o fotos de terceros.
11. **Desempeño primero:** este es un ramo de desempeño. Ante cambios, considerar su impacto en latencia/CPU/memoria y dejarlo anotado (sirve para el informe de la Fase 2).

## 5. En qué debe ser experto el agente

- Node.js/Express, SQL (SQLite/libSQL), plantillas EJS y HTML/CSS accesible y responsivo.
- Google Analytics 4 (comercio electrónico, eventos recomendados, explorations, embudos) y Core Web Vitals.
- Ingeniería de desempeño: k6, diseño de escenarios, percentiles, ley de Little, identificación de cuellos de botella.
- Deploy en nubes gratuitas (Render, Turso) y sus límites.
- Redacción de informes técnicos.

## 6. Uso sugerido de modelos

| Tarea | Modelo sugerido |
|---|---|
| Diseño de arquitectura, análisis de resultados de carga, informe | Modelo más capaz disponible (ej: Claude Opus) |
| Implementación y corrección de código del día a día | Modelo intermedio (ej: Claude Sonnet) |
| Consultas rápidas, renombrar, formatear | Modelo liviano (ej: Claude Haiku) |
| Gráficos / imágenes de marca | Generar como SVG en código |

## 7. Variables de entorno

Ver `.env.example`. En producción definir al menos: `NODE_ENV=production`, `SESSION_SECRET`, `GA_MEASUREMENT_ID`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`.
