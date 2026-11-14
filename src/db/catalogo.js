/**
 * Catálogo semilla de "Grano Austral" (tienda ficticia).
 * Cada producto tiene campos distintos según su categoría; los que no aplican quedan en null.
 * `forma` y `color` se usan para generar la ilustración SVG del producto.
 */

const categorias = [
  { slug: 'cafe-grano', nombre: 'Café en grano', descripcion: 'Cafés de especialidad tostados en Santiago, enteros para moler en casa.' },
  { slug: 'cafe-molido', nombre: 'Café molido', descripcion: 'Los mismos orígenes, molidos según tu método de preparación.' },
  { slug: 'capsulas', nombre: 'Cápsulas', descripcion: 'Cápsulas compostables compatibles con Nespresso®.' },
  { slug: 'metodos', nombre: 'Métodos de preparación', descripcion: 'Cafeteras de filtro, inmersión y presión.' },
  { slug: 'accesorios', nombre: 'Accesorios', descripcion: 'Molinillos, balanzas, hervidores y filtros.' },
  { slug: 'tazas', nombre: 'Tazas y termos', descripcion: 'Para disfrutar en casa o llevar.' },
];

// Orígenes de café: [nombre, origen, región, proceso, tueste, notas, color, precio250]
const origenes = [
  ['Huila Lavado', 'Colombia', 'Huila', 'Lavado', 'medio', 'Panela, mandarina, cacao', '#c0392b', 9990],
  ['Yirgacheffe Natural', 'Etiopía', 'Gedeo', 'Natural', 'claro', 'Arándano, jazmín, té negro', '#8e44ad', 12990],
  ['Cerrado Mineiro', 'Brasil', 'Minas Gerais', 'Natural', 'oscuro', 'Chocolate, maní tostado, caramelo', '#6d4c41', 8490],
  ['Cajamarca Orgánico', 'Perú', 'Cajamarca', 'Lavado', 'medio', 'Durazno, miel, almendra', '#27ae60', 10490],
  ['Antigua Volcánico', 'Guatemala', 'Antigua', 'Lavado', 'medio', 'Cacao amargo, especias, naranja', '#d35400', 11490],
  ['Nyeri AA', 'Kenia', 'Nyeri', 'Lavado', 'claro', 'Grosella negra, pomelo, tomate dulce', '#16a085', 14990],
  ['Tarrazú Honey', 'Costa Rica', 'Tarrazú', 'Honey', 'medio', 'Manzana roja, miel de ulmo, vainilla', '#f39c12', 12490],
  ['Marcala', 'Honduras', 'La Paz', 'Lavado', 'oscuro', 'Chocolate con leche, nuez, azúcar morena', '#795548', 8990],
  ['Caranavi', 'Bolivia', 'Yungas', 'Lavado', 'claro', 'Frutilla, flor de azahar, panela', '#e84393', 13490],
  ['Chiapas Altura', 'México', 'Chiapas', 'Lavado', 'medio', 'Caramelo, ciruela, canela', '#2980b9', 9490],
  ['Blend Cordillera', 'Blend', 'Brasil · Colombia · Perú', 'Mezcla', 'oscuro', 'Chocolate amargo, frutos secos, cuerpo alto', '#3b2a20', 7990],
  ['Blend Pacífico', 'Blend', 'Etiopía · Colombia', 'Mezcla', 'medio', 'Frutos rojos, cacao, dulzor balanceado', '#1f6f8b', 8990],
];

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Valoración pseudoaleatoria estable (depende del nombre) para que el catálogo sea reproducible
const valoracionPara = (nombre) => {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Math.round((3.8 + (h % 12) / 10) * 10) / 10; // 3.8 – 4.9
};

const productos = [];

// Café en grano (250 g y 1 kg) y molido (250 g)
for (const [nombre, origen, region, proceso, tueste, notas, color, precio] of origenes) {
  const base = { origen, region, proceso, tueste, notas, color };
  productos.push({
    ...base,
    nombre: `${nombre} · 250 g`,
    categoria: 'cafe-grano',
    precio,
    peso_g: 250,
    forma: 'bolsa',
    destacado: ['Huila Lavado', 'Yirgacheffe Natural', 'Blend Cordillera', 'Tarrazú Honey'].includes(nombre) ? 1 : 0,
    descripcion: `Café de ${region}${origen !== 'Blend' ? `, ${origen}` : ''}, proceso ${proceso.toLowerCase()} y tueste ${tueste}. En taza encontrarás notas de ${notas.toLowerCase()}. Tostado cada semana en nuestra tostaduría.`,
  });
  if (['Huila Lavado', 'Cerrado Mineiro', 'Blend Cordillera', 'Blend Pacífico', 'Marcala', 'Cajamarca Orgánico'].includes(nombre)) {
    productos.push({
      ...base,
      nombre: `${nombre} · 1 kg`,
      categoria: 'cafe-grano',
      precio: Math.round((precio * 3.3) / 10) * 10 - 10,
      peso_g: 1000,
      forma: 'bolsa',
      destacado: 0,
      descripcion: `Formato ahorro de 1 kg de nuestro ${nombre}. Ideal para oficinas o para quienes preparan varias tazas al día. Notas de ${notas.toLowerCase()}.`,
    });
  }
  if (!['Nyeri AA', 'Caranavi'].includes(nombre)) {
    productos.push({
      ...base,
      nombre: `${nombre} molido · 250 g`,
      categoria: 'cafe-molido',
      precio: precio + 500,
      peso_g: 250,
      forma: 'bolsa-molido',
      destacado: 0,
      descripcion: `${nombre} molido a medida (fino, medio o grueso). Proceso ${proceso.toLowerCase()}, tueste ${tueste}. Notas de ${notas.toLowerCase()}.`,
    });
  }
}

// Cápsulas
const capsulas = [
  ['Cápsulas Cordillera Intenso x10', 'oscuro', 'Chocolate amargo, tostado intenso', '#3b2a20', 4990],
  ['Cápsulas Huila x10', 'medio', 'Panela, mandarina', '#c0392b', 5490],
  ['Cápsulas Etiopía x10', 'claro', 'Arándano, floral', '#8e44ad', 5990],
  ['Cápsulas Descafeinado x10', 'medio', 'Caramelo, nuez (descafeinado al agua)', '#7f8c8d', 5490],
  ['Pack degustación 40 cápsulas', 'medio', 'Cuatro perfiles de nuestra carta', '#c26a2d', 18990],
];
for (const [nombre, tueste, notas, color, precio] of capsulas) {
  productos.push({
    nombre, categoria: 'capsulas', tueste, notas, color, precio, forma: 'capsulas', origen: null, region: null, proceso: null, peso_g: null,
    destacado: nombre.startsWith('Pack') ? 1 : 0,
    descripcion: `Cápsulas compostables compatibles con máquinas Nespresso® Original. Perfil: ${notas.toLowerCase()}.`,
  });
}

// Métodos de preparación: [nombre, forma, material, capacidad, color, precio, descripción]
const metodos = [
  ['Gotero V60 cerámico', 'v60', 'Cerámica', '1–4 tazas', '#ecf0f1', 19990, 'El clásico gotero cónico para una taza limpia y aromática.'],
  ['Gotero V60 plástico', 'v60', 'Plástico libre de BPA', '1–4 tazas', '#e74c3c', 8990, 'Liviano e irrompible, ideal para viajes.'],
  ['Prensa francesa 600 ml', 'prensa', 'Vidrio borosilicato y acero', '600 ml', '#bdc3c7', 24990, 'Inmersión total para un café con cuerpo.'],
  ['Prensa francesa 1 L', 'prensa', 'Vidrio borosilicato y acero', '1 L', '#95a5a6', 29990, 'Para compartir en la mesa del desayuno.'],
  ['Cafetera moka 6 tazas', 'moka', 'Aluminio', '6 tazas', '#7f8c8d', 22990, 'La cafetera italiana de toda la vida.'],
  ['Cafetera moka inducción 4 tazas', 'moka', 'Acero inoxidable', '4 tazas', '#2c3e50', 34990, 'Compatible con cocinas de inducción.'],
  ['Chemex 6 tazas', 'chemex', 'Vidrio y madera', '6 tazas', '#d7ccc8', 49990, 'Diseño icónico y filtro grueso para una taza muy limpia.'],
  ['AeroPress Original', 'aeropress', 'Polipropileno', '1–3 tazas', '#34495e', 39990, 'Versátil, rápida y perfecta para experimentar recetas.'],
  ['Kit cold brew 1 L', 'cold', 'Vidrio y filtro de acero', '1 L', '#5dade2', 21990, 'Café de extracción en frío para el verano.'],
];
for (const [nombre, forma, material, capacidad, color, precio, desc] of metodos) {
  productos.push({
    nombre, categoria: 'metodos', forma, material, capacidad, color, precio, origen: null, region: null, proceso: null, tueste: null, notas: null, peso_g: null,
    destacado: ['Chemex 6 tazas', 'AeroPress Original'].includes(nombre) ? 1 : 0,
    descripcion: `${desc} Material: ${material.toLowerCase()}. Capacidad: ${capacidad}.`,
  });
}

// Accesorios
const accesorios = [
  ['Molinillo manual de muelas cónicas', 'molinillo', 'Acero inoxidable', null, '#7f8c8d', 44990, 'Molienda uniforme con 30 niveles de ajuste.'],
  ['Molinillo eléctrico de muelas', 'molinillo', 'Plástico y acero', null, '#2d3436', 89990, '40 ajustes de molienda, desde espresso a prensa.'],
  ['Balanza digital con temporizador', 'balanza', 'Plástico ABS', 'Hasta 3 kg', '#2d3436', 24990, 'Precisión de 0,1 g y cronómetro integrado.'],
  ['Hervidor cuello de cisne', 'hervidor', 'Acero inoxidable', '1 L', '#b2bec3', 54990, 'Control de temperatura y vertido preciso.'],
  ['Filtros de papel V60 x100', 'filtros', 'Papel sin blanquear', '100 unidades', '#e0c9a6', 5990, 'Filtros compostables para goteros cónicos.'],
  ['Filtros Chemex x100', 'filtros', 'Papel blanqueado con oxígeno', '100 unidades', '#f5f5f5', 11990, 'Filtros gruesos originales para Chemex.'],
  ['Tamper de acero 58 mm', 'tamper', 'Acero y madera', '58 mm', '#a0522d', 17990, 'Compactado parejo para tu espresso.'],
  ['Cuchara medidora con clip', 'cuchara', 'Acero inoxidable', '10 g', '#b2bec3', 3990, 'Mide y cierra tu bolsa de café.'],
];
for (const [nombre, forma, material, capacidad, color, precio, desc] of accesorios) {
  productos.push({
    nombre, categoria: 'accesorios', forma, material, capacidad, color, precio, origen: null, region: null, proceso: null, tueste: null, notas: null, peso_g: null,
    destacado: nombre.startsWith('Molinillo manual') ? 1 : 0,
    descripcion: `${desc} Material: ${material.toLowerCase()}.${capacidad ? ` Capacidad: ${capacidad}.` : ''}`,
  });
}

// Tazas y termos
const tazas = [
  ['Taza cerámica Grano Austral 300 ml', 'taza', 'Cerámica', '300 ml', '#c26a2d', 8990],
  ['Set 2 tazas espresso', 'taza', 'Porcelana', '90 ml c/u', '#ecf0f1', 12990],
  ['Taza esmaltada Cordillera', 'taza', 'Acero esmaltado', '350 ml', '#2f5d50', 9990],
  ['Termo de acero 500 ml', 'termo', 'Acero inoxidable doble pared', '500 ml', '#2f5d50', 19990],
  ['Vaso reutilizable 350 ml', 'vaso', 'Vidrio y corcho', '350 ml', '#d7ccc8', 11990],
];
for (const [nombre, forma, material, capacidad, color, precio] of tazas) {
  productos.push({
    nombre, categoria: 'tazas', forma, material, capacidad, color, precio, origen: null, region: null, proceso: null, tueste: null, notas: null, peso_g: null,
    destacado: 0,
    descripcion: `${nombre}. Material: ${material.toLowerCase()}. Capacidad: ${capacidad}.`,
  });
}

// Campos derivados
for (const p of productos) {
  p.slug = slugify(p.nombre);
  p.valoracion = valoracionPara(p.nombre);
  p.material = p.material || null;
  p.capacidad = p.capacidad || null;
}

module.exports = { categorias, productos, slugify };
