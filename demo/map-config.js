// Map settings + tile layer
const map = L.map("map", {
  center: [52.233174715695576, 20.934453606605533],
  zoom: 14,
  rotate: true,
  touchRotate: true,
  shiftKeyRotate: true,
  dragRotate: true,
  // Leaflet's default pan momentum (fling) keeps the map gliding for a bit
  // after you release a drag. Clicking a marker in that window can miss it
  // (it's still moving under the cursor between mousedown and mouseup),
  // which reads as "the map pans instead of opening the popup". Uncomment
  // to make panning stop the instant you let go, at the cost of the
  // momentum feel.
  // inertia: false,
  // behavior: "reset" → rotation always on, click returns to north
  rotateControl: {
    position: "bottomright",
    behavior: "reset",
    closeOnZeroBearing: false,
  },
  // behavior: "toggle" → button enables/disables rotation:
  // rotateControl: { position: "bottomright", behavior: "toggle", enabled: false },
});
window.map = map;

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap",
}).addTo(map);
