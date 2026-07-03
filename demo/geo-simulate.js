// geo-simulate.js — desktop walk simulator. Drop-in replacement for
// geo-heading.js: same API (start/stop/isRunning) and the same
// CustomEvent('geo:update') payloads, so geo-map-bridge and geo-debug
// work unchanged. Mimics real sensors: GPS position steps discretely
// (every gpsIntervalMs, with optional noise) while compass heading
// streams smoothly (~10 Hz, with jitter) — the exact combination that
// exposes rotation/flicker bugs while walking heading-up.
//
// Console usage:
//   GeoSim.use()                      // swap into geoBridge and walk the default loop
//   GeoSim.use({ speed: 3 })          // faster walk (m/s)
//   GeoSim.use({ route: [[lat,lng], ...], loop: false })
//   GeoSim.setSpeed(6); GeoSim.pause(); GeoSim.resume();
//   GeoSim.restore()                  // stop and hand geoBridge back to real sensors
//
// Or click the "Sim walk" button (bottom-left).
(function () {
  "use strict";

  var DEG = Math.PI / 180;
  var RAD = 180 / Math.PI;
  var M_PER_DEG_LAT = 111320;

  // Loop around the demo center (Warsaw) with varied turn angles.
  var DEFAULT_ROUTE = [
    [52.23317, 20.93445],
    [52.2359, 20.9347],
    [52.2361, 20.9384],
    [52.2348, 20.93985],
    [52.233, 20.939],
    [52.23255, 20.93555],
  ];

  var DEFAULTS = {
    route: DEFAULT_ROUTE,
    loop: true,
    speed: 1.4, // m/s (walking pace)
    gpsIntervalMs: 1000, // how often the emitted lat/lng jumps (GPS fix rate)
    headingIntervalMs: 100, // compass emit rate
    jitterDeg: 2, // random compass noise (peak, degrees)
    gpsNoiseM: 0, // random GPS offset per fix (meters)
    accuracy: 10, // reported accuracy (meters)
    smoothK: 0.3, // heading low-pass (same idea as geo-heading.js)
  };

  function courseDeg(a, b) {
    var dLat = b[0] - a[0];
    var dLng = (b[1] - a[1]) * Math.cos(((a[0] + b[0]) / 2) * DEG);
    return (Math.atan2(dLng, dLat) * RAD + 360) % 360;
  }

  function segmentMeters(a, b) {
    var dLat = (b[0] - a[0]) * M_PER_DEG_LAT;
    var dLng =
      (b[1] - a[1]) * M_PER_DEG_LAT * Math.cos(((a[0] + b[0]) / 2) * DEG);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  function GeoSimSensor() {
    this.running = false;
    this.paused = false;
    this.opts = Object.assign({}, DEFAULTS);
    this._origGeo = null;
    this._timer = null;
    this._reset();
  }

  GeoSimSensor.prototype._reset = function () {
    this._seg = 0;
    this._distOnSeg = 0;
    this._lastTick = 0;
    this._lastFixTime = 0;
    this._fixLat = null;
    this._fixLng = null;
    this._sx = null;
    this._sy = null;
    this.heading = null;
  };

  GeoSimSensor.prototype.configure = function (opts) {
    Object.assign(this.opts, opts || {});
    return this;
  };

  GeoSimSensor.prototype._emit = function (name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail }));
  };

  // Current interpolated position along the route (true position, no noise)
  GeoSimSensor.prototype._position = function () {
    var route = this.opts.route;
    var a = route[this._seg];
    var b = route[(this._seg + 1) % route.length];
    var len = segmentMeters(a, b);
    var t = len > 0 ? this._distOnSeg / len : 1;
    return {
      lat: a[0] + (b[0] - a[0]) * t,
      lng: a[1] + (b[1] - a[1]) * t,
      course: courseDeg(a, b),
    };
  };

  GeoSimSensor.prototype._advance = function (meters) {
    var route = this.opts.route;
    this._distOnSeg += meters;
    for (;;) {
      var a = route[this._seg];
      var b = route[(this._seg + 1) % route.length];
      var len = segmentMeters(a, b);
      if (this._distOnSeg < len) return true;
      this._distOnSeg -= len;
      this._seg++;
      var lastSeg = this.opts.loop ? route.length - 1 : route.length - 2;
      if (this._seg > lastSeg) {
        if (this.opts.loop) {
          this._seg = 0;
        } else {
          this._seg = lastSeg;
          this._distOnSeg = segmentMeters(
            route[this._seg],
            route[(this._seg + 1) % route.length],
          );
          return false; // route finished
        }
      }
    }
  };

  GeoSimSensor.prototype._pushHeading = function (deg) {
    var s = Math.sin(deg * DEG);
    var c = Math.cos(deg * DEG);
    if (this._sx === null) {
      this._sx = s;
      this._sy = c;
    } else {
      this._sx += this.opts.smoothK * (s - this._sx);
      this._sy += this.opts.smoothK * (c - this._sy);
    }
    var h = Math.atan2(this._sx, this._sy) * RAD;
    this.heading = ((h % 360) + 360) % 360;
  };

  GeoSimSensor.prototype._tick = function () {
    var now = Date.now();
    var dt = this._lastTick ? now - this._lastTick : 0;
    this._lastTick = now;
    if (this.paused) return;

    var alive = this._advance((this.opts.speed * dt) / 1000);
    var pos = this._position();

    var jitter = (Math.random() * 2 - 1) * this.opts.jitterDeg;
    this._pushHeading(pos.course + jitter);

    // GPS fix: the emitted lat/lng only jumps at gpsIntervalMs, like a
    // real receiver — this discrete step is what shakes out pan/rotate bugs
    if (!this._lastFixTime || now - this._lastFixTime >= this.opts.gpsIntervalMs) {
      this._lastFixTime = now;
      var noise = this.opts.gpsNoiseM;
      var nLat = noise ? ((Math.random() * 2 - 1) * noise) / M_PER_DEG_LAT : 0;
      var nLng = noise
        ? ((Math.random() * 2 - 1) * noise) /
          (M_PER_DEG_LAT * Math.cos(pos.lat * DEG))
        : 0;
      this._fixLat = pos.lat + nLat;
      this._fixLng = pos.lng + nLng;
    }

    this._emit("geo:update", {
      lat: this._fixLat,
      lng: this._fixLng,
      accuracy: this.opts.accuracy,
      heading: this.heading,
      source: "sim",
    });

    if (!alive) this.stop();
  };

  // --- GeoHeading-compatible API (used by geo-map-bridge) ---
  GeoSimSensor.prototype.start = function () {
    if (this.running) return Promise.resolve(true);
    this.running = true;
    this.paused = false;
    this._reset();
    var self = this;
    this._timer = setInterval(function () {
      self._tick();
    }, this.opts.headingIntervalMs);
    this._emit("geo:status", {
      sensors: { geolocation: true, orientation: true },
      permission: "granted",
    });
    this._updateBtn();
    return Promise.resolve(true);
  };

  GeoSimSensor.prototype.stop = function () {
    this.running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._updateBtn();
  };

  GeoSimSensor.prototype.isRunning = function () {
    return this.running;
  };

  // --- convenience API ---
  GeoSimSensor.prototype.use = function (opts) {
    if (opts) this.configure(opts);
    var bridge = window.geoBridge;
    if (bridge) {
      if (bridge.active) bridge.disable();
      if (!this._origGeo) this._origGeo = bridge.geo;
      bridge.geo = this;
      bridge.enable(); // calls this.start()
    } else {
      this.start();
    }
    return this;
  };

  GeoSimSensor.prototype.restore = function () {
    this.stop();
    var bridge = window.geoBridge;
    if (bridge && this._origGeo) {
      if (bridge.active) bridge.disable();
      bridge.geo = this._origGeo;
      this._origGeo = null;
    }
    return this;
  };

  GeoSimSensor.prototype.pause = function () {
    this.paused = true;
    return this;
  };

  GeoSimSensor.prototype.resume = function () {
    this.paused = false;
    return this;
  };

  GeoSimSensor.prototype.setSpeed = function (mps) {
    this.opts.speed = mps;
    return this;
  };

  // --- toggle button (bottom-left) ---
  GeoSimSensor.prototype._updateBtn = function () {
    if (this._btn) {
      this._btn.textContent = this.running ? "Stop sim" : "Sim walk";
      this._btn.classList.toggle("running", this.running);
    }
  };

  GeoSimSensor.prototype._addButton = function () {
    var css = document.createElement("style");
    css.textContent = [
      "#geo-sim-btn{position:absolute;bottom:20px;left:10px;z-index:1000;",
      "font:12px/1 monospace;padding:6px 10px;cursor:pointer;",
      "border:1px solid #888;border-radius:4px;background:#f4f4f4}",
      "#geo-sim-btn.running{background:#1a73e8;color:#fff;border-color:#1a73e8}",
    ].join("");
    document.head.appendChild(css);

    var btn = document.createElement("button");
    btn.id = "geo-sim-btn";
    btn.textContent = "Sim walk";
    var self = this;
    btn.addEventListener("click", function () {
      if (self.running) self.restore();
      else self.use();
    });
    (document.getElementById("map") || document.body).appendChild(btn);
    this._btn = btn;
  };

  window.GeoSim = new GeoSimSensor();
  window.GeoSim._addButton();
})();
