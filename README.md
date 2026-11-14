# Grano Austral ☕ — E-commerce para pruebas de desempeño

Trabajo semestral **INFB8091 Desempeño de Sistemas** · Universidad Tecnológica Metropolitana · 2° semestre 2026.

Tienda **ficticia** de café de especialidad, instrumentada con **Google Analytics 4** y **Core Web Vitals**, con métricas de servidor propias y **generadores de carga k6** para evaluar su desempeño bajo distintos escenarios.

> No se venden productos reales. Los pagos usan el **ambiente de integración (pruebas) de Webpay Plus** de Transbank.

---

## Contenido

1. [Funcionalidades](#1-funcionalidades)
2. [Arquitectura](#2-arquitectura)
3. [Ejecutar en local](#3-ejecutar-en-local)
4. [Deploy en la nube (Render + Turso)](#4-deploy-en-la-nube-render--turso)
5. [Configurar Google Analytics 4](#5-configurar-google-analytics-4)
6. [Pruebas de carga (k6)](#6-pruebas-de-carga-k6)
7. [Trabajar con Claude Code](#7-trabajar-con-claude-code)
8. [Checklist de entrega Fase 1](#8-checklist-de-entrega-fase-1)

---

## 1. Funcionalidades

| Requisito del enunciado | Implementación |
|---|---|
| Catálogo con filtros/búsqueda | `/productos`: búsqueda de texto, categoría, tueste, origen, rango de precio, orden y paginación |
| Carrito de compras | `/carrito`: agregar, actualizar cantidad, eliminar; envío gratis sobre $30.000 |
| Checkout con sandbox de pago chileno | `/checkout` → **Webpay Plus (integración)**. Tarjeta de prueba VISA `4051 8856 0044 6623`, CVV `123`, RUT `11.111.111-1`, clave `123` |
| Registro/login | `/registro`, `/login`, `/cuenta` (historial de pedidos). Contraseñas con bcrypt |
| 2–3 páginas con distinta carga de datos | Inicio (destacados + categorías), listado (consulta con filtros + conteo + orígenes), detalle (producto + relacionados) |
| GA4 con eventos personalizados | `view_item_list`, `search`, `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_payment_info`, `purchase`, `sign_up`, `login` |
| Métricas de engagement | Automáticas de GA4 (sesiones con interacción, tiempo de interacción, rebote, vistas por sesión) |
| Core Web Vitals (Fase 2) | LCP, INP, CLS, FCP, TTFB enviados como eventos GA4 |
| Métricas de servidor (Fase 2) | `/api/metricas`: latencia prom/mediana/p90/p95/p99 por ruta, rps, % error, CPU, memoria, event loop |
| Generadores de carga (Fase 1.2) | `carga/k6/tienda.js`: 4 perfiles de usuario, 6 escenarios parametrizables |

## 2. Arquitectura

```
                 ┌──────────────── Navegador ────────────────┐
                 │ HTML (EJS) · CSS · gtag.js · web-vitals    │──► Google Analytics 4
                 └───────────────┬───────────────────────────┘
                                 │ HTTPS
   k6 (usuarios sintéticos) ────►│
                                 ▼
             ┌──────── Render · Web Service (Node 22) ────────┐
             │ Express 5                                       │
             │  ├─ middleware de métricas → /api/metricas      │
             │  ├─ rutas: tienda · carrito · cuenta · checkout │──► Webpay Plus (integración)
             │  └─ cookie-session (carrito y usuario)          │
             └───────────────┬────────────────────────────────┘
                             │ libSQL (HTTPS)
                             ▼
                    Turso (SQLite gestionado)
```

- **Render en servidor (SSR)**: cada página la genera Node, así la carga de k6 ejercita realmente el servidor y la BD.
- **Sesión en cookie firmada**: el servidor no guarda estado → se puede escalar horizontalmente.
- **libSQL**: el mismo código usa un archivo SQLite en local y Turso en la nube.
- **Pago simulado**: método solo para k6, para no enviar miles de transacciones al sandbox de Transbank.

Estructura de carpetas: ver [`AGENTS.md`](AGENTS.md#2-stack-y-arquitectura).

## 3. Ejecutar en local

Requisitos: **Node.js 22.9 o superior** y **git**. Para pruebas de carga, **k6** (Windows: `winget install k6 --source winget`; macOS: `brew install k6`).

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 11 tests automáticos
```

Opcional: copiar `.env.example` a `.env` y completar `GA_MEASUREMENT_ID` para ver los eventos en GA4. Sin ID, los eventos se imprimen en la consola del navegador como `[GA4 simulado]`.

Usuarios de prueba precargados: `carga01@test.local` … `carga50@test.local`, contraseña `Carga123!`.

## 4. Deploy en la nube (Render + Turso)

**¿Por qué Render?** Ejecuta el proceso Node de forma continua (no serverless), así se pueden medir CPU, memoria y saturación del servidor en la Fase 2. **¿Por qué Turso?** El disco del plan gratuito de Render es efímero: sin una BD externa, los usuarios y pedidos se borran en cada reinicio.

### 4.1 Subir a GitHub
```bash
git remote add origin https://github.com/<usuario>/grano-austral.git
git push -u origin main
```
Agregar a los integrantes y al profesor como colaboradores (Settings → Collaborators).

### 4.2 Crear la base de datos en Turso
1. Entrar a <https://turso.tech> e iniciar sesión con GitHub (plan gratuito).
2. **Create Database** → nombre `grano-austral`, región más cercana a Render (ej: AWS us-east-1, Virginia).
3. Copiar la **URL** (`libsql://grano-austral-<usuario>.turso.io`) y crear un **token** (*Create Token*).
   Las tablas y el catálogo se crean solos al primer arranque.

### 4.3 Crear el servicio en Render
1. Entrar a <https://render.com> con GitHub → **New → Blueprint** → elegir el repositorio (usa `render.yaml`).
   *Alternativa manual:* New → Web Service → Build `npm ci --omit=dev`, Start `node server.js`, plan **Free**, Health check `/salud`.
2. Completar las variables: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `GA_MEASUREMENT_ID`.
3. Deploy. La URL queda como `https://grano-austral-xxxx.onrender.com`. Cada `git push` a `main` vuelve a desplegar.

**Límites del plan gratuito de Render (importantes para el informe):** 512 MB de RAM y una fracción de CPU; el servicio **se suspende tras ~15 minutos sin tráfico** y la primera petición posterior tarda alrededor de un minuto (*cold start*). Antes de cada prueba de carga, abrir el sitio y esperar a que responda.

## 5. Configurar Google Analytics 4

1. <https://analytics.google.com> → **Administrar → Crear → Propiedad**: nombre *Grano Austral*, zona horaria Chile, moneda **CLP**.
2. **Flujos de datos → Web**: URL del sitio en Render. Dejar activada la **medición mejorada**. Copiar el **ID de medición** `G-XXXXXXXXXX` y cargarlo en Render como `GA_MEASUREMENT_ID`.
3. Verificar: poner `GA_DEBUG=true` temporalmente y revisar **Administrar → DebugView** mientras se navega y compra.
4. **Acceso del profesor (obligatorio):** Administrar → *Administración del acceso a la propiedad* → ➕ → `j.aranda@utem.cl` → rol **Lector**.
5. **Eventos clave:** Administrar → Eventos → marcar `purchase` (y opcionalmente `add_to_cart`, `begin_checkout`, `sign_up`) como evento clave.
6. **Definiciones personalizadas** (para Web Vitals): Administrar → Definiciones personalizadas →
   - Dimensiones (ámbito *evento*): `metric_rating`, `metric_id`, `page_path`.
   - Métrica (ámbito *evento*): `metric_value` (unidad estándar).
7. **Embudo de conversión:** Explorar → *Exploración de embudo* con los pasos `view_item_list` → `view_item` → `add_to_cart` → `begin_checkout` → `purchase` (vitrina → carrito → compra → pago).
8. **Engagement:** Explorar → *Exploración libre* con métricas *Porcentaje de rebote*, *Duración media de la sesión*, *Vistas por sesión*, dimensión *Ruta de la página*.

> Los datos tardan entre 24 y 48 horas en aparecer en los informes estándar (DebugView y Tiempo real son inmediatos). **Navegar y comprar en el sitio desde ya** para tener datos en la entrega.
>
> k6 no ejecuta JavaScript, por lo que su tráfico **no aparece en GA4**. Para comparar GA4 “normal vs. bajo carga” (Fase 2), los integrantes deben navegar con un navegador real mientras corre la prueba de carga.

## 6. Pruebas de carga (k6)

### Perfiles de usuario (`carga/k6/tienda.js`)
| Perfil | Peso | Recorrido |
|---|---|---|
| Navegante | 40 % | inicio → categoría → 1-3 productos |
| Buscador | 25 % | inicio → búsqueda → filtros/orden → producto |
| Abandono de carrito | 20 % | navega → agrega al carrito → ve el carrito (30 % llega al checkout) → se va |
| Comprador | 15 % | login → navega → agrega 1-3 productos → checkout → pago (simulado) → confirmación |

### Escenarios (`carga/k6/escenarios.js`)
| Escenario | Perfil de carga (por defecto) | Para qué |
|---|---|---|
| `humo` | 2 VUs, 30 s | verificar que el script y el sitio funcionan |
| `baja` | ramp-up 1 min a 10 VUs, 4 min sostenido | línea base |
| `normal` | ramp-up 2 min a 50 VUs, 8 min sostenido | carga sostenida “normal” |
| `pico` | 50 VUs → salto a 200 VUs en 30 s, 3 min, vuelta a 50 | peak (campaña, Cyber) y recuperación |
| `estres` | escalones 12,5 % · 25 % · 50 % · 75 % · 100 % de 400 VUs, 2 min c/u | punto de saturación |
| `tasa` | llegadas constantes (`RPS` sesiones/s) | modelo abierto |
| `personalizado` | `VUS`, `RAMP`, `DURACION` | lo que se necesite |

Parámetros: `BASE_URL`, `ESCENARIO`, `VUS`, `VUS_BASE`, `RAMP`, `DURACION`, `RPS`, `THINK_MIN`, `THINK_MAX`, `MIX` (ej. `40,25,20,15`), `RECURSOS` (`true|false`).

### Ejecutar un escenario y guardar reportes

En una terminal, el monitor de signos vitales (CPU, memoria, latencias del servidor cada 5 s → CSV):
```bash
node carga/monitor.js https://grano-austral-xxxx.onrender.com 5 resultados/monitor-normal.csv
```
En otra terminal, k6 con su reporte HTML nativo:

**PowerShell (Windows)**
```powershell
$env:K6_WEB_DASHBOARD="true"; $env:K6_WEB_DASHBOARD_EXPORT="resultados/normal.html"
k6 run -e BASE_URL=https://grano-austral-xxxx.onrender.com -e ESCENARIO=normal carga/k6/tienda.js
```
**bash (macOS/Linux/Git Bash)**
```bash
K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=resultados/normal.html \
  k6 run -e BASE_URL=https://grano-austral-xxxx.onrender.com -e ESCENARIO=normal carga/k6/tienda.js
```
Cada ejecución deja en `resultados/`: `<escenario>-<fecha>.json` (datos completos), `.txt` (resumen con percentiles, throughput, errores, embudo y umbrales), el `.html` del dashboard y el `.csv` del monitor.

> Con la CPU limitada del plan gratuito, el sitio se satura con relativamente pocos usuarios; si `estres` colapsa muy temprano, bajar el máximo (`-e VUS=150`). Encontrar ese punto **es** el resultado buscado. Usar el sitio propio solamente y no dejar pruebas largas corriendo sin supervisión.

## 7. Trabajar con Claude Code

El enunciado exige desarrollar con un agente de codificación y registrar todos los prompts:

- `AGENTS.md`: contexto del proyecto y reglas (explicar antes de implementar, pedir confirmación, preguntar por commit/deploy, tests, español neutro).
- `CLAUDE.md`: lo importa y agrega reglas propias de Claude Code.
- `.claude/settings.json` + `.claude/hooks/registrar-prompt.js`: **cada prompt se agrega automáticamente a `LogFile.txt`** con fecha y hora; el agente completa `RESULTADO` y `MODELO`.
- `LogFile.txt`: ya contiene los prompts con los que se generó la versión inicial.

```bash
cd grano-austral
claude
```
Primer prompt sugerido: *“Lee AGENTS.md, LogFile.txt y el git log, y resúmeme el estado del proyecto y qué falta para la entrega de la Fase 1.”* Recordar copiar también los prompts al formulario del curso.

## 8. Checklist de entrega Fase 1

- [ ] Repositorio en GitHub con commits periódicos, compartido con el grupo y el profesor.
- [ ] Sitio desplegado en Render (+ Turso) y funcionando con HTTPS.
- [ ] GA4 con `GA_MEASUREMENT_ID` real, eventos verificados en DebugView, **acceso de lector a j.aranda@utem.cl**.
- [ ] Capturas de GA4: tiempo real, eventos, embudo, engagement.
- [ ] Al menos 3 escenarios ejecutados (baja, normal, pico/estrés) con reportes en `resultados/`.
- [ ] Informe técnico: arquitectura, metodología, resultados con gráficos, cuellos de botella y mejoras, conclusiones.
- [ ] Video con todos los integrantes visibles y la presentación de fondo.
- [ ] Prompts registrados en `LogFile.txt` y en el formulario del curso.
