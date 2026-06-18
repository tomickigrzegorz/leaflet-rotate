// geo-heading.js — czujniki: pozycja (GPS) + kierunek (kompas).
// W pełni niezależny od mapy. Emituje na window:
//   CustomEvent('geo:update', { detail: { lat, lng, accuracy, heading, source } })
//   CustomEvent('geo:status', { detail: { sensors, permission } })
//   CustomEvent('geo:error',  { detail: { code, message } })
// Użycie: GeoHeading.start() (po geście użytkownika), GeoHeading.stop().
(function (global) {
  "use strict";

  var DEG = Math.PI / 180;
  var RAD = 180 / Math.PI;

  var state = {
    running: false,
    watchId: null,
    lat: null,
    lng: null,
    accuracy: null,
    heading: null, // wygładzony, stopnie 0..360 (0=N, zgodnie z zegarem)
    lastEmitHeading: null,
    source: null,
    // low-pass na wektorze kierunku (bez problemu z zawijaniem 359->0)
    sx: null,
    sy: null,
    k: 0.2,
    lastEmit: 0,
    minEmitMs: 16, // ~60 Hz
  };

  function emit(name, detail) {
    global.dispatchEvent(new CustomEvent(name, { detail: detail }));
  }

  function emitUpdate(force) {
    var now = Date.now();
    if (!force && now - state.lastEmit < state.minEmitMs) return;
    state.lastEmit = now;
    emit("geo:update", {
      lat: state.lat,
      lng: state.lng,
      accuracy: state.accuracy,
      heading: state.heading,
      source: state.source,
    });
  }

  // --- wygładzanie kierunku ---
  function pushHeading(deg) {
    if (deg == null || isNaN(deg)) return;
    var s = Math.sin(deg * DEG),
      c = Math.cos(deg * DEG);
    if (state.sx === null) {
      state.sx = s;
      state.sy = c;
    } else {
      state.sx += state.k * (s - state.sx);
      state.sy += state.k * (c - state.sy);
    }
    var h = Math.atan2(state.sx, state.sy) * RAD;
    state.heading = ((h % 360) + 360) % 360;
  }

  // --- kierunek ze zdarzenia deviceorientation ---
  function onOrientation(e) {
    var heading = null;
    if (typeof e.webkitCompassHeading === "number") {
      // iOS: już względem północy, zgodnie z zegarem
      heading = e.webkitCompassHeading;
      state.source = "compass";
    } else if (e.absolute === true && typeof e.alpha === "number") {
      // Android (deviceorientationabsolute): alpha rośnie przeciwnie do zegara
      var screenAngle =
        (global.screen.orientation && global.screen.orientation.angle) || 0;
      heading = (360 - e.alpha + screenAngle) % 360;
      state.source = "compass";
    } else if (typeof e.alpha === "number") {
      var sa =
        (global.screen.orientation && global.screen.orientation.angle) || 0;
      heading = (360 - e.alpha + sa) % 360;
      state.source = "compass";
    }
    if (heading != null) {
      pushHeading(((heading % 360) + 360) % 360);
      // emituj kompas tylko przy realnej zmianie kierunku (tłumi szum Androida,
      // każdy setHeading = repaint obróconej mapy)
      var prev = state.lastEmitHeading;
      var dh =
        prev == null
          ? 999
          : Math.abs(((state.heading - prev + 540) % 360) - 180);
      if (dh >= 1.5) {
        state.lastEmitHeading = state.heading;
        emitUpdate(false);
      }
    }
  }

  function onPosition(pos) {
    state.lat = pos.coords.latitude;
    state.lng = pos.coords.longitude;
    state.accuracy = pos.coords.accuracy;
    emitUpdate(true);
  }

  function onPositionError(err) {
    emit("geo:error", { code: err.code, message: err.message });
  }

  // --- nasłuch orientacji (iOS wymaga zgody po geście) ---
  function addOrientationListener() {
    var evName =
      "ondeviceorientationabsolute" in global
        ? "deviceorientationabsolute"
        : "deviceorientation";
    global.addEventListener(evName, onOrientation, false);
    state._orientEvName = evName;
  }

  function requestOrientationPermission() {
    var DOE = global.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      return DOE.requestPermission()
        .then(function (res) {
          if (res === "granted") {
            addOrientationListener();
            return true;
          }
          return false;
        })
        .catch(function () {
          return false;
        });
    }
    addOrientationListener();
    return Promise.resolve(true);
  }

  var GeoHeading = {
    start: function () {
      if (state.running) return Promise.resolve(true);
      state.running = true;

      if (!navigator.geolocation) {
        emit("geo:error", { code: -1, message: "Brak geolokalizacji" });
      } else {
        state.watchId = navigator.geolocation.watchPosition(
          onPosition,
          onPositionError,
          { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
        );
      }

      return requestOrientationPermission().then(function (orientationOk) {
        emit("geo:status", {
          sensors: { geolocation: !!navigator.geolocation, orientation: orientationOk },
          permission: orientationOk ? "granted" : "denied",
        });
        return orientationOk;
      });
    },

    stop: function () {
      state.running = false;
      if (state.watchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(state.watchId);
        state.watchId = null;
      }
      if (state._orientEvName) {
        global.removeEventListener(state._orientEvName, onOrientation, false);
        state._orientEvName = null;
      }
      state.sx = state.sy = null;
      state.heading = null;
    },

    isRunning: function () {
      return state.running;
    },
  };

  global.GeoHeading = GeoHeading;
})(window);
