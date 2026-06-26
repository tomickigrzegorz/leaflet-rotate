// Przykładowe warstwy do testu skalowania/rotacji.
// Wymaga globalnej `map` z map-config.js.

// =====================================================================
// Test wydajności: 300 markerów + dodatkowe wielokąty w widoku
// =====================================================================
const TEST_BOUNDS = {
  latMin: 52.218174715695576,
  latMax: 52.248174715695576,
  lngMin: 20.909453606605533,
  lngMax: 20.959453606605533,
};

map.on("click", function (e) {
  console.log("Click at", e.latlng);
});

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
L.marker([52.233174715695576, 20.934453606605533], { draggable: true })
  .addTo(map)
  .bindPopup("Warszawa — centrum")
  .bindTooltip("Przeciągnij mnie!", { direction: "top", offset: [-16, 0] });

// --- Marker 2 ---
L.marker([52.235174715695576, 20.939453606605533])
  .addTo(map)
  .bindPopup("Drugi marker");

// --- Polygon (duży, obok markerów) ---
L.polygon(
  [
    [52.234174715695576, 20.930453606605533],
    [52.236174715695576, 20.934453606605533],
    [52.235174715695576, 20.938453606605533],
    [52.233174715695576, 20.937453606605533],
    [52.232174715695576, 20.933453606605533],
  ],
  { color: "green", fillColor: "#0f0", fillOpacity: 0.25, weight: 3 },
).addTo(map);

// --- Polyline (niebieska trasa) ---
L.polyline(
  [
    [52.235174715695576, 20.929453606605533],
    [52.237174715695576, 20.932453606605533],
    [52.236174715695576, 20.936453606605533],
    [52.234174715695576, 20.938453606605533],
    [52.232174715695576, 20.935453606605533],
    [52.231174715695576, 20.931453606605533],
  ],
  { color: "blue", weight: 4 },
).addTo(map);

// --- Circle ---
L.circle([52.234174715695576, 20.936453606605533], {
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
    [52.231174715695576, 20.930453606605533],
    [52.233174715695576, 20.934453606605533],
  ],
  { color: "#ff7800", weight: 3, fillOpacity: 0.15 },
).addTo(map);

// --- CircleMarker ---
L.circleMarker([52.235674715695576, 20.932453606605533], {
  radius: 12,
  color: "#9b59b6",
  fillColor: "#9b59b6",
  fillOpacity: 0.5,
})
  .addTo(map)
  .bindTooltip("CircleMarker", { permanent: true, direction: "right" });

// --- Gwiazdka (polygon) ---
(function () {
  var cx = 52.232674715695576,
    cy = 20.937453606605533,
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
    pts.push([
      52.231174715695576 + t * 0.006,
      20.931453606605533 + Math.sin(t * Math.PI * 3) * 0.003,
    ]);
  }
  L.polyline(pts, {
    color: "#e63946",
    weight: 3,
    dashArray: "6 4",
  }).addTo(map);
})();

// --- Animowany marker (latający czerwony punkt) ---
var animMarker = L.marker([52.233174715695576, 20.934453606605533], {
  icon: L.divIcon({
    className: "",
    html: '<div style="background:#e74c3c;width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px rgba(231,76,60,.6)"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  }),
}).addTo(map);

var flyTarget = [52.234174715695576, 20.936453606605533];
function animateFly() {
  var pos = animMarker.getLatLng();
  var dlat = flyTarget[0] - pos.lat,
    dlng = flyTarget[1] - pos.lng;
  var dist = Math.sqrt(dlat * dlat + dlng * dlng);
  if (dist < 0.0003) {
    flyTarget = [
      52.231174715695576 + Math.random() * 0.006,
      20.930453606605533 + Math.random() * 0.012,
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
  var oc = [52.234174715695576, 20.934453606605533],
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
  var cx = 52.233174715695576,
    cy = 20.937453606605533,
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

// =====================================================================
// Test pluginów / dodatkowych typów warstw pod rotacją
// =====================================================================

// --- Marker SVG (L.divIcon), obraca się z mapą ---
(function () {
  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">' +
    '<path d="M17 0C7.6 0 0 7.6 0 17c0 12 17 27 17 27s17-15 17-27C34 7.6 26.4 0 17 0z" fill="#8e44ad" stroke="#fff" stroke-width="2"/>' +
    '<circle cx="17" cy="17" r="7" fill="#fff"/></svg>';
  L.marker([52.236674715695576, 20.945453606605533], {
    icon: L.divIcon({
      className: "",
      html: svg,
      iconSize: [34, 44],
      iconAnchor: [17, 44],
      popupAnchor: [0, -40],
    }),
    draggable: true,
  })
    .addTo(map)
    .bindPopup("Marker SVG (draggable)");
})();

// --- Popup otwarty od razu ---
L.marker([52.230674715695576, 20.948453606605533])
  .addTo(map)
  .bindPopup("Popup otwarty od startu")
  .openPopup();

// --- Klaster markerów (leaflet.markercluster) ---
(function () {
  if (!L.markerClusterGroup) {
    console.warn("markercluster nie załadowany");
    return;
  }
  var cluster = L.markerClusterGroup();
  for (var i = 0; i < 30; i++) {
    var lat = randIn(52.2185, 52.2225);
    var lng = randIn(20.948, 20.958);
    cluster.addLayer(L.marker([lat, lng]).bindPopup("Klaster #" + (i + 1)));
  }
  map.addLayer(cluster);
})();

// --- GeoJSON layer ---
(function () {
  var gj = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "GeoJSON punkt" },
        geometry: {
          type: "Point",
          coordinates: [20.927453606605533, 52.239674715695576],
        },
      },
      {
        type: "Feature",
        properties: { name: "GeoJSON linia" },
        geometry: {
          type: "LineString",
          coordinates: [
            [20.924453606605533, 52.237674715695576],
            [20.928453606605533, 52.239674715695576],
            [20.931453606605533, 52.238674715695576],
          ],
        },
      },
      {
        type: "Feature",
        properties: { name: "GeoJSON poligon" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [20.921453606605533, 52.236674715695576],
              [20.925453606605533, 52.237674715695576],
              [20.924453606605533, 52.234674715695576],
              [20.920453606605533, 52.234674715695576],
              [20.921453606605533, 52.236674715695576],
            ],
          ],
        },
      },
    ],
  };
  L.geoJSON(gj, {
    style: {
      color: "#d62828",
      weight: 2,
      fillColor: "#f77f00",
      fillOpacity: 0.3,
    },
    onEachFeature: function (f, layer) {
      if (f.properties && f.properties.name) layer.bindPopup(f.properties.name);
    },
  }).addTo(map);
})();
