// Map settings + tile layer
const map = L.map("map", {
  center: [52.233174715695576, 20.934453606605533],
  zoom: 14,
  rotate: true,
  touchRotate: true,
  shiftKeyRotate: true,
  dragRotate: true,
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
