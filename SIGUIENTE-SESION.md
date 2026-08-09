# Dónde lo dejamos — 9 de agosto de 2026, madrugada

Documento de traspaso. Lo primero al retomar: leer esto, luego el plan en
`C:\Users\jgutierrez\.claude\plans\soy-un-jugador-de-adaptive-parasol.md`.

## Estado del repositorio

**Todo está commiteado y subido. No hay nada pendiente en local.**

- Último commit propio: `240e836 FIX: Correciones`
- El repo remoto tiene además `ed1ddc6 datos: actualizacion automatica del catalogo`,
  commiteado **por el cron de ingesta, que se ejecutó solo y funcionó**. Es la primera
  confirmación de que la automatización cada 6 h está viva.
- Local está `behind 1`. **Antes de tocar nada mañana:**

```bash
cd c:\Josu\proyectos\d4es
git pull --rebase
```

## Qué está hecho y funcionando en producción

https://dapper-empanada-bb361f.netlify.app

- **92 builds reales** de la temporada 14 (todas las del catálogo de d4builds), con tier list
  cruzado y 100 páginas estáticas.
- **Ficha de build** con cabecera de clase, insignias, 3 pestañas, slots circulares de habilidad
  con icono real del juego, insignia de rango, rombos de runas y **tooltips** al pasar el ratón
  (nombre, categoría, coste, golpe de suerte, descripción y descripción de cada runa).
- **Listado** con filtros por clase y contenido persistidos en la URL, tarjetas con icono de
  clase y fila de iconos de habilidades.
- **Buscador bilingüe de objetos** (1033 términos: únicos, aspectos, glifos, runas).
- **Guía "Lo que ya no existe en Diablo 4"**, página de **Estado de los datos** y **Créditos**.
- Pipeline de ingesta con guardrails, detección de cambio de esquema y de temporada, botón de
  refresco (`/admin/refrescar`) y 53 tests en verde.

## Lo que queda (el plan nocturno que no llegamos a ejecutar)

El plan completo está aprobado y guardado en la ruta de arriba. Resumen del orden:

### Ruta crítica — el clon de d4builds
1. **A. Scraper de páginas con Playwright en GitHub Actions.** Es la pieza que desbloquea todo
   lo demás. Ya está verificado que:
   - El equipo y el Paragón **no existen en ningún JSON público**: solo en la página de cada
     build (`/builds/<uuid>?var=N`), montada por JavaScript.
   - El lector proxy (r.jina.ai) **no la hidrata** (devuelve el cascarón, 0 items). Comprobado.
   - El proxy de Dibal **bloquea d4builds** en local (categoría "juegos").
   - → Única vía: Playwright en CI. Selectores de referencia (proyecto MIT `d4lfteam/d4lf`):
     `builder__variant__input`, `builder__gear__items`, `builder__stats__slot`,
     `dropdown__button__wrapper`, `greater__affix__button--filled`, icono `tempering_02.png`,
     `paragon__board__name` / `paragon__board__name__glyph`.
   - Método de trabajo: como no puedo ejecutarlo en local, cada iteración es push → CI extrae y
     committea el crudo **más un informe de depuración con fragmentos de DOM** → `git pull` →
     ajustar parser → push.
2. **B. `normalize-pages.ts`**: crudo → `BuildVariant[]` reales. El modelo canónico ya tiene los
   campos (`gear`, `paragon`, `mercenary`, `talisman`, `variantIndex/variantLabel` en
   `packages/schema/src/build.ts`): hay que llenarlos, no crearlos.
3. **C. Ficha con las 5-6 pestañas reales**: paperdoll de equipo a dos columnas, árbol, tableros
   de Paragón con glifos, mercenarios, y las variantes reales (Endgame/Speedfarm/…).

### Contenido y herramientas
- **E.** Fichas de únicos con "cómo conseguirlo" + grafo curado `jefes.json`,
  `materiales.json`, `recetas-miticos.json`.
- **F.** Guías: crafteo de míticos con calculadora, jefes y llaves, materiales, dificultades,
  ampliar la de obsoleto.
- **G.** Glosario EN↔ES y buscador global con Pagefind.
- **H.** Comparador de variantes (`computeDiff()` ya existe y está testeado).
- **I.** Importador BYOL de maxroll (100 % en el navegador del usuario).
- **J.** Cosecha de traducciones de habilidades desde Wowhead esES, siempre con `sourceUrl`.
- **K.** JSON-LD, RSS, `/cambios`, iconos auto-hospedados.
- **D.** Ingesta incremental de páginas en `ingest.yml`.

## Deudas conocidas (visibles en la web)

1. Las pestañas **Equipo y Paragón dicen "pronto"** y enlazan a la guía original. Se resuelve
   con el bloque A+B+C.
2. Los nombres de habilidad salen **en inglés con el chip `EN`**: la fuente de traducciones
   oficiales (Diablo4Companion) no cubre habilidades. Hay **630 términos pendientes** listados
   en `data/curated/skills.esES.json`. Regla que no se rompe: nunca se inventa una traducción,
   cada entrada exige `sourceUrl` y `verifiedAt`.
3. **Spiritborn, Warlock y Paladin** aparecen sin traducir en los filtros por lo mismo. Si
   confirmas cómo se llaman en tu cliente en español, se dan de alta con esa procedencia en
   `data/curated/clases.esES.json`.
4. Los iconos se cargan del CDN de d4builds (hotlink). Funciona, pero es frágil: el plan
   contempla descargarlos y auto-hospedarlos (bloque K).

## Aviso con fecha

La **temporada 14 acaba hacia el 15 de septiembre**. El pipeline detecta el cambio solo (mira el
campo `season` del catálogo), se detiene a propósito y abre una incidencia con el checklist del
corte, en vez de mezclar datos de dos temporadas. Pero el corte hay que ejecutarlo a mano.
