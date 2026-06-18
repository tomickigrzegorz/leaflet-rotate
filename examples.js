// Przykładowe warstwy do testu skalowania/rotacji.
// Wymaga globalnej `map` z map-config.js.

// =====================================================================
// Test wydajności: 300 markerów + dodatkowe wielokąty w widoku
// =====================================================================
const TEST_BOUNDS = {
  latMin: 52.215,
  latMax: 52.245,
  lngMin: 20.985,
  lngMax: 21.035,
};

function randIn(min, max) {
  return min + Math.random() * (max - min);
}

// --- 100 markerów ---
(function () {
  const n = 100;
  const group = L.layerGroup().addTo(map);
  for (let i = 0; i < n; i++) {
    const lat = randIn(TEST_BOUNDS.latMin, TEST_BOUNDS.latMax);
    const lng = randIn(TEST_BOUNDS.lngMin, TEST_BOUNDS.lngMax);
    L.marker([lat, lng])
      .bindPopup("Marker #" + (i + 1))
      .addTo(group);
  }
})();

// --- 40 losowych wielokątów ---
(function () {
  const colors = [
    "#1abc9c",
    "#3498db",
    "#9b59b6",
    "#e67e22",
    "#2ecc71",
    "#e74c3c",
    "#f1c40f",
  ];
  for (let i = 0; i < 40; i++) {
    const clat = randIn(TEST_BOUNDS.latMin, TEST_BOUNDS.latMax);
    const clng = randIn(TEST_BOUNDS.lngMin, TEST_BOUNDS.lngMax);
    const sides = 3 + Math.floor(Math.random() * 5);
    const r = 0.0008 + Math.random() * 0.0022;
    const pts = [];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2 + Math.random() * 0.3;
      pts.push([clat + r * Math.sin(a), clng + r * Math.cos(a) * 1.5]);
    }
    const c = colors[i % colors.length];
    L.polygon(pts, {
      color: c,
      fillColor: c,
      fillOpacity: 0.3,
      weight: 2,
    }).addTo(map);
  }
})();

// =====================================================================
// Wyróżnione, ręczne przykłady
// =====================================================================

// --- Marker 1 (draggable) ---
L.marker([52.23, 21.01], { draggable: true })
  .addTo(map)
  .bindPopup("Warszawa — centrum")
  .bindTooltip("Przeciągnij mnie!", { direction: "top" });

// --- Marker 2 ---
L.marker([52.232, 21.015]).addTo(map).bindPopup("Drugi marker");

// --- Polygon (duży, obok markerów) ---
L.polygon(
  [
    [52.231, 21.006],
    [52.233, 21.01],
    [52.232, 21.014],
    [52.23, 21.013],
    [52.229, 21.009],
  ],
  { color: "green", fillColor: "#0f0", fillOpacity: 0.25, weight: 3 },
).addTo(map);

// --- Polyline (niebieska trasa) ---
L.polyline(
  [
    [52.232, 21.005],
    [52.234, 21.008],
    [52.233, 21.012],
    [52.231, 21.014],
    [52.229, 21.011],
    [52.228, 21.007],
  ],
  { color: "blue", weight: 4 },
).addTo(map);

// --- Circle ---
L.circle([52.231, 21.012], {
  radius: 200,
  color: "#e63946",
  fillColor: "#e63946",
  fillOpacity: 0.2,
  weight: 2,
})
  .addTo(map)
  .bindPopup("Circle r=200m");

// --- Rectangle ---
L.rectangle(
  [
    [52.228, 21.006],
    [52.23, 21.01],
  ],
  { color: "#ff7800", weight: 3, fillOpacity: 0.15 },
).addTo(map);

// --- CircleMarker ---
L.circleMarker([52.2325, 21.008], {
  radius: 12,
  color: "#9b59b6",
  fillColor: "#9b59b6",
  fillOpacity: 0.5,
})
  .addTo(map)
  .bindTooltip("CircleMarker", { permanent: true, direction: "right" });

// --- Gwiazdka (polygon) ---
(function () {
  var cx = 52.2295,
    cy = 21.013,
    outer = 0.002,
    inner = 0.0008,
    n = 5;
  var pts = [];
  for (var i = 0; i < n * 2; i++) {
    var a = Math.PI / 2 + (i * Math.PI) / n;
    var r = i % 2 === 0 ? outer : inner;
    pts.push([cx + r * Math.sin(a), cy + r * Math.cos(a)]);
  }
  L.polygon(pts, {
    color: "#e6b800",
    weight: 2,
    fillColor: "#ffd60a",
    fillOpacity: 0.6,
  }).addTo(map);
})();

// --- Sinusoida (polyline) ---
(function () {
  var pts = [];
  for (var i = 0; i <= 60; i++) {
    var t = i / 60;
    pts.push([52.228 + t * 0.006, 21.007 + Math.sin(t * Math.PI * 3) * 0.003]);
  }
  L.polyline(pts, {
    color: "#e63946",
    weight: 3,
    dashArray: "6 4",
  }).addTo(map);
})();

// --- Animowany marker (latający czerwony punkt) ---
var animMarker = L.marker([52.23, 21.01], {
  icon: L.divIcon({
    className: "",
    html: '<div style="background:#e74c3c;width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px rgba(231,76,60,.6)"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  }),
}).addTo(map);

var flyTarget = [52.231, 21.012];
function animateFly() {
  var pos = animMarker.getLatLng();
  var dlat = flyTarget[0] - pos.lat,
    dlng = flyTarget[1] - pos.lng;
  var dist = Math.sqrt(dlat * dlat + dlng * dlng);
  if (dist < 0.0003) {
    flyTarget = [
      52.228 + Math.random() * 0.006,
      21.006 + Math.random() * 0.012,
    ];
  } else {
    var s = 0.00012 / dist;
    animMarker.setLatLng([pos.lat + dlat * s, pos.lng + dlng * s]);
  }
  requestAnimationFrame(animateFly);
}
animateFly();

// --- Obracający się marker (strzałka na orbicie) ---
(function () {
  var oc = [52.231, 21.01],
    or = 0.002;
  var arrow = L.marker(oc, {
    icon: L.divIcon({
      className: "",
      html: '<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:20px solid #2563eb;filter:drop-shadow(0 0 3px rgba(37,99,235,.5))"></div>',
      iconSize: [16, 20],
      iconAnchor: [8, 20],
    }),
    rotateWithView: true,
  }).addTo(map);

  var deg = 0;
  function orbitAnim() {
    deg = (deg + 0.6) % 360;
    var rad = (deg * Math.PI) / 180;
    arrow.setLatLng([
      oc[0] + or * Math.cos(rad),
      oc[1] + or * Math.sin(rad) * 1.6,
    ]);
    arrow.options.rotation = deg + 90;
    arrow.update();
    requestAnimationFrame(orbitAnim);
  }
  orbitAnim();
})();

// --- Pulsujący circleMarker + ślad ---
(function () {
  var cx = 52.23,
    cy = 21.013,
    r = 0.0015;
  var dot = L.circleMarker([cx, cy], {
    radius: 6,
    color: "#06d6a0",
    fillColor: "#06d6a0",
    fillOpacity: 0.8,
  }).addTo(map);
  var trail = L.polyline([], {
    color: "#06d6a0",
    weight: 1.5,
    opacity: 0.4,
  }).addTo(map);
  var hist = [],
    a = 0;
  function pulseAnim() {
    a = (a + 0.9) % 360;
    var rad = (a * Math.PI) / 180;
    var lat = cx + r * Math.cos(rad),
      lng = cy + r * Math.sin(rad) * 1.6;
    dot.setLatLng([lat, lng]);
    dot.setRadius(5 + 3 * Math.sin((a * Math.PI) / 25));
    hist.push([lat, lng]);
    if (hist.length > 150) hist.shift();
    trail.setLatLngs(hist);
    requestAnimationFrame(pulseAnim);
  }
  pulseAnim();
})();
