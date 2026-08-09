# Cosas a tener en cuenta

Lo que hay que saber **antes** de tocar nada en este proyecto. Es corto a propósito: el detalle
está en [`TRASPASO.md`](TRASPASO.md), que hay que leer entero igualmente.

---

## Lo primero, siempre

```bash
cd c:\Josu\proyectos\d4es
git pull --rebase          # los workflows commitean solos; sin esto empiezas desincronizado
```

Y leer `TRASPASO.md`. `SIGUIENTE-SESION.md` es de una sesión vieja y está desfasado.

---

## Las reglas que no se rompen

1. **Una traducción sin procedencia no compila.** Nada de castellano inventado: o viene del
   diccionario oficial, o de una fuente con `sourceUrl`, o se queda en inglés con el distintivo
   `EN`. Un `refine` de Zod tumba el build si alguien se salta esto.
2. **La normalización es determinista**: fechas del snapshot, claves ordenadas, nunca el reloj.
   Si dos pasadas seguidas dan diffs distintos, hay un fallo.
3. **Los datos dudosos se marcan, no se esconden** (envoltorio `Verificacion`), y salen listados
   en `/estado/verificar`.
4. **Nada de rellenar huecos a ojo.** Si no hay fuente contrastable, se dice que falta. Es lo que
   se hizo con las tablas de botín por jefe.

---

## Cómo se itera contra d4builds (esto ahorra horas)

Desde este portátil **el proxy bloquea d4builds y el CDN de iconos**. El navegador solo corre en
GitHub Actions. Por eso:

- **Antes de escribir un parser, lanza la sonda.** Un push que solo toca `probe-page.ts` corre la
  sonda en **~5 min** y no toca los datos. Un push que toca `scrape-pages.ts` o `warplans.ts`
  **borra las 92 páginas y re-extrae: ~50 min.** Confundirlos cuesta una tarde.
- El workflow deja escrito qué decidió en **`data/reports/ultimo-disparo.json`**. Si dudas de si
  corrió sonda o extracción, míralo ahí; no adivines.
- **`api.github.com` sí es alcanzable** y el repo es público: se puede ver el estado de un workflow
  paso a paso sin `gh` ni navegador.

```bash
curl -s "https://api.github.com/repos/josu1995/d4es/actions/workflows/scrape-pages.yml/runs?per_page=3"
curl -s "https://api.github.com/repos/josu1995/d4es/actions/runs/<id>/jobs"
```

---

## Trampas ya pagadas — no las reintroduzcas

- **`npm run data:refresh` no vale aquí**: empieza por `scrape:catalog`, que el proxy bloquea. Para
  regenerar en local es **`npm run normalize`**, que lee el snapshot ya descargado.
- **No mires solo la web cuando algo «no se ve».** Las dos veces que ha pasado, el fallo estaba en
  el dato: un filtro que escondía la rejilla entera, y un extractor que leía la barra de
  habilidades del jugador creyendo que era el mercenario. Cuenta primero en `data/canonical/` y
  `data/raw/`.
- **Netlify: 300 créditos/mes, 15 por deploy.** Los commits que no cambian la web llevan
  `[skip netlify]`.
- La lista completa de trampas de CI está en §5 de `TRASPASO.md`.

---

## Permisos

En este repo (propio, público, sin nadie más) hay **permiso permanente para commitear y hacer push
a `main`** sobre la marcha, en trozos pequeños. No hace falta preguntar cada vez.

> Ojo: esto es lo contrario de lo que rige en los repos de Dibal (LS5000/LP5000), donde solo se
> editan ficheros y **nunca** se toca el git.

---

## Antes de dar algo por terminado

```bash
npm test           # 142 tests
npm run data:verify
npm run build      # lo mismo que ejecuta Netlify
```

Y actualizar `TRASPASO.md` con lo que hayas descubierto: la mitad de lo que hay ahí costó horas y
no se deduce del código.

## La lista de Josu del 9 de agosto — estado

Lo que se dictó aquella tarde, en limpio, y qué se hizo con ello (ronda del 9 de agosto por la
noche):

1. **Aspectos en castellano en el equipo** — ya lo estaban (554/554, «Rasgo …»); si se veían en
   inglés era un despliegue viejo. **Previsualización tipo maxroll**: hecha — icono de la ranura
   («el pantalón básico»), insignia con la categoría del códice del aspecto (ofensivo/defensivo/
   utilidad, que es la única «imagen» que d4builds da a una legendaria) y la imagen en grande en
   el tooltip.
2. **Tooltips de habilidad en castellano** — hecho donde hay fuente: 149 descripciones cosechadas
   de la ficha ES de Wowhead (`i18n:skills:desc`, con `sourceUrl`). Las ~50 que Wowhead no ha
   localizado siguen en inglés con el pie que lo dice: regla 1, no se inventa.
3. **Paragón dibujado** — hecho: un desplegable por tablero con el tablero entero en SVG (rareza
   por color, camino de la build encendido, engarce de glifo, giro aplicado). d4builds lo hace
   con una rejilla de botones + CSS, no canvas, y por eso se pudo extraer casilla a casilla:
   catálogo compartido de 70 formas en `data/canonical/paragon-boards-dataset.json`.
4. **Mercenarios** — arreglado del todo: 85/92 con sus **5 habilidades** de verdad (el DOM traía
   cada nodo por triplicado y antes salía 1 y a veces mal), con icono y chip EN. Los **planes de
   guerra** ya estaban dibujados de la ronda anterior. Lo que NO se hizo: dibujar el árbol del
   mercenario (TRASPASO §6.6) y traducir mercenarios/nodos de plan (sin fuente, no se inventa).
5. **Prioridad de afijos por pieza** — hecho: el bloque «Gear Stats» de d4builds ya se extraía
   (el orden ES la prioridad); ahora se enseña entero y numerado debajo del equipo.

