# d4es — Builds y guías de Diablo 4 en castellano

Web estática que reúne las builds de Diablo 4, las traduce usando la **localización oficial del juego**
y añade lo que no existe en español: cómo se craftean los míticos, qué suelta cada jefe y dónde se
farmea cada material.

Se actualiza sola: un proceso revisa el catálogo cada 6 horas y otro extrae las páginas de build a
diario. **Solo se publica cuando los datos han cambiado de verdad.**

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
las fixtures y avisa por pantalla: sirve para desarrollar la web, pero esos datos **no son
publicables** y los guardarraíles lo marcan.

Atajo para regenerarlo todo: `npm run data:refresh`.

## Qué hay dentro

```
apps/web/          Astro 7 + Tailwind v4. Estático puro, sin framework de UI.
apps/scraper/      Ingesta en dos etapas, extractor de páginas (Playwright) y CLI de datos.
packages/schema/   Modelo canónico en Zod: GameRef, CanonicalBuild, correlación, contenido.
packages/i18n-d4/  Diccionario esES a partir de Diablo4Companion (MIT).
data/canonical/    Lo que publica la web. Versionado, con diffs legibles.
data/curated/      Lo que mantenemos a mano, siempre con procedencia.
data/reports/      Cobertura de traducción, informe de ingesta, sonda del DOM.
```

### Las cuatro decisiones que explican el resto

**1. Una traducción sin procedencia no compila.** Todo término del juego es un `GameRef` con un campo
`i18n` cuyos valores posibles son `d4companion`, `wowhead-es`, `curated` o `none`. No existe
`machine` ni `llm`, así que el sistema de tipos hace imposible expresar una traducción inventada, y
un `refine` de Zod tumba el build si algo lleva castellano con `i18n: 'none'`. Lo que no tiene
traducción verificada se pinta en inglés con un distintivo `EN`.

Los nombres de habilidad no vienen de Diablo4Companion (no publica ese fichero): se cosechan con
`i18n:skills:wowhead`, que **cruza los listados en inglés y en español por el identificador interno
del juego**. No es una traducción nuestra, es la del propio juego, y cada entrada guarda su
`sourceUrl`.

**2. La normalización es determinista y no mira el reloj.** Las fechas salen del snapshot y todo se
serializa con las claves ordenadas. Consecuencia práctica: ejecutar el pipeline dos veces seguidas
deja el árbol de trabajo limpio, así que solo hay commit —y por tanto deploy— cuando cambia algo
real. Con el plan gratuito de Netlify (300 créditos al mes, 15 por deploy) eso es la diferencia
entre caber y no caber.

**3. El equipo y el Paragón solo existen en el DOM.** No están en ningún JSON público: hay que
renderizar la página de cada build con un navegador. Como la red de trabajo bloquea d4builds, eso
vive en `.github/workflows/scrape-pages.yml` y se extrae **por lotes**, publicando cada ~14 minutos.
Si una pasada se cae, la siguiente continúa donde se quedó en vez de empezar de cero.

**4. Los datos dudosos se marcan, no se esconden.** El contenido curado (jefes, llaves, materiales,
recetas) lleva un envoltorio `Verificacion` y la web pinta un aviso visible cuando algo no está
confirmado. Por eso la receta del Joyero aparece **sin cifras**: las fuentes se contradicen y
preferimos no decir nada a decir un número inventado.

## Postura sobre las fuentes

- **d4builds.gg**: se lee su catálogo público y se extraen los datos estructurados de cada build
  (equipo, habilidades, afijos, Paragón). Su `robots.txt` solo prohíbe `/?skills`. **La pestaña de
  notas no se extrae**: ese texto lo escribe el autor de la guía y es suyo; enlazamos al original y
  lo acreditamos en cada ficha.
- **maxroll.gg**: **no se rastrea, ni una vez**. Su `robots.txt` (Ziff Davis) prohíbe expresamente el
  scraping, la minería de datos y crear conjuntos de datos con su contenido. El importador de
  `/herramientas/importar` corre entero en el navegador del usuario, con una URL que pega él.
- **Blizzard**: sitio de fans sin ánimo de lucro y sin afiliación. Los nombres y textos de objetos
  proceden de la localización oficial vía Diablo4Companion (MIT), acreditado en `/creditos`.

## Despliegue en Netlify

Conecta el repositorio; `netlify.toml` ya trae el comando y el directorio de publicación. Variables
de entorno del sitio:

| Variable | Para qué |
|---|---|
| `GH_TOKEN` | PAT de grano fino con *Actions: read and write*, para el botón de refresco |
| `GH_REPO` | `usuario/repositorio` |
| `REFRESH_KEY` | Clave del botón de refresco (`/admin/refrescar`) |
| `SITE` | Dominio final, para las URLs canónicas y el sitemap |

En GitHub hay que permitir que Actions escriba en el repositorio
(*Settings → Actions → General → Workflow permissions → Read and write*).

## Comandos útiles

```bash
npm test                                        # 65 tests
npm run data:refresh                            # pipeline completo
node apps/scraper/dist/cli.js i18n:skills:wowhead    # cosechar traducciones de habilidades
node apps/scraper/dist/cli.js i18n:skills:scaffold   # listar lo que falta por traducir
node apps/scraper/dist/cli.js probe:page <uuid>      # describir el DOM de una build (solo en CI)
node apps/scraper/dist/cli.js scrape:pages --limite=5 # extraer páginas (solo en CI)
```

## Aviso con fecha

La **temporada 14 acaba hacia el 15 de septiembre de 2026**. El pipeline detecta el cambio solo
(mira el campo `season` del catálogo), se detiene a propósito y abre una incidencia con el checklist
del corte, en vez de mezclar datos de dos temporadas. El corte hay que ejecutarlo a mano.
