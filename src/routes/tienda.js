/**
 * Rutas públicas del catálogo: inicio, listado con filtros/búsqueda, detalle e imágenes.
 * Cada página tiene distinta carga de datos (requisito del enunciado):
 *  - Inicio: categorías + destacados (2 consultas livianas).
 *  - Listado: conteo + página filtrada + orígenes (consultas con LIKE y filtros).
 *  - Detalle: producto + relacionados.
 */
const express = require('express');
const db = require('../db');
const { itemGA } = require('../lib/utilidades');
const { svgProducto } = require('../lib/imagenes');

const router = express.Router();

router.get('/', async (req, res) => {
  const [categorias, destacados] = await Promise.all([db.obtenerCategorias(), db.obtenerDestacados(8)]);
  res.render('inicio', {
    titulo: 'Café de especialidad tostado en Santiago',
    categorias,
    destacados,
    ga: [['view_item_list', { item_list_id: 'destacados', item_list_name: 'Destacados inicio', items: destacados.map((p, i) => itemGA(p, 1, { index: i })) }]],
  });
});

const numero = (v) => (v === undefined || v === '' ? undefined : Number(v));

router.get('/productos', async (req, res) => {
  const filtros = {
    q: (req.query.q || '').toString().trim().slice(0, 80),
    categoria: (req.query.categoria || '').toString(),
    tueste: (req.query.tueste || '').toString(),
    origen: (req.query.origen || '').toString(),
    precioMin: numero(req.query.precio_min),
    precioMax: numero(req.query.precio_max),
    orden: (req.query.orden || 'relevancia').toString(),
    pagina: Number(req.query.pagina) || 1,
  };
  const [resultado, categorias, origenes] = await Promise.all([
    db.buscarProductos(filtros),
    db.obtenerCategorias(),
    db.obtenerOrigenes(),
  ]);
  const categoriaActual = categorias.find((c) => c.slug === filtros.categoria);

  const ga = [[
    'view_item_list',
    {
      item_list_id: filtros.categoria || 'catalogo',
      item_list_name: categoriaActual ? categoriaActual.nombre : 'Catálogo',
      items: resultado.productos.map((p, i) => itemGA(p, 1, { index: i })),
    },
  ]];
  if (filtros.q) ga.unshift(['search', { search_term: filtros.q }]);

  // Query string sin "pagina" para construir los enlaces de paginación
  const qs = new URLSearchParams(Object.entries(req.query).filter(([k, v]) => k !== 'pagina' && v !== '')).toString();

  res.render('productos', {
    titulo: filtros.q ? `Resultados para “${filtros.q}”` : categoriaActual ? categoriaActual.nombre : 'Catálogo',
    filtros, resultado, categorias, origenes, categoriaActual, qs, ga,
  });
});

router.get('/producto/:slug', async (req, res, next) => {
  const producto = await db.obtenerProductoPorSlug(req.params.slug);
  if (!producto) return next(); // 404
  const relacionados = await db.obtenerRelacionados(producto, 4);
  res.render('producto', {
    titulo: producto.nombre,
    producto,
    relacionados,
    ga: [['view_item', { currency: 'CLP', value: Number(producto.precio), items: [itemGA(producto)] }]],
  });
});

// Imágenes SVG generadas (con caché en memoria y en el navegador)
const cacheSvg = new Map();
router.get('/img/producto/:archivo', async (req, res, next) => {
  const slug = req.params.archivo.replace(/\.svg$/, '');
  let svg = cacheSvg.get(slug);
  if (!svg) {
    const p = await db.obtenerProductoPorSlug(slug);
    if (!p) return next();
    svg = svgProducto(p);
    cacheSvg.set(slug, svg);
  }
  res.set('Cache-Control', 'public, max-age=86400').type('image/svg+xml').send(svg);
});

module.exports = router;
