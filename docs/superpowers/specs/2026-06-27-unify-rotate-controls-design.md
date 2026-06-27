# Unifikacja kontrolek obrotu — jedna `L.control.rotate` z opcją `behavior`

Data: 2026-06-27
Branch: `unify-rotate-controls`

## Problem

Biblioteka ma dwie osobne kontrolki obrotu:

- `L.Control.Rotate` (`rotateControl`) — przycisk resetu: klik = `setBearing(0)`, chowa się przy bearing 0 (`closeOnZeroBearing`). Zakłada, że obrót jest już włączony.
- `L.Control.RotateCompass` (`rotateCompassControl`) — przełącznik trybu obrotu: klik = włącz/wyłącz gesty obrotu, przy wyłączaniu zeruje bearing.

Po ujednoliceniu ikony (obie mają teraz tę samą igłę kompasu i obracają się tak samo) obie kontrolki są **wizualnie nie do odróżnienia**, a funkcjonalnie częściowo się pokrywają (obie resetują bearing). To myli użytkownika i sprawia wrażenie, że „dwie rzeczy robią to samo".

Realna różnica jest jedna: czy obrót jest włączony na stałe (kontrolka tylko resetuje), czy domyślnie wyłączony i kontrolka go włącza.

## Cel

Użytkownik chce **wyboru zachowania** w zależności od mapy:

- czasem obrót ma być włączony domyślnie (model Google: kontrolka tylko wraca na północ),
- czasem obrót domyślnie wyłączony, a przycisk go uruchamia.

…ale bez dwóch mylących kontrolek o identycznym wyglądzie.

## Rozwiązanie

**Jedna kontrolka** `L.Control.Rotate` / `L.control.rotate` z opcją `behavior`, wybierającą jeden z dwóch trybów. Druga klasa (`RotateCompass`) zostaje **usunięta całkowicie** — biblioteka jest świeżo wydana (0.1.4, wczoraj), więc wsteczna zgodność nie jest wymagana.

### Tryb `behavior: 'reset'` (domyślny, model Google)

- Obrót jest włączony niezależnie od kontrolki — przez opcje mapy (`rotate`, `dragRotate`, `touchRotate`, `shiftKeyRotate`). Kontrolka **nie** zarządza gestami.
- Klik = `setBearing(0)` → powrót na północ.
- Widoczność sterowana opcją `closeOnZeroBearing`:
  - `true` → kontrolka pojawia się dopiero po obrocie (bearing != 0) i znika po powrocie na północ (w tym po kliknięciu).
  - `false` → zawsze widoczna, igła zawsze pokazuje bearing.
- Tryb „niewidoczny, ale obrót włączony" = po prostu nie dodajemy kontrolki, a obrót włączamy w opcjach mapy.

### Tryb `behavior: 'toggle'` (przycisk uruchamia obrót)

- Obrót domyślnie wyłączony.
- Klik (gdy wyłączony) = włącz obrót: `dragRotate`/`touchGestures`/`shiftKeyRotate` enable (każdy bramkowany odpowiednią opcją mapy), igła kolorowa.
- Klik (gdy włączony) = wyłącz obrót + `setBearing(0)` (reset na północ), igła wyszarzona (klasa `leaflet-control-rotate--inactive` na kontenerze).
- Zawsze widoczny; stan (on/off) pokazany kolorem igły.
- Gest dwóch palców (pinch zoom + obrót jednocześnie) bez zmian — handler `TouchGestures` (`src/handlers.js`) już obsługuje oba naraz w stylu Google; `touchZoom.disable()` przy włączaniu oddaje zoom temu handlerowi, nie wyłącza zoomu.

### Wspólne dla obu trybów

- Ta sama ikona igły kompasu (biało-czerwona), obracana wg bearing przez `transform` na elemencie SVG (`_needle`), `transform-origin:center`.
- Konfigurowalny `position` (domyślnie `topleft`).
- Ten sam układ CSS przycisku (flex, `--lrc-control-size`).

## API po zmianie

`MapOptions` (w `src/index.d.ts` i `dist/index.d.ts`):

```ts
rotateControl?:
  | boolean
  | {
      position?: string;
      behavior?: "reset" | "toggle";   // domyślnie "reset"
      closeOnZeroBearing?: boolean;     // dotyczy trybu "reset"; domyślnie true
      enabled?: boolean;                // dotyczy trybu "toggle": stan początkowy; domyślnie false
    };
// USUNIĘTE: rotateCompassControl
```

Init hook mapy: pozostaje jeden hook dla `rotateControl`. Hook dla `rotateCompassControl` usunięty.

Eksport globalny: pozostaje `L.control.rotate`. `L.control.rotateCompass` i `L.Control.RotateCompass` usunięte.

## Pliki do zmiany

- `src/controls.js` — scalić obie klasy w jedną `L.Control.Rotate` z gałęzią `behavior`; usunąć `RotateCompass` i jej init hook/eksport.
- `src/leaflet-rotate.css` — ujednolicić klasy; klasa stanu „inactive" dla trybu toggle pod jedną nazwą kontrolki (`.leaflet-control-rotate`).
- `src/index.d.ts` — zaktualizować typ `rotateControl`, usunąć `rotateCompassControl`.
- `demo/map-config.js` — pokazać użycie nowego API (np. domyślny `behavior: 'reset'`); zaktualizować zakomentowany przykład toggle.
- `README.md` — opisać jedną kontrolkę i opcję `behavior`; usunąć wzmianki o `rotateCompassControl`.
- `dist/*` — przebudować (`npm run build`).

## Decyzje i ograniczenia

- Brak wstecznej zgodności (świeża biblioteka) — usuwamy stare API w całości, bez aliasów.
- Kontrolka w trybie `reset` świadomie **nie** włącza gestów — to zadanie opcji mapy. Dzięki temu „obrót zawsze on" jest jednoznaczny i niezależny od obecności kontrolki.
- CSS: jedna nazwa klasy bazowej `leaflet-control-rotate` dla obu trybów; stan wyszarzenia (`leaflet-control-rotate--inactive`) tylko w trybie toggle.

## Testy / weryfikacja (manualnie w demo)

1. `behavior: 'reset'`, `closeOnZeroBearing: true` — kontrolka pojawia się po obrocie, klik wraca na północ i chowa kontrolkę; obrót działa cały czas (mysz/gest).
2. `behavior: 'reset'`, `closeOnZeroBearing: false` — kontrolka zawsze widoczna, igła śledzi bearing.
3. `behavior: 'toggle'`, `enabled: false` — start wyszarzona, brak obrotu; klik włącza obrót (igła kolorowa), obrót działa; klik wyłącza + reset na północ.
4. Telefon: w trybie toggle po włączeniu — dwa palce zoomują i obracają jednocześnie.
5. Ikona i obrót igły identyczne w obu trybach.
