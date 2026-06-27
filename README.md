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
| `rotateControl`        | `boolean \| object` | `false` | Compass control. `behavior: "reset"` resets bearing to north; `behavior: "toggle"` enables/disables rotation (see below).                                                                                                                                                                          |
| `preventPageGestures`  | `boolean`           | `true`  | Blocks native page pinch-zoom on iOS Safari (`preventDefault` on `gesturestart/change/end` events) so a pinch acts on the map rather than zooming the page. Not needed on desktop/Android (where `touch-action` suffices) but harmless. Set `false` to disable. Works independently of `rotate`. |

> Note: zoom (via buttons, scroll wheel, or around the cursor) is animated even when the map is rotated. If the map was panned, the offset is "committed" (reprojected without changing the view) just before the animation, keeping the zoom anchor in place and preventing grey tile flashes.

---

## `rotateControl` — compass control

A single compass control with two behaviours selected via `behavior`.

Value:

- `false` — control is not added (button invisible).
- `true` — control with default settings (`behavior: "reset"`).
- `object` — control with custom settings:

```js
rotateControl: { position: "topleft", behavior: "reset", closeOnZeroBearing: true }
```

| Field                | Type      | Default     | Description                                                                                                          |
| -------------------- | --------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `behavior`           | `string`  | `"reset"`   | `"reset"` = rotation always on, click returns to north. `"toggle"` = click enables/disables rotation.              |
| `position`           | `string`  | `"topleft"` | Position: `"topleft"`, `"topright"`, `"bottomleft"`, `"bottomright"`.                                              |
| `closeOnZeroBearing` | `boolean` | `true`      | **Reset mode only.** Hides the control when `bearing === 0` (appears after rotating, hides after returning north). |
| `enabled`            | `boolean` | `false`     | **Toggle mode only.** Initial rotation state. `false` = rotation off until the compass is clicked.                 |

### `behavior: "reset"` (rotation always on, Google-style)

- Rotation is enabled by the map options (`rotate`, `dragRotate`, `touchRotate`, `shiftKeyRotate`) — the control does **not** manage gestures.
- Click sets `bearing` to 0 (north).
- The needle rotates with the current `bearing`.
- With `closeOnZeroBearing: true` the control appears only when rotated and hides after returning to north (including after a click). With `false` it is always visible.

### `behavior: "toggle"` (button enables rotation)

- Rotation is **off by default**. Click enables it (gestures active, needle coloured); click again disables it, resets `bearing` to 0, and greys the needle.
- Always visible; state shown by needle colour (active = coloured, inactive = greyscale).
- Two-finger gesture zooms and rotates simultaneously (Google-style) once rotation is enabled.

### Adding the control programmatically

```js
L.control.rotate({ position: "topleft", behavior: "reset" }).addTo(map);
L.control.rotate({ position: "bottomright", behavior: "toggle", enabled: false }).addTo(map);
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
| Compass click             | `rotateControl` with `behavior: "toggle"` (on/off) |

All require `rotate: true`. With `rotateControl` in `behavior: "toggle"`, rotation is off until the compass is clicked; no gesture works until then.

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
  rotateControl: { position: "topright", behavior: "reset", closeOnZeroBearing: true },
});
```
