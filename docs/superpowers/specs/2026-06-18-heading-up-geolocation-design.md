# Heading-up + geolokalizacja (kompas) — design

Data: 2026-06-18

## Cel

Tryb „heading-up": mapa obraca się tak, by kierunek, w którym patrzy/idzie
użytkownik, był na górze ekranu — jak w nawigacji. Pokazujemy niebieską kropkę
pozycji + okrąg dokładności + półprzezroczysty stożek kierunku (styl Map
Google). Działa na iPhonie i Androidzie. Obrót musi być **gładki** mimo
dziesiątek zdarzeń kompasu na sekundę (Android).

## Zasada naczelna: rozdzielenie

Wtyczka rotacji **nie zna** geolokalizacji. Wystawia tylko publiczne,
źródło-niezależne API kierunku. Dane (kierunek/pozycja) może wpychać dowolne
źródło: nasz moduł czujników, `Leaflet.LocateControl`, cokolwiek.

Trzy niezależne jednostki:

1. **Wtyczka rotacji** (`leaflet-rotate-custom.js`) — dodajemy publiczne API
   `setHeading`. Generyczne, smoothing w środku.
2. **Moduł czujników** (`geo-heading.js`) — czyta GPS + kompas, filtruje szum,
   **emituje** dane. Zero zależności od mapy.
3. **Most + UI** (`geo-map-bridge.js` + przycisk) — *nasze* potrzeby/demo:
   słucha danych, rysuje kropkę/stożek, woła API mapy, auto-centruje.

## 1. Wtyczka rotacji — publiczne API (jedyny punkt integracji)

```js
map.setHeading(deg [, options]); // deg: 0..360 (0=N, zgodnie z zegarem)
map.setHeading(null);            // wyłącza tryb (alias: map.stopHeadingUp())
map.getHeadingUp();              // bool — czy tryb aktywny
```

- `setHeading(deg)` ustawia **docelowy** kierunek. Wewnętrzna pętla `rAF`
  easinguje `_bearing` do `normalize(-deg)` najkrótszą drogą. Kolejne
  wywołania tylko nadpisują cel → wiele zdarzeń/s nie powoduje skoków.
- `options`: `{ ease = 0.2, deadzone = 0.5 }` (deg). Gdy |Δ| < `deadzone`,
  pętla zatrzymuje się (oszczędność baterii) do następnego `setHeading`.
- Easing wzorowany na istniejącym `L.Map.ShiftKeyRotate._animate`
  (current += shortestDelta * ease), z normalizacją zawijania 359↔0.
- **Przejęcie ręczne**: ręczny obrót (`dragRotate`, `shiftKeyRotate`,
  `touchGestures` rotacja) wywołuje wewnętrzne `_stopHeadingUp()` — użytkownik
  może nadpisać tryb; ponowne `setHeading` go wznawia.
- Auto-centrowanie **nie** jest częścią `setHeading` (kierunek ≠ pozycja).
  Robi je konsument (most), bo on ma współrzędne. Rotacja pivotuje środek
  viewportu, więc gdy pozycja jest wycentrowana, obrót jej nie rusza.

Brak nowego stanu w serializacji; `_headingUp`, `_headingTarget`,
`_headingRAF` jako pola prywatne mapy.

## 2. Moduł czujników `geo-heading.js` (rozdzielony, opcjonalny)

API:
```js
GeoHeading.start();  // async; prosi o zgody (po geście)
GeoHeading.stop();
```
Emituje na `window`:
```
CustomEvent('geo:update',  { detail: { lat, lng, accuracy, heading, source } })
CustomEvent('geo:status',  { detail: { permission, sensors } })
CustomEvent('geo:error',   { detail: { code, message } })
```
- `source`: `'compass'` (na razie jedyne; hybryda GPS-course poza zakresem).
- Pozycja: `navigator.geolocation.watchPosition` (`enableHighAccuracy:true`).
- Kierunek (kompas), cross-platform:
  - **iOS**: `DeviceOrientationEvent.requestPermission()` (po geście) +
    `event.webkitCompassHeading` (już względem północy, zgodnie z zegarem).
  - **Android**: `deviceorientationabsolute` → z `alpha` liczymy
    `heading = (360 - alpha + screenAngle) % 360` (korekta o
    `screen.orientation.angle`). Fallback do `deviceorientation` gdy brak
    `absolute`.
- **Filtr szumu (low-pass na wektorze)**: utrzymujemy wygładzone `sin`/`cos`
  kąta (`s += k*(sinH - s)`, `c += k*(cosH - c)`, `heading = atan2(s,c)`),
  `k ≈ 0.2`. Unika problemu zawijania i tnie spike'i.
- **Throttling**: emisja max ~60 Hz (reszta zdarzeń tylko aktualizuje filtr).

## 3. Most + UI `geo-map-bridge.js` (nasze potrzeby / demo)

- **Przycisk toggle** (kontrolka Leaflet, ikona lokalizacji). Klik = gest dla
  zgody iOS. Start → `GeoHeading.start()`; ponowny klik → `stop()` + opcjonalny
  reset bearingu do 0.
- Na `geo:update`:
  - przesuwa **niebieską kropkę** + **okrąg dokładności** (`L.circle`, r =
    `accuracy` m) + **stożek** kierunku (półprzezroczysty divIcon),
  - woła `map.setHeading(heading)`,
  - **auto-centruje**: `map.panTo(latlng, {animate:false})` (throttlowane).
- W trybie heading-up stożek wskazuje „w górę" ekranu (rotacja markera 0, bo
  to mapa się obraca). Kropka/stożek w `norotatePane` (nie obracają się z mapą).

### Integracja z cudzą biblioteką (np. Leaflet.LocateControl)
Wtedy pomijasz `geo-heading.js` i most. Kropkę/dokładność rysuje LocateControl;
Ty z jej zdarzeń kompasu/pozycji wołasz `map.setHeading(h)` (i ewentualnie jej
własne „follow"). Ten sam publiczny punkt integracji.

## Wygładzanie — dwie warstwy
1. **Czujnik**: low-pass (szum sprzętu).
2. **Mapa**: rAF easing w `setHeading` (płynna animacja, niezależnie od źródła).
Deadzone tnie mikro-drgania. Wszystko po najkrótszym kącie.

## Wymagania / ograniczenia
- **HTTPS / secure context** wymagany dla geolokalizacji i `deviceorientation`.
  Test na telefonie: serwowanie po HTTPS (np. `ngrok`/`localtunnel`/lokalny
  cert), bo `file://` i zwykły `http` po LAN nie dadzą czujników na iOS.
- iOS wymaga gestu do `requestPermission()` — stąd przycisk.
- Brak czujników/zgody → most pokazuje status i nie obraca (graceful).

## Weryfikacja
- **Pure functions** (kąt: najkrótsza różnica, normalizacja; low-pass) —
  testowalne bez przeglądarki.
- **Headless (Chrome DevTools)**: `setHeading` wołane gęsto losowymi wartościami
  — asercje: bearing nie skacze (Δ/klatkę ≤ próg), zbiega do celu, deadzone
  zatrzymuje pętlę; ręczny obrót przerywa tryb.
- **Manualnie na telefonie** (HTTPS): toggle, obrót w miejscu i w ruchu —
  gładko, kropka podąża, stożek wskazuje kierunek, brak skakania.

## Poza zakresem (YAGNI)
- Hybryda kompas+GPS-course (możliwe później przez `source`).
- Nawigacja/trasowanie, offset kamery (pozycja niżej niż środek), tilt 3D.
- Trwały zapis stanu trybu.

## Pliki
- `leaflet-rotate-custom.js` — nowe `setHeading`/`stopHeadingUp`/`getHeadingUp`
  + przerwanie trybu przy ręcznym obrocie.
- `geo-heading.js` — nowy (czujniki).
- `geo-map-bridge.js` — nowy (most + UI demo).
- `index.html` — dołącza nowe pliki (HTTPS do testów na telefonie).
