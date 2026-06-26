// geo-heading.js — sensors: position (GPS) + direction (compass).
// Fully independent of the map. Emits on window:
//   CustomEvent('geo:update', { detail: { lat, lng, accuracy, heading, source } })
//   CustomEvent('geo:status', { detail: { sensors, permission } })
//   CustomEvent('geo:error',  { detail: { code, message } })
// Usage: GeoHeading.start() (after a user gesture), GeoHeading.stop().

class GeoHeadingSensor {
  static DEG = Math.PI / 180;
  static RAD = 180 / Math.PI;

  constructor() {
    this.running = false;
    this.watchId = null;
    this.lat = null;
    this.lng = null;
    this.accuracy = null;
    this.heading = null; // smoothed, degrees 0..360 (0=N, clockwise)
    this.lastEmitHeading = null;
    this.source = null;
    // low-pass on the direction vector (avoids the 359->0 wrap-around issue)
    this.sx = null;
    this.sy = null;
    this.k = 0.2;
    this.lastEmit = 0;
    this.minEmitMs = 16; // ~60 Hz
    this._orientEvName = null;

    // bind — so removeEventListener hits the same reference
    this._onOrientation = this._onOrientation.bind(this);
    this._onPosition = this._onPosition.bind(this);
    this._onPositionError = this._onPositionError.bind(this);
  }

  emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  _emitUpdate(force) {
    const now = Date.now();
    if (!force && now - this.lastEmit < this.minEmitMs) return;
    this.lastEmit = now;
    this.emit("geo:update", {
      lat: this.lat,
      lng: this.lng,
      accuracy: this.accuracy,
      heading: this.heading,
      source: this.source,
    });
  }

  // --- direction smoothing ---
  _pushHeading(deg) {
    if (deg == null || isNaN(deg)) return;
    const s = Math.sin(deg * GeoHeadingSensor.DEG);
    const c = Math.cos(deg * GeoHeadingSensor.DEG);
    if (this.sx === null) {
      this.sx = s;
      this.sy = c;
    } else {
      this.sx += this.k * (s - this.sx);
      this.sy += this.k * (c - this.sy);
    }
    const h = Math.atan2(this.sx, this.sy) * GeoHeadingSensor.RAD;
    this.heading = ((h % 360) + 360) % 360;
  }

  // --- direction from the deviceorientation event ---
  _onOrientation(e) {
    let heading = null;
    if (typeof e.webkitCompassHeading === "number") {
      // iOS: already relative to north, clockwise
      heading = e.webkitCompassHeading;
      this.source = "compass";
    } else if (e.absolute === true && typeof e.alpha === "number") {
      // Android (deviceorientationabsolute): alpha increases counter-clockwise
      const screenAngle =
        (window.screen.orientation && window.screen.orientation.angle) || 0;
      heading = (360 - e.alpha + screenAngle) % 360;
      this.source = "compass";
    } else if (typeof e.alpha === "number") {
      const sa =
        (window.screen.orientation && window.screen.orientation.angle) || 0;
      heading = (360 - e.alpha + sa) % 360;
      this.source = "compass";
    }
    if (heading != null) {
      this._pushHeading(((heading % 360) + 360) % 360);
      // emit compass only on a real direction change (suppresses Android noise,
      // every setHeading = repaint of the rotated map)
      const prev = this.lastEmitHeading;
      const dh =
        prev == null
          ? 999
          : Math.abs(((this.heading - prev + 540) % 360) - 180);
      if (dh >= 1.5) {
        this.lastEmitHeading = this.heading;
        this._emitUpdate(false);
      }
    }
  }

  _onPosition(pos) {
    this.lat = pos.coords.latitude;
    this.lng = pos.coords.longitude;
    this.accuracy = pos.coords.accuracy;
    this._emitUpdate(true);
  }

  _onPositionError(err) {
    this.emit("geo:error", { code: err.code, message: err.message });
  }

  // --- orientation listener (iOS requires permission after a gesture) ---
  _addOrientationListener() {
    const evName =
      "ondeviceorientationabsolute" in window
        ? "deviceorientationabsolute"
        : "deviceorientation";
    window.addEventListener(evName, this._onOrientation, false);
    this._orientEvName = evName;
  }

  _requestOrientationPermission() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      return DOE.requestPermission()
        .then((res) => {
          if (res === "granted") {
            this._addOrientationListener();
            return true;
          }
          return false;
        })
        .catch(() => false);
    }
    this._addOrientationListener();
    return Promise.resolve(true);
  }

  start() {
    if (this.running) return Promise.resolve(true);
    this.running = true;

    if (!navigator.geolocation) {
      this.emit("geo:error", { code: -1, message: "No geolocation" });
    } else {
      this.watchId = navigator.geolocation.watchPosition(
        this._onPosition,
        this._onPositionError,
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
      );
    }

    return this._requestOrientationPermission().then((orientationOk) => {
      this.emit("geo:status", {
        sensors: {
          geolocation: !!navigator.geolocation,
          orientation: orientationOk,
        },
        permission: orientationOk ? "granted" : "denied",
      });
      return orientationOk;
    });
  }

  stop() {
    this.running = false;
    if (this.watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this._orientEvName) {
      window.removeEventListener(this._orientEvName, this._onOrientation, false);
      this._orientEvName = null;
    }
    this.sx = this.sy = null;
    this.heading = null;
  }

  isRunning() {
    return this.running;
  }
}

// singleton — compatible with the existing API (GeoHeading.start() etc.)
window.GeoHeading = new GeoHeadingSensor();
