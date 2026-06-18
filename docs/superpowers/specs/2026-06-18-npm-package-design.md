# Spec: przygotowanie silnika rotacji do paczki npm (prywatnej)

Data: 2026-06-18
Autor: Grzegorz Tomicki

## Cel

Wydzielić silnik rotacji (`leaflet-rotate-custom.js`, ~1300 linii) jako instalowalną
paczkę: rozbić na moduły `src/`, dodać bundler (ESM + UMD), CSS z motywem przez zmienne,
typy TS i metadane paczki. Paczka **prywatna** — instalowana z git, bez publikacji do
publicznego rejestru npm.

## Decyzje (zatwierdzone)

| Temat | Decyzja |
|---|---|
| Zakres | TYLKO silnik rotacji. `geo-heading.js`/`geo-map-bridge.js`/`examples.js`/`index.html`/`leaflet-src.js` zostają jako demo w repo, poza paczką. |
| Nazwa | `@tomickigrzegorz/leaflet-rotate` |
| Wersja | `0.1.0` |
| Licencja | MIT (plik `LICENSE`, Grzegorz Tomicki, 2026) |
| Prywatność | `"private": true` (blokuje `npm publish`); instalacja przez `npm i github:tomickigrzegorz/leafelt-rotation` |
| Formaty | ESM + UMD |
| Bundler | Rollup + `@rollup/plugin-terser` |
| Leaflet | `peerDependencies: { leaflet: ">=1.9" }`, zewnętrzny w buildzie (UMD global `L`) |
| Typy | minimalny ręczny `index.d.ts` (augmentacja `declare module "leaflet"`) |
| CSS | strukturalny wstrzykiwany w runtime; kosmetyczny w `dist/leaflet-rotate.css` ze zmiennymi CSS |
| dist | **commitowany** do repo (git-install działa bez budowania); `prepare` jako zabezpieczenie |

## Architektura: podział `src/`

Każdy moduł zaczyna od `import L from "leaflet";` i **augmentuje prototypy `L.*`**
(side-effecting; brak realnych eksportów wartości). Odpowiada sekcjom obecnego pliku:

```
src/
  dom.js              // 1-2: L.Point.rotate/rotateFrom, L.DomUtil.setTransform/setPosition
  map-core.js         // 3-5: initialize, _initPanes, setBearing/getBearing,
                      //      _updateRotatePaneTransform, _commitRotatePan,
                      //      transformy współrzędnych, _getCenterOffset, getBounds,
                      //      getBoundsZoom, _animateZoomNoDelay, _tryAnimatedZoom, resize hook
  heading.js          // setHeading / stopHeadingUp / getHeadingUp + pętla rAF easingu
  markers-overlays.js // 6-8: L.Marker (_setPos/update/getEvents), L.Icon._setIconStyles,
                      //      L.DivOverlay/Popup/Tooltip (_updatePosition/_animateZoom/_adjustPan)
  handlers.js         // 9-10b: TouchGestures, ShiftKeyRotate, scroll guard, DragRotate,
                      //        MarkerDrag._onDrag
  controls.js         // 11-12: RotateControl (reset bearing) + compass control (igła)
  page-gestures.js    // 13: preventPageGestures (iOS gesturestart/change/end)
  inject-css.js       // wstrzykuje TYLKO strukturalny CSS paneów (wymagany do działania)
  index.js            // import L; następnie import wszystkich modułów w tej kolejności
```

### Kolejność i zależności (krytyczne)

- Moduły opakowują nawzajem swoje override'y, przechwytując referencję
  (`var _x = _mapProto.x;`) **w czasie ewaluacji modułu**. Dlatego `index.js` MUSI
  importować moduły w tej samej kolejności top→bottom co oryginalny plik.
- `index.js` nie eksportuje wartości — działa wyłącznie przez efekty uboczne na `L`.
  Wymaga to `"sideEffects": true` w `package.json`, inaczej bundlery konsumentów
  (tree-shaking) usuną cały kod.
- Konsument używa: `import "@tomickigrzegorz/leaflet-rotate";` (po imporcie `leaflet`).

## Bundler — Rollup

Powód wyboru zamiast esbuild: wymagany prawdziwy **UMD** z Leaflet jako external mapowanym
na global `L` (`output.globals = { leaflet: "L" }`, `external: ["leaflet"]`). esbuild nie
generuje UMD; Rollup tak. To również konwencja pluginów Leaflet.

Wyjścia do `dist/` (jeden config, wiele outputów):

| Plik | Format | Zastosowanie |
|---|---|---|
| `leaflet-rotate.esm.js` | ESM | `import` w bundlerach (Vite/webpack/rollup) |
| `leaflet-rotate.umd.js` | UMD | `<script>`, `require`, AMD |
| `leaflet-rotate.umd.min.js` | UMD + terser | CDN / produkcja |
| `leaflet-rotate.css` | CSS | kosmetyka kontrolek (opcjonalny import) |

UMD `name`: `LeafletRotate` (formalny global wrappera; realna integracja i tak przez `L`).
CSS kopiowany z `src/leaflet-rotate.css` do `dist/` (skrypt `cp` lub plugin copy).

devDependencies: `rollup`, `@rollup/plugin-terser`.

## CSS — podział strukturalny vs kosmetyczny

- **Strukturalny** (`.leaflet-rotate-pane`, `.leaflet-norotate-pane` — `position`, `top/left`,
  `z-index`, `will-change`) — wymagany do poprawnej rotacji. Pozostaje **wstrzykiwany w
  runtime** przez `inject-css.js`, żeby działanie nie zależało od pamiętania o imporcie CSS.
  NIE jest przeznaczony do nadpisywania.
- **Kosmetyczny** (`.leaflet-control-rotate*`, `.leaflet-control-rotate-compass*`,
  `.leaflet-rotate-compass--inactive`) — przenoszony do `src/leaflet-rotate.css` →
  `dist/leaflet-rotate.css`. Wartości przez **zmienne CSS** z fallbackami, np.:
  `--lrc-control-bg` (#fff), `--lrc-control-size` (30px), `--lrc-control-hover` (#f4f4f4).
  Importowany tylko gdy użytkownik włączy kontrolkę (`rotateControl`/compass — domyślnie off).
  Nadpisywalny bez `!important` przez ustawienie zmiennej.

## package.json (kształt docelowy)

```json
{
  "name": "@tomickigrzegorz/leaflet-rotate",
  "version": "0.1.0",
  "description": "Leaflet map rotation engine: bearing, heading-up, touch/drag rotate.",
  "private": true,
  "type": "module",
  "main": "dist/leaflet-rotate.umd.js",
  "module": "dist/leaflet-rotate.esm.js",
  "unpkg": "dist/leaflet-rotate.umd.min.js",
  "jsdelivr": "dist/leaflet-rotate.umd.min.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/leaflet-rotate.esm.js",
      "require": "./dist/leaflet-rotate.umd.js"
    },
    "./css": "./dist/leaflet-rotate.css"
  },
  "sideEffects": true,
  "files": ["dist"],
  "scripts": {
    "build": "rollup -c",
    "prepare": "rollup -c"
  },
  "peerDependencies": { "leaflet": ">=1.9" },
  "devDependencies": { "rollup": "^4", "@rollup/plugin-terser": "^0.4" },
  "license": "MIT",
  "author": "Grzegorz Tomicki",
  "repository": { "type": "git", "url": "git+https://github.com/tomickigrzegorz/leafelt-rotation.git" },
  "keywords": ["leaflet", "rotate", "rotation", "bearing", "heading", "map"]
}
```

Uwagi:
- `main`/`require` wskazują UMD (działa też pod `require` w Node; brak osobnego CJS).
- `dist/index.d.ts` kopiowany z `src/index.d.ts` w buildzie (albo trzymany wprost w `dist` i
  commitowany) — patrz Typy.

## Typy TypeScript

`src/index.d.ts` — ręczna augmentacja, kopiowana do `dist/index.d.ts`:

```ts
import "leaflet";
declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
    bearing?: number;
    touchRotate?: boolean;
    shiftKeyRotate?: boolean;
    dragRotate?: boolean;
    rotateControl?: boolean;
    preventPageGestures?: boolean;
  }
  interface Map {
    setBearing(theta: number): this;
    getBearing(): number;
    setHeading(deg: number | null, options?: { ease?: number; deadzone?: number }): this;
    stopHeadingUp(): this;
    getHeadingUp(): boolean;
  }
}
```

Sygnatury do potwierdzenia z faktyczną implementacją w `heading.js`/`map-core.js`
podczas implementacji (np. czy `setBearing` zwraca `this`).

## .gitignore / repo

- Dodać `node_modules` do `.gitignore`.
- `dist/` **NIE** ignorowane (commitowane, by git-install działał bez budowania).
- Demo (`index.html`, `examples.js`, `geo-*.js`, `leaflet-src.js`, `map-config.js`, `map.css`)
  zostaje w repo; wykluczone z paczki przez `files: ["dist"]`.

## Zgodność wsteczna (demo)

`index.html` obecnie ładuje `leaflet-rotate-custom.js?v=25`. Po podziale:
- albo demo wskazuje na `dist/leaflet-rotate.umd.js`,
- albo zostawiamy stary plik do czasu migracji demo.
Decyzja w planie implementacji (preferencja: demo → `dist/leaflet-rotate.umd.js`, usunięcie
starego `leaflet-rotate-custom.js` po weryfikacji parytetu).

## Kryteria akceptacji

1. `npm run build` generuje `dist/` z ESM, UMD, UMD.min, CSS, `index.d.ts` bez błędów.
2. Demo (`index.html`) działa na `dist/leaflet-rotate.umd.js` z parytetem zachowania
   (rotacja, heading-up, touch/drag rotate, kontrolki, zoom przy obrocie) — weryfikacja
   na urządzeniu lub headless jak w `[[heading-up-progress]]`.
3. `import "@tomickigrzegorz/leaflet-rotate"` w projekcie ESM augmentuje `L.Map`
   (dostępne `setBearing`/`setHeading`), bez wycięcia przez tree-shaking.
4. `npm i github:tomickigrzegorz/leafelt-rotation` w czystym projekcie udostępnia paczkę
   bez ręcznego budowania (dzięki commitowanemu `dist/` + `prepare`).
5. Nadpisanie `--lrc-*` zmienia wygląd kontrolek bez `!important`.

## Poza zakresem (YAGNI)

- Publikacja do publicznego npm / GitHub Packages.
- Druga paczka z modułami geo.
- CJS jako osobny build.
- Pełne typy dla wewnętrznych metod (`_`-prefixed).
- Testy automatyczne builda (weryfikacja przez demo).
