# @tomickigrzegorz/leaflet-rotate

Leaflet map rotation: bearing, heading-up, touch/drag/keyboard rotate, and a compass control.

## Install

### npm

```bash
npm i @tomickigrzegorz/leaflet-rotate leaflet
```

Or install the latest from git:

```bash
npm i github:tomickigrzegorz/leaflet-rotate
```

### Bundler (ESM)

```js
import "leaflet";
import "@tomickigrzegorz/leaflet-rotate";
import "@tomickigrzegorz/leaflet-rotate/css"; // only if you use the rotate/compass controls
```

### Browser `<script>` (UMD)

```html
<link rel="stylesheet" href="leaflet.css" />
<link rel="stylesheet" href="dist/leaflet-rotate.css" />
<!-- optional, for controls -->
<script src="leaflet.js"></script>
<script src="dist/leaflet-rotate.umd.min.js"></script>
```

Load it **after** Leaflet. `leaflet` is a peer dependency (>=1.9).

---

## Map options (`L.map(id, { ... })`)

| Option                 | Type                | Default | Description                                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rotate`               | `boolean`           | `false` | Enables the entire rotation system. **Required** for all other rotation options. Without it the map behaves as plain Leaflet.                                                                                                                                                                    |
| `bearing`              | `number`            | `0`     | Initial map rotation angle in degrees (clockwise).                                                                                                                                                                                                                                               |
| `dragRotate`           | `boolean`           | `true`  | Rotation with the **right mouse button** (horizontal drag). Active only when `rotate: true`.                                                                                                                                                                                                     |
| `shiftKeyRotate`       | `boolean`           | `false` | Rotation via **Shift + scroll wheel**. Normal scroll-wheel zoom is suppressed while Shift is held.                                                                                                                                                                                               |
| `touchRotate`          | `boolean`           | `false` | Rotation with a **two-finger** gesture (pinch-rotate, Google Maps style). Rotation has a ~30° threshold to avoid colliding with pinch-zoom.                                                                                                                                                      |
| `rotateClockwise`      | `boolean`           | `true`  | Direction of all rotation inputs (two-finger, right-mouse drag, Shift+wheel). `true` = clockwise gesture rotates the map clockwise (MapLibre-like). Set `false` to invert all three.                                                                                                             |
| `rotateControl`        | `boolean \| object` | `false` | Arrow control that resets bearing to north (see below).                                                                                                                                                                                                                                          |
| `rotateCompassControl` | `boolean \| object` | `false` | Compass control that toggles rotation (see below).                                                                                                                                                                                                                                               |
| `preventPageGestures`  | `boolean`           | `true`  | Blocks native page pinch-zoom on iOS Safari (`preventDefault` on `gesturestart/change/end` events) so a pinch acts on the map rather than zooming the page. Not needed on desktop/Android (where `touch-action` suffices) but harmless. Set `false` to disable. Works independently of `rotate`. |

> Note: zoom (via buttons, scroll wheel, or around the cursor) is animated even when the map is rotated. If the map was panned, the offset is "committed" (reprojected without changing the view) just before the animation, keeping the zoom anchor in place and preventing grey tile flashes.

---

## `rotateCompassControl` — compass (main rotation toggle)

Value:

- `false` — control is not added (button invisible).
- `true` — control with default settings.
- `object` — control with custom settings:

```js
rotateCompassControl: { enabled: false, position: "bottomright" }
```

| Field      | Type      | Default         | Description                                                                                                                                         |
| ---------- | --------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`  | `boolean` | `false`         | Initial rotation state. `true` = rotation active immediately, button coloured. `false` = rotation off, enabled **only after clicking** the compass. |
| `position` | `string`  | `"bottomright"` | Position: `"topleft"`, `"topright"`, `"bottomleft"`, `"bottomright"`.                                                                               |

Behaviour:

- Click toggles rotation **on/off**. Disabling also resets `bearing` to 0 and disables all rotation gestures (`dragRotate`, `shiftKeyRotate`, `touchGestures`).
- The icon rotates with the current `bearing`.
- When visible but **inactive** → icon is greyscale. Active → coloured.

---

## `rotateControl` — arrow that resets to north

```js
rotateControl: { position: "topleft", closeOnZeroBearing: true }
```

| Field                | Type      | Default     | Description                             |
| -------------------- | --------- | ----------- | --------------------------------------- |
| `position`           | `string`  | `"topleft"` | Control position.                       |
| `closeOnZeroBearing` | `boolean` | `true`      | Hides the control when `bearing === 0`. |

Click sets `bearing` to 0 (north).

### Adding controls programmatically

Both controls can also be created via factory functions (e.g. to add them after map init):

```js
L.control.rotate({ position: "topleft" }).addTo(map);
L.control.rotateCompass({ enabled: true, position: "bottomright" }).addTo(map);
```

---

## Marker options (`L.marker(latlng, { ... })`)

| Option           | Type      | Default     | Description                                                           |
| ---------------- | --------- | ----------- | --------------------------------------------------------------------- |
| `rotation`       | `number`  | `0`         | Marker icon rotation in degrees (independent of the map).             |
| `rotateWithView` | `boolean` | `false`     | Marker rotates with the map (adds the map's `bearing` to `rotation`). |
| `scale`          | `number`  | `undefined` | Marker icon scale.                                                    |

After changing `marker.options.rotation` call `marker.update()`.

---

## Map API

### Methods

| Method                          | Description                                                                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `map.setBearing(degrees)`       | Sets the map rotation angle (0–360, normalised).                                                                                                                                                                                 |
| `map.getBearing()`              | Returns the current rotation angle in degrees.                                                                                                                                                                                   |
| `map.setHeading(deg, options?)` | Heading-up mode: rotates the map so `deg` (0=N, clockwise) points to the top (`bearing = -deg`), smoothed via a rAF easing loop. `options.ease` (default `0.2`), `options.deadzone` (default `0.5`°). Pass `deg = null` to stop. |
| `map.stopHeadingUp()`           | Disables heading-up mode (does not reset `bearing`).                                                                                                                                                                             |
| `map.getHeadingUp()`            | Returns whether heading-up mode is active.                                                                                                                                                                                       |

### Events

| Event           | Description                                                                  |
| --------------- | ---------------------------------------------------------------------------- |
| `"rotatestart"` | Fired once when a rotation gesture begins (drag / shift-wheel / two-finger). |
| `"rotate"`      | Fired on every `bearing` change (gestures, `setBearing`, heading-up easing). |

```js
map.setBearing(45); // rotate the map to 45°
map.getBearing(); // -> 45

map.setHeading(compass); // heading-up from your own source (0=N, clockwise)
map.setHeading(null); // stop heading-up easing
map.stopHeadingUp(); // disable heading-up (keeps current bearing)
```

---

## Rotation controls / interactions

| Gesture                   | Condition (option)                               |
| ------------------------- | ------------------------------------------------ |
| Right mouse button + drag | `dragRotate: true`                               |
| Shift + scroll wheel      | `shiftKeyRotate: true`                           |
| Two fingers (rotate)      | `touchRotate: true`                              |
| Compass click             | `rotateCompassControl` (toggles rotation on/off) |

All require `rotate: true`. When rotation is disabled via the compass, no gesture works until the compass is clicked again.

---

## Theming the controls

Control styling lives in `@tomickigrzegorz/leaflet-rotate/css` and is driven by CSS variables — override them without `!important`:

```css
:root {
  --lrc-control-bg: #1e1e1e;
  --lrc-control-hover: #333;
  --lrc-control-size: 34px;
}
```

---

## Example

```js
const map = L.map("map", {
  center: [52.23, 21.01],
  zoom: 14,
  rotate: true,
  touchRotate: true,
  shiftKeyRotate: true,
  dragRotate: true,
  rotateClockwise: true,
  rotateControl: false,
  rotateCompassControl: { enabled: false, position: "bottomright" },
});
```
