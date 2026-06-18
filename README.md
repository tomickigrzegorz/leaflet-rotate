# leaflet-rotate-custom

Rozszerzenie Leaflet 1.9.4 dodające obrót mapy (bearing), obrót kafli, warstw
wektorowych, markerów, popupów i tooltipów oraz gesty obrotu (mysz, klawiatura,
dotyk) i kontrolkę-kompas.

## Instalacja

```html
<link rel="stylesheet" href="leaflet@1.9.4/leaflet.css" />
<script src="leaflet@1.9.4/leaflet.js"></script>
<script src="leaflet-rotate-custom.js"></script>
```

Skrypt musi być załadowany **po** Leaflecie.

---

## Opcje mapy (`L.map(id, { ... })`)

| Opcja | Typ | Domyślnie | Opis |
|---|---|---|---|
| `rotate` | `boolean` | `false` | Włącza cały system obrotu. **Wymagane** dla pozostałych opcji obrotu. Bez niego mapa działa jak zwykły Leaflet. |
| `bearing` | `number` | `0` | Początkowy kąt obrotu mapy w stopniach (zgodnie z ruchem wskazówek zegara). |
| `dragRotate` | `boolean` | `true` | Obrót **prawym przyciskiem myszy** (przeciąganie w poziomie). Aktywny tylko gdy `rotate: true`. |
| `shiftKeyRotate` | `boolean` | `false` | Obrót przez **Shift + kółko myszy**. Zwykły zoom kółkiem jest wtedy blokowany przy wciśniętym Shift. |
| `touchRotate` | `boolean` | `false` | Obrót gestem **dwóch palców** (pinch-rotate, styl Google Maps). Rotacja ma próg ~30°, żeby nie kolidowała z pinch-zoom. |
| `rotateControl` | `boolean \| object` | `false` | Kontrolka strzałki resetująca obrót do północy (patrz niżej). |
| `rotateCompassControl` | `boolean \| object` | `false` | Kontrolka-kompas włączająca/wyłączająca obrót (patrz niżej). |
| `preventPageGestures` | `boolean` | `true` | Blokuje natywny pinch-zoom **całej strony** w iOS Safari (`preventDefault` na zdarzeniach `gesturestart/change/end`), żeby uszczypnięcie działało na mapie, a nie powiększało stronę. Na desktopie/Androidzie zbędne (wystarcza `touch-action`), ale nieszkodliwe. Ustaw `false`, by wyłączyć. Działa niezależnie od `rotate`. |

> Uwaga: zoom (przyciskami, kółkiem, wokół kursora) jest animowany także przy
> obrocie. Jeśli mapa była przesunięta, offset jest „commitowany" (reprojekcja
> bez zmiany widoku) tuż przed animacją, dzięki czemu kotwica zostaje na miejscu
> i nie pojawiają się szare kafle.

---

## `rotateCompassControl` — kompas (główny przełącznik obrotu)

Wartość:
- `false` — kontrolka nie jest dodawana (przycisk niewidoczny).
- `true` — kontrolka z ustawieniami domyślnymi.
- `object` — kontrolka z własnymi ustawieniami:

```js
rotateCompassControl: { enabled: false, position: "bottomright" }
```

| Pole | Typ | Domyślnie | Opis |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Stan startowy obrotu. `true` = obrót aktywny od razu, przycisk kolorowy. `false` = obrót wyłączony, włącza się **dopiero po kliknięciu** kompasu. |
| `position` | `string` | `"bottomright"` | Pozycja: `"topleft"`, `"topright"`, `"bottomleft"`, `"bottomright"`. |

Zachowanie:
- Kliknięcie przełącza obrót **on/off**. Wyłączenie resetuje też `bearing` do 0 i wyłącza wszystkie gesty obrotu (`dragRotate`, `shiftKeyRotate`, `touchGestures`).
- Ikona obraca się zgodnie z aktualnym `bearing`.
- Gdy widoczna, ale **nieaktywna** → ikona w skali szarości (czarno-biała). Aktywna → w kolorze.

---

## `rotateControl` — strzałka resetująca do północy

```js
rotateControl: { position: "topleft", closeOnZeroBearing: true }
```

| Pole | Typ | Domyślnie | Opis |
|---|---|---|---|
| `position` | `string` | `"topleft"` | Pozycja kontrolki. |
| `closeOnZeroBearing` | `boolean` | `true` | Ukrywa kontrolkę, gdy `bearing === 0`. |

Kliknięcie ustawia `bearing` na 0 (północ).

---

## Opcje markera (`L.marker(latlng, { ... })`)

| Opcja | Typ | Domyślnie | Opis |
|---|---|---|---|
| `rotation` | `number` | `0` | Obrót ikony markera w stopniach (niezależnie od mapy). |
| `rotateWithView` | `boolean` | `false` | Marker obraca się razem z mapą (dodaje `bearing` mapy do `rotation`). |
| `scale` | `number` | `undefined` | Skala ikony markera. |

Po zmianie `marker.options.rotation` należy wywołać `marker.update()`.

---

## API mapy

| Metoda / zdarzenie | Opis |
|---|---|
| `map.setBearing(stopnie)` | Ustawia kąt obrotu mapy (0–360, normalizowane). |
| `map.getBearing()` | Zwraca bieżący kąt obrotu w stopniach. |
| zdarzenie `"rotate"` | Emitowane przy każdej zmianie `bearing`. |

---

## Sterowanie obrotem (interakcje)

| Gest | Warunek (opcja) |
|---|---|
| Prawy przycisk myszy + przeciąganie | `dragRotate: true` |
| Shift + kółko myszy | `shiftKeyRotate: true` |
| Dwa palce (obrót) | `touchRotate: true` |
| Kliknięcie kompasu | `rotateCompassControl` (włącza/wyłącza obrót) |

Wszystkie wymagają `rotate: true`. Gdy obrót jest wyłączony przez kompas, żaden z gestów nie działa do czasu ponownego kliknięcia.

---

## Przykład

```js
const map = L.map("map", {
  center: [52.23, 21.01],
  zoom: 14,
  rotate: true,
  touchRotate: true,
  shiftKeyRotate: true,
  dragRotate: true,
  rotateControl: false,
  rotateCompassControl: { enabled: false, position: "bottomright" },
});
```
