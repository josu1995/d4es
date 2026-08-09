# d4es — Traspaso de sesión

Última actualización: **9 de agosto de 2026**. Árbol limpio, todo subido.

Documento para retomar el proyecto en una conversación nueva. Léelo entero antes de tocar nada:
la mitad de lo que hay aquí costó horas de averiguar y no es deducible del código.

> Si tienes prisa, empieza por [`COSAS-A-TENER-EN-CUENTA.md`](COSAS-A-TENER-EN-CUENTA.md): es la
> versión corta, con las reglas que no se rompen y las trampas que cuestan una tarde.

---

## 1. Qué es y dónde está

- **Proyecto personal** (nada que ver con Dibal): web de builds de Diablo 4 en castellano.
- **Carpeta**: `c:\Josu\proyectos\d4es`
- **Repo**: https://github.com/josu1995/d4es (público)
- **Desplegado**: https://dapper-empanada-bb361f.netlify.app
- **Stack**: monorepo npm workspaces · Astro 7 + Tailwind v4 + TypeScript + Zod · sin framework de UI
  (islas de JS nativo) · Playwright para la extracción, que corre **solo en GitHub Actions**.

> **El sitio devuelve 401 a cualquiera que no seas tú**: tienes activada la protección por
> contraseña de Netlify. No es un fallo. Implica que no se puede verificar de forma anónima.

---

## 2. Estado actual

**92 builds reales** de la temporada 14, con la ficha completa a imagen de d4builds:

| Pestaña | Estado |
|---|---|
| Equipo y habilidades | ✅ 904 piezas, 884 con afijos (98%), con afijo superior ★ y templado |
| Árbol de habilidades | ✅ reconstruido (ver §4) |
| Paragón | ✅ 92/92 con tableros y glifos en castellano |
| Mercenarios | ✅ 85/92 |
| Planes de guerra | ✅ 66/92 con plan (las otras 26 no invierten puntos), árbol dibujado entero |
| Notas del autor | ✅ enlaza al original, no se copia su texto |

**Contenido propio**: guía de crafteo de míticos con calculadora de intentos, guía de jefes y llaves
(con ficha por jefe), materiales, dificultades, «lo que ya no existe», glosario de jerga, 297 fichas
de únicos con «cómo conseguirlo», buscador global (Pagefind), comparador de variantes, importador de
Maxroll en el navegador, RSS, página de cambios y **lista de lo que falta verificar en el juego**
(`/estado/verificar`). **417 páginas**, **116 tests**.

**Traducción**: 2.426 términos del diccionario oficial más 800 curados (618 mejoras de rama y 7
gemas cosechadas de Wowhead, con procedencia). Sin traducción verificada: **29,3%**, desde el 54%
con el que empezó la sesión y pese a haber entrado por el camino los ~100 nodos de plan de guerra.
Lo que queda son sobre todo esos nodos, y contenido que Wowhead aún no ha localizado (ver §6).

**Iconos**: ~570 auto-hospedados en `public/iconos` (14 MB), con caída al CDN para lo que falte.

---

## 3. Las cuatro reglas que sostienen el diseño

1. **Una traducción sin procedencia no compila.** Todo término es un `GameRef` con `i18n` ∈
   {`d4companion`, `wowhead-es`, `curated`, `none`}. No existe «automática», y un `refine` de Zod
   tumba el build si algo lleva castellano con `i18n: 'none'`. Lo no traducido se pinta en inglés
   con el distintivo `EN`. **No romper esto nunca.**
2. **La normalización es determinista y no mira el reloj.** Fechas del snapshot, claves ordenadas.
   Por eso dos pasadas seguidas dejan el árbol limpio y solo hay deploy cuando cambia algo real
   (Netlify: 300 créditos/mes, 15 por deploy).
3. **Las fuentes no se fusionan.** Si una build existe en dos sitios, coexisten como variantes y se
   calcula qué comparten. Hoy las 92 tienen **una sola variante** («Standard Build»), así que el
   comparador genera 0 páginas: está listo pero sin uso.
4. **Los datos dudosos se marcan, no se esconden.** El contenido curado lleva envoltorio
   `Verificacion` y la web pinta un aviso visible. Por eso la receta del Joyero aparece **sin
   cifras**: las fuentes se contradicen.

---

## 4. Hechos técnicos que costó averiguar

**El proxy de Dibal bloquea d4builds y maxroll** (webcat cat=22, «juegos»). Desde el portátil hay
que pasar por `https://r.jina.ai/<url>`. GitHub raw y el registro de npm sí son alcanzables.

**`api.github.com` también es alcanzable**, y el repo es público: se puede ver qué está haciendo un
workflow sin `gh` ni abrir el navegador. Sirve para no quedarse a ciegas esperando a CI:

```bash
curl -s "https://api.github.com/repos/josu1995/d4es/actions/workflows/scrape-pages.yml/runs?per_page=3"
curl -s "https://api.github.com/repos/josu1995/d4es/actions/runs/<id>/jobs"   # estado paso a paso
```

**El equipo y el Paragón solo existen en el DOM de cada build**, montado por JavaScript. El lector
proxy NO hidrata la página (comprobado: 0 objetos). Única vía: Playwright en CI.

**Endpoints útiles de d4builds** (estáticos, sin navegador):
- `page-data/index/page-data.json` → catálogo de 92 builds + **dataset de 431 habilidades** con
  categorías, descripciones y mejoras de rama.
- `page-data/tierlist/page-data.json` → tier list.
- `page-data/builds/<slug>/page-data.json` → **`skillTreeStructure`**: tamaño de cada anillo del
  árbol por clase (Bárbaro `[4,8,7,7,8,6,5]`).

**Selectores del DOM verificados** (`.builder__gear__item`, `.builder__stats__group` →
`.builder__stat` → `.dropdown__button__wrapper`, `.greater__affix__button--filled`,
`.paragon__board__name`). Están documentados en `scrape-pages.ts`.

**El árbol de habilidades se dibuja en un `canvas`.** No hay DOM que leer y no lo va a haber. **No
lo reintentes.** Se reconstruye con la categoría de cada habilidad + `skillTreeStructure`: cada rama
es una fila, las habilidades de la build salen encendidas y las demás apagadas. Las pasivas se
cuentan pero **no se nombran**, porque sus nombres no están publicados.

**Los planes de guerra NO son un canvas**, al contrario que el árbol. Comparten el mismo visor
(`.skill-tree-viewer`), pero aquí los nodos son DOM de verdad (`.viewer-node`, colocados con
`left`/`top`). Comprobado: `document.querySelector('.skill-tree-viewer canvas') === null`.

**Son siete actividades independientes, con 7 puntos cada una** (no 7 en total): Whispers, Nightmare
Dungeons, Helltides, Undercity, Boss Lairs, Infernal Hordes y Pits. `invertidos + restantes === 7`
en las siete solapas de la misma build. Cada solapa se monta **al pulsarla**: sin clic no hay DOM.

**El nombre de un nodo no está en el texto del DOM**: solo en el fichero de su icono
(`Skills/VoH2/corrupted_roots.png`) y en el tooltip. Y no hace falta pasar el ratón por los 100
nodos: **el catálogo público ya los trae**, como las 103 entradas *sin clase* del dataset `skills`,
con nombre y descripción. Se cruzan por `skillNameKey(slug.replace(/_/g,' '))`. El estado lo da la
clase `allocated` (los `available` y `locked` no están cogidos; los `category` no son nodos, son el
icono de la actividad; los rombos son nodos menores y solo pintan contador cuando están invertidos).

**La forma del árbol de planes de guerra NO depende de la build**: mismos nodos, mismas
coordenadas y mismas figuras en las siete actividades (verificado nodo a nodo entre builds
distintas). Por eso vive una sola vez en `data/canonical/warplans-dataset.json` y cada build solo
guarda qué nodos invierte. El cruce se hace por **slug**, no por nombre: el apóstrofo de
«Choron's Haste» no sobrevive a la normalización y dejaría nodos sin casar.

**La pestaña de mercenarios muestra habilidades, no el mercenario.** Se deduce el dueño desde el
dataset (la `class` de una habilidad de mercenario es el propio mercenario).

**Lo que d4builds llama «runas» dentro de una habilidad NO son runas**: son mejoras de rama del
árbol. Las runas de verdad se engarzan en el equipo. Tienen categoría propia (`skillUpgrade`).

**Wowhead publica las mejoras de rama, pero sin identificador.** Las habilidades llevan su SNO en la
URL y se cruzan por ahí; las mejoras son filas dentro de la ficha (`data-skill-type="upgrade"` →
`whtt-name`) y **no tienen id**. Solo se pueden emparejar EN↔ES **por posición**, así que el
cosechador descarta la habilidad entera si las dos listas no miden lo mismo, y exige que todas las
habilidades donde aparece un término lo traduzcan igual (`Weaken` sale en 48). Lo que se publica está
corroborado por varias páginas. Ojo: `r.jina.ai` **corta con 429**; hay reintento con espera, y la
cosecha se puede repetir tantas veces como haga falta porque continúa donde lo dejó.

**En el cliente español los aspectos se llaman «Rasgo», no «Aspecto».** Y el diccionario oficial los
guarda **sin esa palabra** (`crushing` → «aplastante», `of glynn s anvil` → «del yunque de Glynn»),
así que el nombre completo se compone. Verificado contra el listado de Wowhead en castellano cruzando
por el id interno: **36 de 36 coinciden**, incluido que el juego escribe «Rasgo abrumadora», en
femenino. Se reproduce tal cual: el nombre es ese, y no nos toca arreglarle la concordancia al juego.

**Las gemas no son runas** y el diccionario oficial **solo trae runas**. La fuente sí las distingue
(`/Gems/` frente a `/Runes/`), y los siete nombres salen de Wowhead cruzando por id de objeto. Tienen
categoría propia (`gem`) desde esta sesión.

**Ojo con lo que la fuente mete en la lista de «stats»**: `Transfigure` (el botón de transfiguración,
811 apariciones), `Weapon Type`, `Stat 1..4` y los propios aspectos. **No son afijos.** Se filtran en
`esAfijoDeVerdad`; si se quita ese filtro vuelven a aparecer 869 líneas que no existen en el juego.

**maxroll.gg no se rastrea nunca.** Su robots.txt (Ziff Davis) lo prohíbe expresamente. El
importador corre entero en el navegador del usuario.

---

## 5. Automatización

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `ingest.yml` | cada 6 h | catálogo → normaliza → verifica → commit **solo si cambió algo** |
| `scrape-pages.yml` | diario + push al scraper | extrae páginas **por lotes**, publicando cada ~14 min |
| `ci.yml` | push y PR | tipos, tests, verificación de datos y build |
| `iconos.yml` | semanal + manual | descarga los iconos que faltan y los auto-hospeda |

Tres trampas ya pagadas, **no las reintroduzcas**:
- El commit ocurría solo al final: una cancelación tiraba 40 minutos. Ahora publica por lotes.
- `cancel-in-progress: true` hacía que cualquier push al scraper matase una extracción en curso.
  Ahora las pasadas **se encolan**.
- Cualquier push a la sonda borraba las 92 páginas y relanzaba la extracción entera, aunque el
  parser no hubiera cambiado. Ahora el workflow mira **qué ficheros trae el push**: `scrape-pages.ts`
  o `warplans.ts` (el parser) disparan la re-extracción; `probe-page.ts` solo ejecuta la sonda.
  Iterar sobre el DOM vuelve a costar 5 minutos en vez de 90.
- Esa decisión **no se saca del payload del evento**, y no es por gusto: `join(commits.*.modified,
  ',')` devuelve vacío (es un array de arrays) y buscar la ruta en `toJSON(commits)` tampoco casó.
  Las dos veces el workflow se fue a sonda en silencio y se comió una ronda de CI. Ahora se decide
  con `git diff --name-only` y **queda escrito en `data/reports/ultimo-disparo.json`**, para poder
  ver qué decidió sin abrir los logs. Si tocas eso, mantén la traza.

Para re-extraer tras arreglar un parser: lanzar `scrape-pages.yml` con `forzar: true` (borra las
páginas y empieza de cero; si no, el checkpoint las salta y sigues con los datos malos).

---

## 6. Qué queda pendiente

> Los cinco pendientes de la sesión anterior se atacaron en cascada. Tres se cerraron
> (traducciones, iconos, corte de temporada) y dos **no se pueden cerrar escribiendo datos**, porque
> los datos no están publicados en ninguna parte contrastable: en su lugar quedan listas de trabajo
> generadas de los propios ficheros, en `/estado/verificar`.

1. **Traducciones — se ha llegado al techo de las fuentes disponibles.** De un 54% inicial a un
   **29,3%**, y ya no salta la etiqueta `i18n-bajo` del guardarraíl. Lo que queda, y por qué:
   - **Nodos de plan de guerra (65 términos, 2.349 apariciones)** — la bolsa grande. **No hay
     fuente**: Wowhead no los publica como categoría (`/diablo-4/es/war-plans` no existe) y solo
     aparecen sueltos como objetos (`carne de Choron`). Es la pista para retomarlo.
   - **`skill` (50) y `skillUpgrade` (99)** — **Wowhead no los ha localizado todavía**: 48
     habilidades salen en el listado inglés y no en el castellano. No es que el cosechador falle;
     es que la traducción no existe aún. Repetir la cosecha cuando Wowhead se ponga al día.
   - **`skillVariant` (52)** — son «habilidad + mejora» pegadas (`Teleport Blaze`). **No las
     inventa el juego, las inventa d4builds**, así que no hay nombre oficial que copiar. Si se
     quieren en castellano, hay que partirlas y componerlas en la UI, no traducirlas.
   - **`affix` (78)** — sobre todo etiquetas de la propia fuente (`Primary Core Stat`), textos con
     el valor incrustado y alguna errata suya (`All Damage Multipler`).
   - **`mercenary` (3)** — tampoco están en Wowhead.
2. **Tablas de botín por jefe**: sin resolver **a propósito**. De cada jefe solo están sus únicos
   «firma»; no hay fuente contrastable que publique la tabla completa y rellenarla a ojo va contra
   la regla 4. Lo que sí hay es la lista priorizada de los **119 únicos que las builds equipan y no
   sabemos de dónde salen**, en `/estado/verificar`.
3. **Datos por verificar dentro del juego**: 49 datos, listados uno a uno con su procedencia y la
   ruta exacta del campo en `/estado/verificar`. Solo se pueden cerrar con el juego delante.
4. **Iconos auto-hospedados**: ✅ hechos. ~570 ficheros (14 MB) servidos desde `public/iconos`, con
   caída al CDN para lo que falte. Quedan ~80 sin descargar: los `*_v2` son duplicados del PTR que
   no existen en el CDN, y el resto son nombres que no casan (ver `data/reports/iconos.json`).
5. **Corte de temporada**: la T14 acaba hacia el **15 de septiembre de 2026**. **No se ha ejecutado
   a propósito**: hacerlo ahora archivaría una temporada viva. Lo que sí se ha cubierto es lo que lo
   dispara — `detectarTemporada` ya está exportada, con el umbral documentado y **siete pruebas**,
   incluidos los bordes — y el checklist de la incidencia se ha completado con lo que el proyecto
   tiene hoy (re-extraer páginas, regenerar el árbol de planes, iconos, `/estado/verificar`).

---

## 7. Comandos

```bash
cd c:\Josu\proyectos\d4es
git pull --rebase          # SIEMPRE lo primero: los bots commitean solos

npm test                   # 77 tests
npm run data:refresh       # pipeline completo
npm run dev                # http://localhost:4321
npm run build              # lo mismo que ejecuta Netlify

node apps/scraper/dist/cli.js i18n:skills:wowhead    # cosechar traducciones
node apps/scraper/dist/cli.js i18n:skills:scaffold   # ver qué falta por traducir
node apps/scraper/dist/cli.js scrape:pages --limite=5 # solo funciona donde llegue d4builds
```

Sin acceso a d4builds, `normalize` cae a las fixtures y avisa: sirve para desarrollar la web, pero
esos datos **no son publicables** y los guardarraíles lo marcan.

---

## 8. Decisiones estéticas tomadas

- Fondo casi negro con tinte cálido, acento rojo brasa, oro apagado para jerarquía.
- **Míticos en morado, únicos en blanco** (elección tuya). El juego usa otra convención —únicos
  marrón anaranjado, míticos dorado pálido—; cambiarlo son dos valores en `global.css`.
- Las piezas que no son únicas ni míticas usan el icono genérico de su ranura, atenuado.
- Serif solo en titulares; el cuerpo en sans legible.
