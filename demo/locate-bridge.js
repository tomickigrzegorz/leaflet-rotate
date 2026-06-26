// locate-bridge.js — alternative heading-up provider based on Leaflet.LocateControl.
// Instead of geo-heading.js + geo-map-bridge.js: LocateControl provides a marker,
// accuracy circle and compass, and we feed its heading into map.setHeading().
// Requires the global `map` and a loaded L.Control.Locate. Test file.

class LocateBridge {
  constructor(map, options = {}) {
    this.map = map;
    this.lastH = null;
    // We control rotation with our own flag (LocateControl's following state is
    // unreliable: a click while the dot is in view can be a no-op).
    this.paused = false;

    this.lc = L.control
      .locate({
        position: options.position || "bottomright",
        setView: "untilPanOrZoom",
        flyTo: false,
        keepCurrentZoomLevel: true,
        showCompass: true,
        drawCircle: true,
        strings: { title: "My location / heading-up" },
      })
      .addTo(map);

    this._wire();
  }

  _wire() {
    var self = this;
    var lc = this.lc;
    var map = this.map;

    // LocateControl doesn't emit heading — we hook into _setCompassHeading.
    var _origSet = lc._setCompassHeading;
    lc._setCompassHeading = function (h) {
      _origSet.call(this, h);
      var cur = this._compassHeading;
      if (!Number.isFinite(cur) || self.paused) {
        map.stopHeadingUp();
        self.lastH = null;
        return;
      }
      var dh =
        self.lastH == null
          ? 999
          : Math.abs(((cur - self.lastH + 540) % 360) - 180);
      if (dh >= 1.5) {
        self.lastH = cur;
        map.setHeading(cur);
      }
    };

    // user pan/zoom → freeze rotation
    map.on("dragstart zoomstart", function () {
      if (lc._active) self.paused = true;
    });

    // after pan commit the offset (mapPanePos->0), otherwise zoom while
    // rotated computes the marker/content from a wrong offset and drifts
    map.on("dragend", function () {
      if (map._bearing && map._commitRotatePan) map._commitRotatePan();
    });

    // button click → resume rotation (if still active)
    var _origClick = lc._onClick;
    lc._onClick = function () {
      _origClick.apply(this, arguments);
      self.paused = !this._active;
    };

    map.on("locatedeactivate", function () {
      self.paused = false;
      self.lastH = null;
      map.stopHeadingUp();
      map.setBearing(0);
    });
  }
}

// instance — requires the global `map` and a loaded L.Control.Locate
if (window.map && L.control && L.control.locate) {
  window.locateBridge = new LocateBridge(window.map);
}
