// geo-map-bridge.js — łączy dane z geo-heading.js z mapą (nasze potrzeby/demo).
// Słucha 'geo:update', rysuje niebieską kropkę + okrąg dokładności + stożek,
// auto-centruje i woła map.setHeading(). Wymaga globalnej `map` i `GeoHeading`.
// Dla cudzej biblioteki (np. LocateControl) pomijasz ten plik i sam wołasz
// map.setHeading(h) z jej zdarzeń.
(function (global) {
  "use strict";

  var map = global.map;
  if (!map) return;

  // --- style kropki/stożka ---
  var css = document.createElement("style");
  css.textContent = [
    ".geo-pos{position:relative;width:0;height:0}",
    ".geo-dot{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.35)}",
    // stożek wskazuje GÓRĘ ekranu (mapa obraca się heading-up)
    ".geo-cone{position:absolute;left:-30px;top:-66px;width:60px;height:60px;",
    "background:radial-gradient(closest-side at 50% 100%, rgba(26,115,232,.45), rgba(26,115,232,0));",
    "clip-path:polygon(50% 0, 100% 100%, 0 100%)}",
    ".geo-locate-btn{background:#fff;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer}",
    ".geo-locate-btn.active{color:#1a73e8}",
    ".geo-locate-btn svg{display:block}",
  ].join("");
  document.head.appendChild(css);

  var posMarker = null;
  var accCircle = null;
  var active = false;
  var lastPan = 0;

  var posIcon = L.divIcon({
    className: "",
    html: '<div class="geo-pos"><div class="geo-cone"></div><div class="geo-dot"></div></div>',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  function onUpdate(e) {
    if (!active) return;
    var d = e.detail;
    if (d.heading != null) map.setHeading(d.heading);

    if (d.lat == null) return;
    var ll = [d.lat, d.lng];

    if (!posMarker) {
      accCircle = L.circle(ll, {
        radius: d.accuracy || 0,
        color: "#1a73e8",
        weight: 1,
        fillColor: "#1a73e8",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map);
      posMarker = L.marker(ll, { icon: posIcon, interactive: false, zIndexOffset: 1000 }).addTo(map);
    } else {
      posMarker.setLatLng(ll);
      accCircle.setLatLng(ll).setRadius(d.accuracy || 0);
    }

    // auto-centrowanie (throttle); animate:false -> mapPanePos=0, brak walki z rotacją
    var now = Date.now();
    if (now - lastPan > 200) {
      lastPan = now;
      map.panTo(ll, { animate: false });
    }
  }

  function onError(e) {
    console.warn("geo:error", e.detail);
  }

  function enable() {
    if (active) return;
    active = true;
    btn.classList.add("active");
    global.addEventListener("geo:update", onUpdate);
    global.addEventListener("geo:error", onError);
    GeoHeading.start();
  }

  function disable() {
    active = false;
    btn.classList.remove("active");
    global.removeEventListener("geo:update", onUpdate);
    global.removeEventListener("geo:error", onError);
    if (GeoHeading.isRunning()) GeoHeading.stop();
    map.stopHeadingUp();
    map.setBearing(0);
    if (posMarker) {
      map.removeLayer(posMarker);
      map.removeLayer(accCircle);
      posMarker = accCircle = null;
    }
  }

  // --- przycisk toggle (gest dla zgody iOS) ---
  var btn;
  var GeoControl = L.Control.extend({
    options: { position: "bottomright" },
    onAdd: function () {
      var c = L.DomUtil.create("div", "leaflet-bar");
      btn = L.DomUtil.create("a", "geo-locate-btn", c);
      btn.href = "#";
      btn.title = "Moja lokalizacja / heading-up";
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 8a4 4 0 100 8 4 4 0 000-8zm9 3h-2.06A7 7 0 0013 5.06V3h-2v2.06A7 7 0 005.06 11H3v2h2.06A7 7 0 0011 18.94V21h2v-2.06A7 7 0 0018.94 13H21v-2zM12 17a5 5 0 110-10 5 5 0 010 10z"/></svg>';
      L.DomEvent.disableClickPropagation(c);
      L.DomEvent.on(btn, "click", function (ev) {
        L.DomEvent.stop(ev);
        active ? disable() : enable();
      });
      return c;
    },
  });

  map.addControl(new GeoControl());
})(window);
