# d4es — Traspaso de sesión

Última actualización: **9 de agosto de 2026 (noche)**. Árbol limpio, todo subido.

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
| Equipo y habilidades | ✅ 904 piezas (900 con la imagen de la fuente), afijo superior ★, templado, insignia de códice en legendarias y bloque de **prioridad de afijos por pieza** |
| Árbol de habilidades | ✅ reconstruido (ver §4), tooltips con descripción en castellano donde hay fuente |
| Paragón | ✅ 92/92 **dibujados casilla a casilla** en SVG (catálogo de 70 formas, 10.894 casillas con rareza), con nivel, giro y glifo, un desplegable por tablero |
| Mercenarios | ✅ 85/92, cada uno con sus **5 habilidades** (el DOM las traía por triplicado) |
| Planes de guerra | ✅ 66/92 con plan (las otras 26 no invierten puntos), árbol dibujado entero |
| Notas del autor | ✅ enlaza al original, no se copia su texto |

**Herramientas que no tiene ninguna otra web** (y que solo se pueden hacer teniendo el catálogo
entero y datos deterministas). Las tres primeras se calculan **en el navegador**, con los datos
embebidos en la página: nada de servidor, y funcionan con el juego abierto al lado.

- **«¿Lo tiro o lo guardo?»** (`/herramientas/objeto`, 35 KB de datos embebidos). Marcas la ranura
  y los afijos del objeto que te ha caído y te dice qué builds lo aprovechan y cuántas de sus
  prioridades cubre. Le da la vuelta al dato que ya teníamos: en vez de ir build por build mirando
  qué pide, se pregunta al revés. La lista de afijos se ordena por cuántas builds los piden, así
  que de paso es una chuleta de qué buscar. El objeto se marca a mano a propósito: el juego no deja
  copiar el texto de un ítem, y leerlo de la pantalla es OCR (eso es D4Companion, otro proyecto).
- **«Qué me falta»** (pestaña de cada ficha). La lista de la compra de la build: únicos, aspectos,
  glifos y engarces, con el jefe que suelta cada único cuando lo sabemos. Se marca lo que ya tienes
  y se guarda en `localStorage` por build — sin cuentas y sin salir del equipo.
- **«¿Y si me cambio de build?»** (`/herramientas/cambiar-de-build`). Compara dos builds y dice
  cuánto reaprovechas al cambiarte. Solo cuentan únicos, aspectos y glifos para el veredicto: las
  habilidades y los puntos de Paragón se reparten gratis y meterlos mentiría sobre el coste.
- **RSS por clase** (`/rss/<clase>.xml`): los cambios de las guías de esa clase, sacados del
  historial. Sigues tu clase y te enteras el día que tocan la build que juegas.

- **Historial por build** (`data/canonical/historial.json`, pestaña «Cambios» de cada ficha y
  bloque en `/cambios`). La fuente publica la foto de hoy; aquí se guarda la película: qué tocó el
  autor de la guía y cuándo. Se calcula comparando una **firma** por build (tier, habilidades,
  equipo por ranura, engarces, tableros, glifos, mercenario — los afijos NO, ahogarían lo
  importante) con la de la pasada anterior. El guardarraíl que lo sostiene: si un mismo tipo de
  cambio afecta a **más de la mitad del catálogo** en una pasada, no es la guía, somos nosotros
  (parser o diccionario) y se marca `ambito: 'sitio'`, que la ficha no pinta. Sin eso, cada vez
  que tocáramos el extractor las 92 builds dirían «cambió el equipo» y sería mentira.
- **El meta en cifras** (`/meta`, se calcula en el build de la web desde los canónicos, sin
  fichero nuevo). Qué llevan de verdad las 92 builds: aspectos, únicos, glifos, tableros, runas y
  mercenarios más equipados, en total y por clase, más el «núcleo» de cada clase (lo que llevan
  ≥60% de sus builds). Se cuenta **una vez por build**, no por aparición.

**Contenido propio**: guía de crafteo de míticos con calculadora de intentos, guía de jefes y llaves
(con ficha por jefe), materiales, dificultades, «lo que ya no existe», glosario de jerga, 297 fichas
de únicos con «cómo conseguirlo», buscador global (Pagefind), comparador de variantes, importador de
Maxroll en el navegador, RSS, página de cambios y **lista de lo que falta verificar en el juego**
(`/estado/verificar`). **420 páginas**, **163 tests** (desde esta ronda, `vitest` también recoge
las funciones puras de la web: `apps/web/src/lib/**`).

**Traducción**: 2.426 términos del diccionario oficial más 800 curados (618 mejoras de rama y 7
gemas cosechadas de Wowhead, con procedencia), y ahora también **149 descripciones de habilidad en
castellano** (cosechadas de la misma ficha de Wowhead que ya daba los nombres). Sin traducción
verificada: **31,2%** de apariciones. Ojo: es MÁS que el 29,3% anterior **porque hay más contenido
real**, no menos traducción — cada mercenario enseña ahora sus 5 habilidades (antes 1) y ni los
mercenarios ni sus habilidades tienen fuente en castellano todavía. Lo que queda son sobre todo
los nodos de plan de guerra y contenido que Wowhead no ha localizado (ver §6).

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

**El tablero de Paragón es DOM y se extrae entero.** Cada casilla es un botón con su fila y
columna en las clases (`r2 c11`), el tipo en el `alt` del icono, la **rareza** en el `alt` del
fondo (`tile_bg_common.png` → «Common») y `active` si la build la recorre. Se compacta como
`"r2c11:Will:common:active"` (~730 por página). El **giro** del tablero es el acumulado de su
animación CSS (450, 540, 900…): se normaliza módulo 360 al normalizar. Tres trampas ya pagadas:
el `alt` del engarce de glifo varía entre «Glyph» y «Paragon Glyph» según la build (misma
casilla: se canoniza en `paragon-layout.ts`); el **nivel del glifo NO lo publica la fuente**
(verificado en sondas: la cabecera solo trae `(Brawl) Str 105…`), así que `rank` va `null`; y
la forma es fija **por clase + tablero**, no por build — el «Starting Board» del Bárbaro no es
el del Nigromante — por eso `paragon-boards-dataset.json` se indexa así. «Starting Board» es
además un rótulo de la fuente, no el nombre del tablero en el juego: se compone en la interfaz
(«Tablero inicial»), como los `skillVariant`.

**El árbol del mercenario trae cada nodo POR TRIPLICADO** (57 nodos en el DOM = 19 únicos; 15
activos = 5 únicos). Sin deduplicar por slug en `normalizarMercenario`, cada habilidad se
publica tres veces. Las `etiquetas` de la pestaña (`["7","12","19","29"]`) no son
Mercenary/Reinforcement: son umbrales de nivel. El refuerzo no aparece en ese DOM.

**La «imagen» de una pieza legendaria es la categoría de su aspecto en el códice**
(`Codex/1/offensive.png` y compañía), no un objeto base: d4builds no publica más. La
previsualización tipo «pantalón básico» es el icono genérico de ranura que ya usamos, y la
categoría del códice sale como insignia (`GearItem.icon` conserva la URL de la fuente;
`codexDeIcono()` la clasifica).

**Las descripciones de habilidad en castellano salen de la MISMA ficha de Wowhead** que ya se
descargaba para las mejoras de rama (`i18n:skills:desc`): bloque `data-skill-type="active"` →
`whtt-name` + `whtt-description`, con las cabeceras de coste («Tiempo de reutilización:
67&#160;s») quitadas. Solo hay ficha ES para las habilidades que Wowhead ha localizado; el
resto sigue en inglés con distintivo. La `desc` vive en la propia entrada curada de
`skills.esES.json` y hereda su `sourceUrl`.

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

**La fuente escribe los afijos distinto que el juego, y por eso salían en inglés.** El diccionario
guarda el afijo **con** su número pero **sin** el símbolo de `%` ni la `X` con que la fuente marca
el hueco del valor: por dos caracteres se perdían 39 apariciones de un solo afijo. Además la fuente
antepone `Ranks` a los rangos de habilidad (el juego dice `to War Cry`), pega el valor delante
(`242 Primary Core Stat`) y el grupo de templado detrás, y arrastra dos erratas suyas
(`Multipler`, `Critcal`). `lookupAfijo` prueba esas variantes —cada una sale de una diferencia
concreta y verificable, no de adivinar— y con eso los términos sin traducir bajaron de **78 a 20**
(de 305 apariciones a 147). Lo que queda **no está en el diccionario**: `Faith per Second`,
`Shadow Damage`… y `Primary Core Stat`, que es una etiqueta de la fuente («tu estadística
principal»), no un afijo del juego. Cuando un afijo no casa se publica **unificado** (sin el valor
delante ni el grupo detrás) para que el mismo afijo no cuente como cuatro términos distintos.

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
  ver qué decidió sin abrir los logs. Si tocas eso, mantén la traza. Desde agosto de 2026
  `mercenarios.ts` también cuenta como parser (está en `paths:` y en el grep); antes un push que
  solo lo tocara no disparaba nada.

- Y la más cara hasta la fecha: **un run que no podía publicar terminaba «success» habiendo
  perdido todo el trabajo**. Las pasadas se encolan, así que al arrancar, `main` suele ir por
  delante del commit que disparó el run; el checkout partía del commit viejo, el primer
  `git pull --rebase` chocaba (bastó `data/reports/scrape-pages.json`), el repo quedaba a medio
  rebase y los lotes siguientes commiteaban en **detached HEAD** sin que ningún push llegara a
  `main` (run `31323290074`: 44 min de extracción tirados). Ahora el checkout usa el **tip de
  `main`**, la publicación reintenta con `-X theirs` (lo recién extraído gana) y si aun así no
  puede, **el run falla en rojo**. Un run de extracción «success» sin commits de lote es esta
  trampa reintroducida.

Para re-extraer tras arreglar un parser: lanzar `scrape-pages.yml` con `forzar: true` (borra las
páginas y empieza de cero; si no, el checkpoint las salta y sigues con los datos malos). Se puede
disparar sin navegador con la credencial local de git:
`curl -X POST -u "$user:$token" .../actions/workflows/scrape-pages.yml/dispatches -d '{"ref":"main","inputs":{"forzar":"true"}}'`.

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
   - **`mercenary` (3, 84 apariciones) y sus habilidades** — tampoco están en Wowhead. Desde que
     cada mercenario enseña sus 5 habilidades reales (antes 1 y mal), esta bolsa pesa más en la
     cifra global: por eso el «sin traducir» SUBIÓ de 29,3% a 31,2% mientras la web ganaba
     contenido. Van con chip EN, como todo lo demás.
   - **Descripciones de habilidad**: las 149 con ficha ES en Wowhead ya la tienen
     (`i18n:skills:desc`). Las ~50 sin localizar siguen con la descripción del catálogo en inglés
     y el pie que lo dice. Las descripciones de las MEJORAS de rama no se han cosechado (habría
     que emparejarlas por posición como los nombres): es el siguiente paso natural de esa vía.
2. **Tablas de botín por jefe**: sin resolver **a propósito**. De cada jefe solo están sus únicos
   «firma»; no hay fuente contrastable que publique la tabla completa y rellenarla a ojo va contra
   la regla 4. Lo que sí hay es la lista priorizada de los **119 únicos que las builds equipan y no
   sabemos de dónde salen**, en `/estado/verificar`.
3. **Datos por verificar dentro del juego**: 49 datos, listados uno a uno con su procedencia y la
   ruta exacta del campo en `/estado/verificar`. Solo se pueden cerrar con el juego delante.
4. **Iconos auto-hospedados**: ✅ hechos. ~570 ficheros (14 MB) servidos desde `public/iconos`, con
   caída al CDN para lo que falte. Quedan ~80 sin descargar: los `*_v2` son duplicados del PTR que
   no existen en el CDN, y el resto son nombres que no casan (ver `data/reports/iconos.json`).
   ⚠️ **Pendiente: los iconos de casilla de Paragón** (`/iconos/paragon/`, ~107 tipos × 2 variantes
   apagada/encendida). El recolector ya los pide, pero **hay que commitear y lanzar `iconos.yml`**
   para que se descarguen: la caída al CDN no vale aquí porque el proxy lo bloquea, así que hasta
   entonces las casillas se ven con su color y su borde pero sin dibujo.
5. **Corte de temporada**: la T14 acaba hacia el **15 de septiembre de 2026**. **No se ha ejecutado
   a propósito**: hacerlo ahora archivaría una temporada viva. Lo que sí se ha cubierto es lo que lo
   dispara — `detectarTemporada` ya está exportada, con el umbral documentado y **siete pruebas**,
   incluidos los bordes — y el checklist de la incidencia se ha completado con lo que el proyecto
   tiene hoy (re-extraer páginas, regenerar el árbol de planes, iconos, `/estado/verificar`).
6. **El árbol del mercenario, dibujado**: el crudo ya trae x/y de cada nodo (19 por mercenario) y
   la técnica es la misma que planes de guerra + Paragón (catálogo de forma compartido, indexado
   por mercenario + build con lo cogido). No se hizo en la ronda de agosto por acotar; es el
   siguiente dibujo natural. Y dos flecos del Paragón: el **nivel de glifo** no lo publica la
   fuente (queda `null`, la ficha no lo pinta), y los iconos de casilla no se incrustan a
   propósito (~800 `<image>` por ficha para repetir lo que el color ya dice).

---

## 7. Comandos

```bash
cd c:\Josu\proyectos\d4es
git pull --rebase          # SIEMPRE lo primero: los bots commitean solos

npm test                   # 142 tests
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
