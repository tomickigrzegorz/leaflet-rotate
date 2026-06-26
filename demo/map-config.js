// Map settings + tile layer
const map = L.map("map", {
  center: [52.233174715695576, 20.934453606605533],
  zoom: 14,
  rotate: true,
  touchRotate: true,
  shiftKeyRotate: true,
  dragRotate: true,
  rotateControl: false,
  rotateCompassControl: { enabled: false, position: "bottomright" },
});
window.map = map;

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap",
}).addTo(map);
