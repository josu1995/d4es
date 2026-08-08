# d4es — Builds y guías de Diablo 4 en castellano

Web estática que reúne builds de Diablo 4, las traduce usando la **localización oficial del juego** y
añade guías propias sobre lo que no existe en español: crafteo de míticos, jefes y materiales.

Se actualiza sola: un proceso revisa la fuente cada 6 horas y, **solo si los datos han cambiado de
verdad**, los commitea y la web se reconstruye.

## Puesta en marcha

```bash
npm install
npm run i18n:sync      # descarga la localización oficial (necesita salir a internet)
npm run i18n:build     # compila data/i18n/dictionary.esES.json
npm run scrape:catalog # descarga el catálogo de d4builds
npm run normalize      # data/raw -> data/canonical
npm run data:verify
npm run dev            # http://localhost:4321
```

Sin acceso a d4builds (por ejemplo desde una red que lo bloquee), `normalize` cae automáticamente a
las fixtures de `apps/scraper/fixtures/` y avisa por pantalla. Sirve para desarrollar la web, pero
los guardrails de volumen se desactivan y esos datos **no son publicables**.

Atajo para regenerarlo todo: `npm run data:refresh`.

## Cómo está montado

```
apps/web/          Astro 7 + Tailwind v4. Estático puro, sin framework de UI.
apps/scraper/      Ingesta en dos etapas y CLI de datos.
packages/schema/   Modelo canónico en Zod: GameRef, CanonicalBuild, correlación.
packages/i18n-d4/  Diccionario esES a partir de Diablo4Companion (MIT).
data/canonical/    Lo que publica la web. Versionado, con diffs legibles.
data/curated/      Lo que mantenemos a mano, siempre con procedencia.
data/reports/      Cobertura de traducción, candidatos de correlación, informe de ingesta.
```

### Las tres decisiones que explican el resto

**1. Una traducción sin procedencia no compila.** Todo término del juego es un `GameRef` con un campo
`i18n` cuyos valores posibles son `d4companion`, `wowhead-es`, `curated` o `none`. No existe
`machine` ni `llm`. Un `refine` de Zod hace fallar el build si algo lleva castellano con
`i18n: 'none'`. Cuando no hay traducción verificada se pinta el inglés con un distintivo `EN`
visible, que es preferible a inventar un nombre que el jugador no encontraría en su cliente.

El hueco conocido: Diablo4Companion no publica fichero de habilidades, así que los nombres de
habilidad van a mano en `data/curated/skills.esES.json`. `npm run build:pkgs && node
apps/scraper/dist/cli.js i18n:skills:scaffold` deja ahí la lista de pendientes ordenada por
frecuencia.

**2. La normalización es determinista y no mira el reloj.** Las fechas salen del snapshot, no de
`Date.now()`, y todo se serializa con las claves ordenadas. Consecuencia práctica: ejecutar el
pipeline dos veces seguidas deja el árbol de trabajo limpio, así que solo hay commit —y por tanto
deploy— cuando cambia algo real. Con el plan gratuito de Netlify (300 créditos al mes, 15 por
deploy) eso es la diferencia entre caber y no caber.

**3. Las fuentes no se fusionan nunca.** Cuando una build existe en dos sitios, coexisten como
variantes y se calcula qué comparten (`agree`), en qué difieren (`differ`) y qué tiene solo una
(`only-in`). El lector elige cuál mirar. Agrupar dos builds automáticamente exige un parecido de
0,90; entre 0,65 y 0,90 va a `data/reports/match-candidates.json` y espera confirmación humana.

## Postura sobre las fuentes

- **d4builds.gg**: se lee su catálogo público (`page-data/index/page-data.json`). Su `robots.txt` solo
  prohíbe `/?skills`. Guardamos datos estructurados —clase, habilidades, rangos, runas—, nunca el
  texto de las guías, y cada ficha enlaza al original y acredita al autor.
- **maxroll.gg**: **no se rastrea, ni una vez**. Su `robots.txt` (Ziff Davis) prohíbe expresamente el
  scraping, el text-and-data-mining, crear datasets y el uso comercial, y tiene
  `Disallow: /d4/planner/*`. Cuando llegue la importación, ocurrirá en el navegador del usuario con
  una URL que él pegue, y no se persistirá nada en el servidor.
- **Blizzard**: sitio de fans sin ánimo de lucro, sin afiliación. Los assets no se hotlinkean.

## Despliegue en Netlify

Conecta el repositorio; `netlify.toml` ya trae el comando y el directorio de publicación. Variables
de entorno a configurar en el sitio:

| Variable | Para qué |
|---|---|
| `GH_TOKEN` | PAT de grano fino con *Actions: read and write*, para el botón de refresco |
| `GH_REPO` | `usuario/repositorio` |
| `REFRESH_KEY` | Clave del botón de refresco (`/admin/refrescar`) |
| `SITE` | Dominio final, para las URLs canónicas y el sitemap |

En GitHub hay que permitir que Actions escriba en el repositorio
(*Settings → Actions → General → Workflow permissions → Read and write*), que es como el cron
publica los datos nuevos.

## Estado actual

Hecho: modelo de datos, diccionario (2426 términos oficiales), ingesta del catálogo con guardrails y
detección de cambio de esquema y de temporada, web con listado filtrable, ficha con selector de
fuente, buscador bilingüe de objetos, página de estado y la guía de contenido obsoleto. 53 tests.

Lo siguiente, por orden: rellenar las traducciones de habilidades, extraer equipo y Paragón con
Playwright, y el comparador con la importación de maxroll en el navegador.
