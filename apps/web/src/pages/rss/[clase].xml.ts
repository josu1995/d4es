import type { APIRoute } from 'astro';
import { CLASSES, classById } from '@d4es/schema';
import { loadBuilds, loadClasesEs, claseNombre, loadHistorial, loadEstado } from '../../lib/data';

/**
 * Un feed por clase, con los CAMBIOS de sus builds.
 *
 * El feed general avisa de que una build se ha tocado; éste dice qué se ha tocado. Es el
 * uso natural del historial: sigues a tu clase y te enteras el día que el autor de la
 * guía que juegas cambia un aspecto, sin tener que entrar a mirar.
 *
 * Una entrada por build y pasada, con la lista de cambios en el cuerpo. Solo cambios de
 * ámbito `fuente`: los nuestros (parser, traducciones) no son noticia para nadie.
 */
export function getStaticPaths() {
  return CLASSES.map((c) => ({ params: { clase: c.slug } }));
}

const ETIQUETA_TIPO: Record<string, string> = {
  tier: 'Tier',
  pit: 'Fosa',
  habilidad: 'Habilidad',
  equipo: 'Equipo',
  engarce: 'Engarce',
  glifo: 'Glifo',
  tablero: 'Tablero',
  mercenario: 'Mercenario',
};

export const GET: APIRoute = ({ params, site }) => {
  const slug = params['clase'];
  const clase = CLASSES.find((c) => c.slug === slug);
  const base = site?.href ?? 'https://dapper-empanada-bb361f.netlify.app/';
  const estado = loadEstado();
  const historial = loadHistorial();
  const nombre = clase ? claseNombre(clase.id, loadClasesEs()) : (slug ?? '');

  const escapar = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const builds = loadBuilds().filter((b) => classById(b.classId)?.slug === slug);

  const items = builds
    .flatMap((b) =>
      (historial?.builds[b.id]?.entradas ?? [])
        .filter((e) => e.ambito === 'fuente')
        .map((e) => ({ build: b, entrada: e })),
    )
    .sort((a, b) => b.entrada.fecha.localeCompare(a.entrada.fecha))
    .slice(0, 50)
    .map(({ build, entrada }) => {
      const url = new URL(`/builds/${slug}/${build.id}`, base).href;
      const cuerpo = entrada.cambios
        .map((c) => {
          const que = ETIQUETA_TIPO[c.tipo] ?? c.tipo;
          const donde = c.donde ? ` (${c.donde})` : '';
          const antes = c.antes ? (c.antes.es ?? c.antes.en) : null;
          const despues = c.despues ? (c.despues.es ?? c.despues.en) : null;
          if (antes && despues) return `${que}${donde}: ${antes} → ${despues}`;
          if (despues) return `${que}${donde}: añadido ${despues}`;
          return `${que}${donde}: quitado ${antes}`;
        })
        .join(' · ');
      return `    <item>
      <title>${escapar(`${build.title.es}: ${entrada.cambios.length} ${entrada.cambios.length === 1 ? 'cambio' : 'cambios'}`)}</title>
      <link>${escapar(url)}</link>
      <guid isPermaLink="false">${escapar(`${url}#${entrada.fecha}`)}</guid>
      <pubDate>${new Date(entrada.fecha).toUTCString()}</pubDate>
      <description>${escapar(cuerpo)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>D4es — cambios en las builds de ${escapar(nombre)}</title>
    <link>${escapar(new URL(`/builds?clase=${slug}`, base).href)}</link>
    <description>Qué cambian los autores de las guías de ${escapar(nombre)} en la temporada ${estado.temporadaActual}.</description>
    <language>es-ES</language>
    <lastBuildDate>${new Date(historial?.generatedAt ?? Date.now()).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
};
