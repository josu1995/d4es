/**
 * Botón de refresco: dispara a mano el workflow de ingesta en GitHub, que descarga el
 * catálogo, normaliza y —solo si de verdad ha cambiado algo— commitea, lo que a su vez
 * dispara el despliegue de Netlify.
 *
 * Variables de entorno necesarias (Netlify → Site settings → Environment variables):
 *   GH_TOKEN     PAT de grano fino con permiso Actions: read and write sobre el repo.
 *   GH_REPO      "usuario/repositorio".
 *   REFRESH_KEY  Clave compartida. Sin ella cualquiera podría hacernos gastar minutos
 *                de Actions y deploys de Netlify a base de pulsar el botón.
 */

const WORKFLOW = 'ingest.yml';
const RAMA = 'main';

const json = (estado, cuerpo) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Usa POST' });

  const { GH_TOKEN, GH_REPO, REFRESH_KEY } = process.env;
  if (!GH_TOKEN || !GH_REPO || !REFRESH_KEY) {
    return json(500, { error: 'Faltan variables de entorno en el sitio de Netlify' });
  }

  const clave = req.headers.get('x-refresh-key');
  if (clave !== REFRESH_KEY) return json(401, { error: 'Clave incorrecta' });

  const res = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${GH_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ref: RAMA, inputs: { motivo: 'boton de refresco de la web' } }),
  });

  // GitHub devuelve 204 sin cuerpo cuando acepta el disparo.
  if (res.status !== 204) {
    const detalle = await res.text();
    return json(502, { error: `GitHub respondio ${res.status}`, detalle: detalle.slice(0, 500) });
  }

  return json(202, {
    ok: true,
    mensaje:
      'Ingesta lanzada. Si hay datos nuevos, la web se reconstruira sola en unos minutos; ' +
      'si no ha cambiado nada, no se tocara nada.',
    seguimiento: `https://github.com/${GH_REPO}/actions/workflows/${WORKFLOW}`,
  });
};

export const config = { path: '/api/refrescar' };
