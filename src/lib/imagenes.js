/**
 * Ilustraciones SVG de productos generadas en el servidor.
 * Evita depender de fotos con derechos de autor y permite que cada producto tenga
 * una imagen coherente con la marca (color + forma según categoría).
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const FONDO = '#f6efe6';
const CAFE = '#3b2a20';

/** Ajusta el brillo de un color hex (factor < 1 oscurece, > 1 aclara). */
function tono(hex, factor) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function bolsa(p, molido) {
  const c = p.color || '#c26a2d';
  const tuestes = { claro: 1, medio: 2, oscuro: 3 };
  const nivel = tuestes[p.tueste] || 2;
  const puntos = [0, 1, 2].map((i) => `<circle cx="${178 + i * 22}" cy="300" r="7" fill="${i < nivel ? CAFE : 'none'}" stroke="${CAFE}" stroke-width="2"/>`).join('');
  const origen = esc((p.origen === 'Blend' ? 'BLEND' : p.origen || '').toUpperCase());
  const nombre = esc(String(p.nombre).split(' · ')[0].replace(' molido', ''));
  const kilo = p.peso_g >= 1000;
  return `
    <path d="M120 95 L280 95 L298 345 Q200 360 102 345 Z" fill="#d9b98c"/>
    <path d="M120 95 L280 95 L284 120 L116 120 Z" fill="#c9a676"/>
    <rect x="128" y="80" width="144" height="18" rx="3" fill="#b8925e"/>
    <rect x="122" y="150" width="156" height="132" rx="6" fill="${c}"/>
    <text x="200" y="178" text-anchor="middle" font-family="Georgia, serif" font-size="13" letter-spacing="3" fill="#fff">GRANO AUSTRAL</text>
    <line x1="140" y1="190" x2="260" y2="190" stroke="#fff" stroke-opacity=".6"/>
    <text x="200" y="222" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="20" fill="#fff">${origen}</text>
    <text x="200" y="246" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#fff">${nombre.length > 24 ? nombre.slice(0, 23) + '…' : nombre}</text>
    <text x="200" y="268" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#fff" fill-opacity=".85">${molido ? 'MOLIDO' : 'EN GRANO'} · ${kilo ? '1 KG' : '250 G'}</text>
    ${puntos}
    <text x="200" y="328" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="${CAFE}">TUESTE ${esc((p.tueste || '').toUpperCase())}</text>`;
}

function capsulas(p) {
  const c = p.color || CAFE;
  const caps = [];
  for (let i = 0; i < 5; i++) {
    const x = 110 + i * 45;
    caps.push(`<ellipse cx="${x}" cy="330" rx="19" ry="8" fill="${tono(c, 0.7)}"/><path d="M${x - 19} 330 L${x - 12} 300 L${x + 12} 300 L${x + 19} 330 Z" fill="${c}"/><ellipse cx="${x}" cy="300" rx="12" ry="5" fill="${tono(c, 1.3)}"/>`);
  }
  return `
    <rect x="110" y="90" width="180" height="190" rx="8" fill="${c}"/>
    <rect x="110" y="90" width="180" height="40" rx="8" fill="${tono(c, 0.8)}"/>
    <text x="200" y="116" text-anchor="middle" font-family="Georgia, serif" font-size="13" letter-spacing="3" fill="#fff">GRANO AUSTRAL</text>
    <circle cx="200" cy="190" r="36" fill="none" stroke="#fff" stroke-width="3"/>
    <circle cx="200" cy="190" r="22" fill="#fff" fill-opacity=".25"/>
    <text x="200" y="258" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="14" fill="#fff">CÁPSULAS</text>
    ${caps.join('')}`;
}

const metodos = {
  v60: (c) => `<path d="M120 120 L280 120 L220 250 L180 250 Z" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <path d="M140 140 L200 245 M260 140 L200 245 M170 130 L200 240 M230 130 L200 240" stroke="${CAFE}" stroke-opacity=".25" stroke-width="2"/>
    <rect x="150" y="250" width="100" height="14" rx="4" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <path d="M165 270 L235 270 L228 340 L172 340 Z" fill="#fff" fill-opacity=".6" stroke="${CAFE}" stroke-width="4"/>
    <rect x="172" y="300" width="56" height="38" fill="${CAFE}" fill-opacity=".8"/>`,
  prensa: (c) => `<rect x="190" y="70" width="20" height="40" fill="${CAFE}"/><circle cx="200" cy="66" r="12" fill="${CAFE}"/>
    <rect x="140" y="108" width="120" height="16" rx="4" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <rect x="145" y="124" width="110" height="210" rx="6" fill="#fff" fill-opacity=".55" stroke="${CAFE}" stroke-width="4"/>
    <rect x="149" y="210" width="102" height="120" fill="${CAFE}" fill-opacity=".85"/>
    <path d="M255 150 Q300 150 300 200 Q300 260 255 270" fill="none" stroke="${c}" stroke-width="12"/>
    <rect x="140" y="334" width="120" height="12" rx="4" fill="${c}" stroke="${CAFE}" stroke-width="4"/>`,
  moka: (c) => `<path d="M150 90 L250 90 L235 200 L165 200 Z" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <path d="M140 90 L260 90 L255 80 L145 80 Z" fill="${tono(c, 0.8)}" stroke="${CAFE}" stroke-width="4"/>
    <rect x="160" y="200" width="80" height="16" fill="${tono(c, 0.7)}" stroke="${CAFE}" stroke-width="4"/>
    <path d="M165 216 L235 216 L255 340 L145 340 Z" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <path d="M250 110 L295 110 L295 170 L240 180" fill="none" stroke="${CAFE}" stroke-width="10"/>
    <path d="M150 95 L125 115" stroke="${CAFE}" stroke-width="6"/>`,
  chemex: (c) => `<path d="M140 80 L260 80 L210 200 L260 340 L140 340 L190 200 Z" fill="#fff" fill-opacity=".55" stroke="${CAFE}" stroke-width="4"/>
    <path d="M158 300 L242 300 L260 340 L140 340 Z" fill="${CAFE}" fill-opacity=".85"/>
    <path d="M178 170 L222 170 L214 228 L186 228 Z" fill="${c}" stroke="${CAFE}" stroke-width="3"/>
    <rect x="193" y="186" width="14" height="30" rx="5" fill="${tono(c, 0.7)}"/>`,
  aeropress: (c) => `<rect x="160" y="70" width="80" height="120" rx="6" fill="${tono(c, 1.4)}" stroke="${CAFE}" stroke-width="4"/>
    <rect x="150" y="160" width="100" height="150" rx="6" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <rect x="140" y="300" width="120" height="16" rx="4" fill="${tono(c, 0.7)}" stroke="${CAFE}" stroke-width="4"/>
    <path d="M150 316 L250 316 L240 345 L160 345 Z" fill="#fff" fill-opacity=".6" stroke="${CAFE}" stroke-width="4"/>
    <text x="200" y="245" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#fff">1 2 3 4</text>`,
  cold: (c) => `<rect x="140" y="90" width="120" height="250" rx="16" fill="#fff" fill-opacity=".5" stroke="${CAFE}" stroke-width="4"/>
    <rect x="144" y="170" width="112" height="166" rx="12" fill="${CAFE}" fill-opacity=".8"/>
    <rect x="182" y="100" width="36" height="200" rx="8" fill="${c}" fill-opacity=".6" stroke="${CAFE}" stroke-width="3"/>
    <rect x="130" y="76" width="140" height="20" rx="6" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <rect x="160" y="200" width="18" height="18" rx="3" fill="#dff3ff" opacity=".8"/><rect x="220" y="240" width="16" height="16" rx="3" fill="#dff3ff" opacity=".8"/>`,
  molinillo: (c) => `<rect x="160" y="140" width="80" height="200" rx="10" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <path d="M170 140 L230 140 L220 110 L180 110 Z" fill="${tono(c, 1.2)}" stroke="${CAFE}" stroke-width="4"/>
    <line x1="200" y1="110" x2="200" y2="85" stroke="${CAFE}" stroke-width="6"/>
    <line x1="200" y1="85" x2="290" y2="70" stroke="${CAFE}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="292" cy="70" r="13" fill="#a0522d"/>
    <rect x="160" y="250" width="80" height="8" fill="${CAFE}" fill-opacity=".4"/>`,
  balanza: (c) => `<rect x="90" y="200" width="220" height="110" rx="14" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <rect x="110" y="185" width="180" height="20" rx="6" fill="${tono(c, 1.5)}" stroke="${CAFE}" stroke-width="4"/>
    <rect x="130" y="235" width="140" height="44" rx="6" fill="#111"/>
    <text x="200" y="266" text-anchor="middle" font-family="Courier New, monospace" font-size="24" fill="#5dfc8d">18.0 g</text>`,
  hervidor: (c) => `<path d="M140 170 Q140 120 200 120 Q260 120 260 170 L270 330 L130 330 Z" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <path d="M140 220 Q90 200 85 120" fill="none" stroke="${CAFE}" stroke-width="8"/>
    <path d="M262 170 Q310 180 305 270" fill="none" stroke="${CAFE}" stroke-width="12" stroke-linecap="round"/>
    <ellipse cx="200" cy="118" rx="30" ry="8" fill="${CAFE}"/><rect x="120" y="330" width="160" height="14" rx="4" fill="${CAFE}"/>`,
  filtros: (c) => [0, 1, 2].map((i) => `<path d="M${110 + i * 25} ${140 + i * 25} L${250 + i * 25} ${140 + i * 25} L${215 + i * 25} ${310 + i * 25} L${145 + i * 25} ${310 + i * 25} Z" fill="${c}" stroke="${CAFE}" stroke-width="3"/>`).join(''),
  tamper: (c) => `<path d="M175 90 Q200 70 225 90 L235 250 L165 250 Z" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <rect x="185" y="250" width="30" height="30" fill="#b2bec3" stroke="${CAFE}" stroke-width="4"/>
    <rect x="135" y="280" width="130" height="40" rx="6" fill="#b2bec3" stroke="${CAFE}" stroke-width="4"/>`,
  cuchara: (c) => `<ellipse cx="160" cy="250" rx="55" ry="40" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <ellipse cx="160" cy="250" rx="38" ry="25" fill="${CAFE}" fill-opacity=".8"/>
    <rect x="205" y="160" width="20" height="120" rx="8" transform="rotate(45 215 220)" fill="${c}" stroke="${CAFE}" stroke-width="4"/>`,
  taza: (c) => `<path d="M120 160 L260 160 L245 320 Q190 340 135 320 Z" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <path d="M258 190 Q310 190 305 240 Q300 285 250 285" fill="none" stroke="${CAFE}" stroke-width="12"/>
    <ellipse cx="190" cy="162" rx="70" ry="12" fill="${CAFE}"/>
    <path d="M165 130 Q155 110 170 90 M200 135 Q190 110 205 85 M235 130 Q225 110 240 92" fill="none" stroke="${CAFE}" stroke-opacity=".35" stroke-width="5" stroke-linecap="round"/>
    <text x="190" y="250" text-anchor="middle" font-family="Georgia, serif" font-size="13" letter-spacing="2" fill="#fff" fill-opacity=".9">GA</text>`,
  termo: (c) => `<rect x="160" y="70" width="80" height="34" rx="8" fill="${CAFE}"/>
    <rect x="155" y="100" width="90" height="250" rx="22" fill="${c}" stroke="${CAFE}" stroke-width="4"/>
    <rect x="155" y="160" width="90" height="40" fill="#fff" fill-opacity=".2"/>
    <text x="200" y="186" text-anchor="middle" font-family="Georgia, serif" font-size="12" letter-spacing="2" fill="#fff">GRANO AUSTRAL</text>`,
  vaso: (c) => `<path d="M145 110 L255 110 L240 340 L160 340 Z" fill="#fff" fill-opacity=".55" stroke="${CAFE}" stroke-width="4"/>
    <path d="M150 180 L250 180 L245 260 L155 260 Z" fill="${c}" stroke="${CAFE}" stroke-width="3"/>
    <path d="M152 150 L248 150 L240 340 L160 340 Z" fill="${CAFE}" fill-opacity=".35"/>
    <rect x="138" y="94" width="124" height="20" rx="6" fill="${CAFE}"/>`,
};

/** Devuelve el SVG (string) que representa al producto. */
function svgProducto(p) {
  let cuerpo;
  if (p.forma === 'bolsa' || p.forma === 'bolsa-molido') cuerpo = bolsa(p, p.forma === 'bolsa-molido');
  else if (p.forma === 'capsulas') cuerpo = capsulas(p);
  else cuerpo = (metodos[p.forma] || metodos.taza)(p.color || '#c26a2d');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="${esc(p.nombre)}">
  <rect width="400" height="400" fill="${FONDO}"/>
  <circle cx="200" cy="215" r="165" fill="${tono(p.color || '#c26a2d', 1.0)}" fill-opacity=".08"/>
  ${cuerpo}
</svg>`;
}

module.exports = { svgProducto, esc };
