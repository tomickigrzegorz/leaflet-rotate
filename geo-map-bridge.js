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
    ".geo-dot{position:absolute;left:-10px;top:-10px;width:20px;height:20px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.4)}",
    // stożek (latarka) wskazuje GÓRĘ ekranu (mapa obraca się heading-up):
    // wierzchołek przy kropce (dół), rozszerza się ku górze, mocniejszy przy kropce
    ".geo-cone{position:absolute;left:-55px;top:-56px;width:110px;height:56px;",
    "background:linear-gradient(to top, rgba(26,115,232,.65), rgba(26,115,232,.18) 55%, rgba(26,115,232,0));",
    "-webkit-clip-path:polygon(43% 100%, 57% 100%, 82% 0, 18% 0);clip-path:polygon(43% 100%, 57% 100%, 82% 0, 18% 0)}",
    ".geo-locate-btn{background:#fff;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer}",
    ".geo-locate-btn.active{color:#1a73e8}",
    ".geo-locate-btn.paused{color:#9aa0a6}",
    ".geo-locate-btn svg{display:block}",
  ].join("");
  document.head.appendChild(css);

  var posMarker = null;
  var accCircle = null;
  var active = false;
  var following = false;
  var lastLat = null;
  var lastLng = null;

  var posIcon = L.divIcon({
    className: "",
    html: '<div class="geo-pos"><div class="geo-cone"></div><div class="geo-dot"></div></div>',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  function onUpdate(e) {
    if (!active) return;
    var d = e.detail;
    if (following && d.heading != null) map.setHeading(d.heading);

    if (d.lat == null) return;
    var ll = [d.lat, d.lng];
    var moved = d.lat !== lastLat || d.lng !== lastLng;

    if (!posMarker) {
      accCircle = L.circle(ll, {
        radius: d.accuracy || 0,
        color: "#1a73e8",
        weight: 1,
        fillColor: "#1a73e8",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map);
      posMarker = L.marker(ll, {
        icon: posIcon,
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(map);
    } else if (moved) {
      posMarker.setLatLng(ll);
      accCircle.setLatLng(ll).setRadius(d.accuracy || 0);
    }

    lastLat = d.lat;
    lastLng = d.lng;

    // recenter tylko gdy pozycja realnie się zmieniła (nie co klatkę kompasu)
    if (following && moved) map.panTo(ll, { animate: false });
  }

  function onUserMove() {
    if (active && following) {
      following = false;
      updateBtn();
      map.stopHeadingUp();
    }
  }

  function recenter() {
    following = true;
    updateBtn();
    if (posMarker) map.panTo(posMarker.getLatLng(), { animate: false });
  }

  function updateBtn() {
    btn.classList.toggle("active", active && following);
    btn.classList.toggle("paused", active && !following);
  }

  function onError(e) {
    console.warn("geo:error", e.detail);
  }

  function enable() {
    if (active) return;
    active = true;
    following = true;
    updateBtn();
    global.addEventListener("geo:update", onUpdate);
    global.addEventListener("geo:error", onError);
    map.on("dragstart", onUserMove);
    GeoHeading.start();
  }

  function disable() {
    active = false;
    following = false;
    updateBtn();
    global.removeEventListener("geo:update", onUpdate);
    global.removeEventListener("geo:error", onError);
    map.off("dragstart", onUserMove);
    if (GeoHeading.isRunning()) GeoHeading.stop();
    map.stopHeadingUp();
    map.setBearing(0);
    if (posMarker) {
      map.removeLayer(posMarker);
      map.removeLayer(accCircle);
      posMarker = accCircle = null;
    }
    lastLat = lastLng = null;
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
        if (!active) enable();
        else if (!following) recenter();
        else disable();
      });
      return c;
    },
  });

  map.addControl(new GeoControl());
})(window);
