// ===================================================================
//  /api/inmuebles.js   —   Función Serverless (Vercel, Node.js)
//
//  Esta función vive en el SERVIDOR. Guarda las credenciales del CRM
//  en variables de entorno (NUNCA en el navegador) y le entrega al
//  frontend solo la lista de inmuebles ya limpia.
//
//  Variables de entorno necesarias (configúralas en Vercel):
//    CRM_API_KEY     = b1638d2e-63c0-4830-b3cc-2e8b3a532c3f
//    CRM_API_SECRET  = (tu secret)
// ===================================================================

const BASE = 'https://crmred.co/api/external/v1';
const TTL  = 5 * 60 * 1000;        // caché en memoria: 5 minutos
const PER_PAGE = 100;              // máximo permitido por el CRM
const MAX_PAGES = 30;              // tope de seguridad (hasta 3.000 inmuebles)

let cache = { ts: 0, data: null }; // caché por instancia (reduce llamadas al CRM)

module.exports = async (req, res) => {
  // CORS abierto: permite incrustar el inventario también en otros dominios (ej. GHL)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const KEY = process.env.CRM_API_KEY;
  const SECRET = process.env.CRM_API_SECRET;
  if (!KEY || !SECRET) {
    return res.status(500).json({
      success: false,
      error: 'Faltan las variables de entorno CRM_API_KEY y CRM_API_SECRET en Vercel.'
    });
  }

  const forzar = req.query && (req.query.refresh === '1' || req.query.refresh === 'true');

  // Servir desde caché si está fresca
  if (!forzar && cache.data && (Date.now() - cache.ts) < TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json({ success: true, cached: true, total: cache.data.length, data: cache.data });
  }

  try {
    const headers = { 'X-Api-Key': KEY, 'X-Api-Secret': SECRET, 'Accept': 'application/json' };
    let page = 1, totalPages = 1, crudos = [];

    do {
      const r = await fetch(`${BASE}/properties?per_page=${PER_PAGE}&page=${page}`, { headers });
      if (!r.ok) {
        const detalle = await r.text().catch(() => '');
        return res.status(r.status).json({
          success: false,
          error: `El CRM respondió ${r.status}.` + (r.status === 401 ? ' Revisa tus credenciales.' : r.status === 429 ? ' Límite de peticiones excedido, intenta en un minuto.' : ''),
          detail: detalle.slice(0, 300)
        });
      }
      const json = await r.json();
      const bloque = (json && json.data) || {};
      const filas = Array.isArray(bloque.data) ? bloque.data : (Array.isArray(json.data) ? json.data : []);
      crudos = crudos.concat(filas);

      const total = bloque.total || filas.length;
      totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
      page++;
    } while (page <= totalPages && page <= MAX_PAGES);

    const data = crudos.map(normalizar);
    cache = { ts: Date.now(), data };
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json({ success: true, cached: false, total: data.length, data });

  } catch (e) {
    return res.status(502).json({
      success: false,
      error: 'No se pudo conectar con el CRM.',
      detail: String((e && e.message) || e)
    });
  }
};

// ---------- helpers de normalización ----------
function obj(v){ return v && typeof v === 'object' ? v : null; }
function nombre(v){ const o = obj(v); if (o) return o.name || o.tipo || o.nombre || null; return (v == null ? null : v); }
function num(v){ if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function ent(v){ const n = parseInt(v, 10); return (Number.isFinite(n) && n > 0) ? n : null; }

function caracteristicas(p){
  const out = [];
  Object.keys(p).forEach(k => {
    if (k.startsWith('caracteristicas_') && Array.isArray(p[k])) {
      p[k].forEach(c => { if (c && c.texto) out.push(c.texto); });
    }
  });
  return [...new Set(out)];
}

function normalizar(p){
  const imgs = (Array.isArray(p.InmuebleImagenes) ? p.InmuebleImagenes : [])
    .slice().sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(i => i.url).filter(Boolean);

  const ag = obj(p.creatorAgent) || {};
  const info = obj(ag.userdataInfo) || {};
  const nomAgente = [info.primer_nombre, info.primer_apellido].filter(Boolean).join(' ').trim();

  return {
    id: p.id,
    slug: p.slug || null,
    titulo: p.titulo_inmueble || 'Lote disponible',
    tipoInmueble: nombre(p.tipoInmueble) || nombre(p.tipo_inmueble),
    tipoNegocio: nombre(p.tipo_negocio),
    municipio: nombre(p.ciudad_id),
    departamento: nombre(p.estado_id),
    pais: nombre(p.pais_id),
    zona: nombre(p.zona_id),
    barrio: nombre(p.barrio_id),
    direccion: p.direccion || null,
    precioVenta: num(p.selling_price),
    precioArriendo: num(p.rental_price),
    habitaciones: ent(p.habitaciones),
    banos: ent(p.banos),
    garaje: ent(p.garaje),
    areaLote: num(p.area_lote),
    areaConstruida: num(p.area_contruida),
    estrato: nombre(p.estrato),
    descripcion: p.descripcion || null,
    lat: num(p.latitud),
    lng: num(p.longitud),
    video: p.url_video || null,
    imagenes: imgs,
    caracteristicas: caracteristicas(p),
    creado: p.created_at || null,
    estado: p.state_inmueble,
    agente: nomAgente ? { nombre: nomAgente, foto: info.foto_persona || null, email: ag.email || null } : null
  };
}
