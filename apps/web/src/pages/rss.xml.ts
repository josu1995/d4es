import type { APIRoute } from 'astro';
import { loadIndex, loadEstado } from '../lib/data';

/**
 * Feed de novedades. En vez de inventar un blog, publica lo que de verdad cambia en este
 * sitio: las builds que entran o se actualizan en cada ingesta automatica.
 */
export const GET: APIRoute = ({ site }) => {
  const indice = loadIndex();
  const estado = loadEstado();
  const base = site?.href ?? 'https://dapper-empanada-bb361f.netlify.app/';

  const escapar = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const recientes = [...indice.builds]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title))
    .slice(0, 50);

  const items = recientes
    .map((b) => {
      const url = new URL(`/builds/${b.classSlug}/${b.id}`, base).href;
      const desc = [
        b.tierLabel ? `Tier ${b.tierLabel}` : null,
        b.pitTier ? `Fosa ${b.pitTier}` : null,
        b.authors.length > 0 ? `por ${b.authors.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return `    <item>
      <title>${escapar(b.title)}</title>
      <link>${escapar(url)}</link>
      <guid isPermaLink="true">${escapar(url)}</guid>
      <pubDate>${new Date(b.updatedAt).toUTCString()}</pubDate>
      <description>${escapar(desc)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>D4es — builds de Diablo 4 en castellano</title>
    <link>${escapar(base)}</link>
    <description>Builds actualizadas de la temporada ${estado.temporadaActual} (parche ${estado.parche}), traducidas al espanol.</description>
    <language>es-ES</language>
    <lastBuildDate>${new Date(indice.generatedAt).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
};
