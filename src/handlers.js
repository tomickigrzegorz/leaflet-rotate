import L from "leaflet";
import { DEG_TO_RAD, RAD_TO_DEG } from "./constants.js";

  // =====================================================================
  // 9. Touch Gestures Handler — pinch zoom + rotate (Google Maps style)
  //    - Rotation has a deadzone threshold (~10°) so pinch-zoom works
  //      without accidental rotation
  //    - Anchor point: the geographic point under the midpoint between
  //      fingers stays under that midpoint throughout the gesture
  // =====================================================================
  L.Map.TouchGestures = L.Handler.extend({
    _ROTATION_THRESHOLD: 30 * DEG_TO_RAD,
    _SCALE_THRESHOLD: 0.04,
    _SCALE_THRESHOLD_ROT: 0.12,
    _MOVE_THRESHOLD: 4,

    // --- Rotation inertia (momentum spin after release) ---
    _ROT_INERTIA: true,           // master switch for the test
    _ROT_DECAY: 0.0038,           // higher = stops faster (per ms)
    _ROT_MIN_VELOCITY: 0.004,     // deg/ms below which inertia stops
    _ROT_MAX_VELOCITY: 1.2,       // clamp deg/ms to avoid wild spins
    _ROT_VELOCITY_SMOOTH: 0.4,    // EMA weight for new velocity samples
    _ROT_STALE_MS: 80,            // ignore velocity if last move older than this

    addHooks: function () {
      L.DomEvent.on(
        this._map._container,
        "touchstart",
        this._onTouchStart,
        this,
      );
      L.DomEvent.on(this._map._container, "touchmove", this._onTouchMove, this);
      L.DomEvent.on(
        this._map._container,
        "touchend touchcancel",
        this._onTouchEnd,
        this,
      );
    },

    removeHooks: function () {
      L.DomEvent.off(
        this._map._container,
        "touchstart",
        this._onTouchStart,
        this,
      );
      L.DomEvent.off(
        this._map._container,
        "touchmove",
        this._onTouchMove,
        this,
      );
      L.DomEvent.off(
        this._map._container,
        "touchend touchcancel",
        this._onTouchEnd,
        this,
      );
    },

    _onTouchStart: function (e) {
      if (!e.touches || e.touches.length !== 2) {
        this._active = false;
        return;
      }
      var map = this._map;
      // Only set the flag when WE disable dragging here. A re-entrant touchstart
      // (finger added/jittered mid-gesture) finds dragging already disabled — do
      // NOT clear the flag, or touchend won't re-enable it and pan stays dead.
      if (map.dragging && map.dragging.enabled()) {
        this._draggingWasEnabled = true;
        map.dragging.disable();
      }
      if (map._stop) map._stop();
      this._stopRotateInertia();
      this._rotVelocity = 0;
      this._lastRotTime = 0;
      this._lastRotBearing = 0;
      // A two-finger gesture = manual control. Kill the heading-up easing loop
      // NOW (touchstart), before any gesture math. Otherwise its per-frame
      // setBearing races the pinch's _move loop → markers/tiles drift (only with
      // geolocation on). Previously stopped only past the 30° rotate threshold,
      // so a pure pinch-zoom left the loop running.
      map.stopHeadingUp();
      // Absorb any pan offset (mapPanePos -> 0) before the pinch so the anchor
      // math and _move don't double-apply it (otherwise content drifts).
      map._commitRotatePan();
      var p1 = map.mouseEventToContainerPoint(e.touches[0]);
      var p2 = map.mouseEventToContainerPoint(e.touches[1]);

      this._startDist = p1.distanceTo(p2);
      if (this._startDist < 1) {
        this._active = false;
        return;
      }

      this._touchZoomCenter = map.options.touchZoom === "center";
      this._centerPoint = map.getSize().divideBy(2);
      this._startCenter = map.getCenter();
      this._startMidpoint = this._touchZoomCenter
        ? this._centerPoint
        : p1.add(p2).divideBy(2);
      this._startAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      this._startBearing = map.getBearing();
      this._startBearingRad = map._bearingRad || 0;
      this._startZoom = map.getZoom();
      this._anchorLatLng = this._touchZoomCenter
        ? this._startCenter
        : map.containerPointToLatLng(this._startMidpoint);

      this._moved = false;
      this._active = true;
      this._rotationActive = false;
      this._scaleActive = false;
      this.zoom = false;

      L.DomEvent.preventDefault(e);
    },

    _onTouchMove: function (e) {
      if (!e.touches || e.touches.length !== 2 || !this._active) return;
      var map = this._map;
      var p1 = map.mouseEventToContainerPoint(e.touches[0]);
      var p2 = map.mouseEventToContainerPoint(e.touches[1]);
      var midpoint = this._touchZoomCenter
        ? this._centerPoint
        : p1.add(p2).divideBy(2);
      var dist = p1.distanceTo(p2);
      var angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      var midpointDelta = midpoint.distanceTo(this._startMidpoint);

      var scale = dist / this._startDist;
      var scaleDelta = Math.abs(scale - 1);

      var angleDelta = angle - this._startAngle;
      while (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
      while (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

      var rotationBeyond =
        map.options.touchRotate &&
        Math.abs(angleDelta) > this._ROTATION_THRESHOLD;
      var scaleBeyond =
        scaleDelta >
        (this._rotationActive
          ? this._SCALE_THRESHOLD_ROT
          : this._SCALE_THRESHOLD);
      var moveBeyond = midpointDelta > this._MOVE_THRESHOLD;

      if (!this._moved) {
        if (!rotationBeyond && !scaleBeyond && !moveBeyond) {
          L.DomEvent.preventDefault(e);
          return;
        }
        map._moveStart(true, false);
        this._moved = true;
      }

      // --- Zoom (with deadzone) ---
      var newZoom = this._startZoom;
      if (!this._scaleActive && scaleBeyond) {
        this._scaleActive = true;
      }
      if (this._scaleActive) {
        newZoom = map.getScaleZoom(scale, this._startZoom);
        if (
          !map.options.bounceAtZoomLimits &&
          ((newZoom < map.getMinZoom() && scale < 1) ||
            (newZoom > map.getMaxZoom() && scale > 1))
        ) {
          newZoom = Math.max(
            map.getMinZoom(),
            Math.min(map.getMaxZoom(), newZoom),
          );
        }
      }

      // --- Rotation (only after threshold exceeded) ---

      var newBearingRad = this._startBearingRad;
      if (map.options.touchRotate) {
        if (!this._rotationActive) {
          if (Math.abs(angleDelta) > this._ROTATION_THRESHOLD) {
            this._rotationActive = true;
            this._rotRefAngle = angle;
            map.stopHeadingUp();
            map.fire("rotatestart");
          }
        }
        if (this._rotationActive) {
          var rotDelta = angle - this._rotRefAngle;
          while (rotDelta > Math.PI) rotDelta -= 2 * Math.PI;
          while (rotDelta < -Math.PI) rotDelta += 2 * Math.PI;
          var dir = map.options.rotateClockwise === false ? -1 : 1;
          var newBearing = this._startBearing + dir * rotDelta * RAD_TO_DEG;
          newBearing = ((newBearing % 360) + 360) % 360;
          map.setBearing(newBearing);
          newBearingRad = map._bearingRad || 0;

          // Track angular velocity (deg/ms) for release inertia
          var now =
            (typeof performance !== "undefined" && performance.now
              ? performance.now()
              : Date.now());
          if (this._lastRotTime) {
            var dtRot = now - this._lastRotTime;
            if (dtRot > 0) {
              var db = newBearing - this._lastRotBearing;
              while (db > 180) db -= 360;
              while (db < -180) db += 360;
              var sample = db / dtRot;
              var w = this._ROT_VELOCITY_SMOOTH;
              this._rotVelocity =
                (1 - w) * (this._rotVelocity || 0) + w * sample;
            }
          }
          this._lastRotTime = now;
          this._lastRotBearing = newBearing;
        }
      }

      if (this._scaleActive) {
        // --- Anchor: keep geographic point under midpoint ---
        var viewHalf = map.getSize().divideBy(2);
        var screenOffset = midpoint.subtract(viewHalf);
        var pivotPixel = map.project(this._anchorLatLng, newZoom);
        var centerPixel = pivotPixel.subtract(
          screenOffset.rotate(-newBearingRad),
        );
        var newCenter = map.unproject(centerPixel, newZoom);

        this._center = newCenter;
        this._zoom = newZoom;
        this.zoom = true;

        if (this._animRequest) {
          L.Util.cancelAnimFrame(this._animRequest);
        }
        var moveFn = L.Util.bind(
          map._move,
          map,
          newCenter,
          newZoom,
          { pinch: true, round: false },
          undefined,
        );
        this._animRequest = L.Util.requestAnimFrame(moveFn, this, true);
      } else {
        this._center = this._startCenter;
        this._zoom = this._startZoom;
        this.zoom = false;
        if (this._animRequest) {
          L.Util.cancelAnimFrame(this._animRequest);
          this._animRequest = null;
        }
      }

      L.DomEvent.preventDefault(e);
    },

    _onTouchEnd: function (e) {
      var map = this._map;
      if (this._draggingWasEnabled && map.dragging) {
        map.dragging.enable();
        this._draggingWasEnabled = false;
      }
      if (!this._active) return;
      this._active = false;
      if (!this._moved) return;
      if (this._animRequest) {
        L.Util.cancelAnimFrame(this._animRequest);
        this._animRequest = null;
      }
      if (this.zoom) {
        if (map.options.zoomAnimation) {
          map._animateZoom(
            this._center,
            map._limitZoom(this._zoom),
            true,
            map.options.zoomSnap,
          );
        } else {
          map._resetView(this._center, map._limitZoom(this._zoom));
        }
      }
      if (this._rotationActive) {
        if (!this._startRotateInertia()) map.fire("rotate");
      }
      this.zoom = false;
    },

    _stopRotateInertia: function () {
      if (this._rotInertiaReq) {
        L.Util.cancelAnimFrame(this._rotInertiaReq);
        this._rotInertiaReq = null;
      }
    },

    _startRotateInertia: function () {
      var map = this._map;
      if (!this._ROT_INERTIA) return false;

      var now =
        (typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now());
      // Stale: finger held still before lifting → no fling
      if (
        !this._lastRotTime ||
        now - this._lastRotTime > this._ROT_STALE_MS ||
        Math.abs(this._rotVelocity || 0) < this._ROT_MIN_VELOCITY
      ) {
        return false;
      }

      var v = this._rotVelocity;
      var cap = this._ROT_MAX_VELOCITY;
      if (v > cap) v = cap;
      if (v < -cap) v = -cap;

      var decay = this._ROT_DECAY;
      var minV = this._ROT_MIN_VELOCITY;
      var last = now;
      var self = this;

      map.fire("rotatestart");
      var step = function () {
        var t =
          (typeof performance !== "undefined" && performance.now
            ? performance.now()
            : Date.now());
        var dt = t - last;
        last = t;
        if (dt <= 0) dt = 16;

        v *= Math.exp(-decay * dt);
        if (Math.abs(v) < minV) {
          self._rotInertiaReq = null;
          map.fire("rotate");
          return;
        }
        var b = map.getBearing() + v * dt;
        b = ((b % 360) + 360) % 360;
        map.setBearing(b);
        map.fire("rotate");
        self._rotInertiaReq = L.Util.requestAnimFrame(step, self);
      };
      this._rotInertiaReq = L.Util.requestAnimFrame(step, this);
      return true;
    },
  });

  L.Map.addInitHook("addHandler", "touchGestures", L.Map.TouchGestures);

  L.Map.addInitHook(function () {
    if (this.options.rotate && this.options.touchRotate) {
      if (this.touchGestures) this.touchGestures.enable();
      if (this.touchZoom) this.touchZoom.disable();
    }
  });

  // =====================================================================
  // 10. Shift+Wheel Handler — bearing via scroll
  // =====================================================================
  L.Map.ShiftKeyRotate = L.Handler.extend({
    _ROTATE_STEP: 5,
    _EASE: 0.2,

    addHooks: function () {
      L.DomEvent.on(this._map._container, "wheel", this._onWheel, this);
    },
    removeHooks: function () {
      L.DomEvent.off(this._map._container, "wheel", this._onWheel, this);
      this._stopAnim();
    },
    _onWheel: function (e) {
      if (!e.shiftKey) return;
      L.DomEvent.stop(e);
      var map = this._map;
      map.stopHeadingUp();
      if (!this._animating) map.fire("rotatestart");
      var delta = L.DomEvent.getWheelDelta(e);
      var dir = map.options.rotateClockwise === false ? -1 : 1;
      var next = map.getBearing() - dir * delta * this._ROTATE_STEP;
      this._targetBearing = ((next % 360) + 360) % 360;
      if (!this._animating) {
        this._mousePoint = map.mouseEventToContainerPoint(e);
        this._anchorLatLng = map.containerPointToLatLng(this._mousePoint);
        this._startAnim();
      }
    },

    _startAnim: function () {
      if (this._animating) return;
      this._animating = true;
      this._animRequest = L.Util.requestAnimFrame(this._animate, this, true);
    },

    _stopAnim: function () {
      if (this._animRequest) {
        L.Util.cancelAnimFrame(this._animRequest);
        this._animRequest = null;
      }
      this._animating = false;
      this._anchorLatLng = null;
      this._mousePoint = null;
    },

    _animate: function () {
      if (!this._animating) return;
      if (this._targetBearing === undefined || this._targetBearing === null) {
        this._stopAnim();
        return;
      }

      var map = this._map;
      var current = map.getBearing();
      var diff = this._targetBearing - current;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      if (Math.abs(diff) < 0.1) {
        map.setBearing(this._targetBearing);
        this._panToAnchor(map);
        this._stopAnim();
        return;
      }

      map.setBearing(current + diff * this._EASE);
      this._panToAnchor(map);
      this._animRequest = L.Util.requestAnimFrame(this._animate, this, true);
    },

    _panToAnchor: function (map) {
      if (!this._anchorLatLng || !this._mousePoint) return;
      var zoom = map.getZoom();
      var viewHalf = map.getSize().divideBy(2);
      var screenOffset = this._mousePoint.subtract(viewHalf);
      var pivotPixel = map.project(this._anchorLatLng, zoom);
      var centerPixel = pivotPixel.subtract(screenOffset.rotate(-map._bearingRad));
      var newCenter = map.unproject(centerPixel, zoom);
      map.setView(newCenter, zoom, { animate: false });
    },
  });

  L.Map.addInitHook("addHandler", "shiftKeyRotate", L.Map.ShiftKeyRotate);

  L.Map.addInitHook(function () {
    if (this.options.rotate && this.options.shiftKeyRotate) {
      if (this.shiftKeyRotate) this.shiftKeyRotate.enable();
    }
  });

  // Prevent standard scroll zoom when shift is held (to avoid zoom+rotate conflict)
  if (L.Map.ScrollWheelZoom) {
    var _scrollOnWheel = L.Map.ScrollWheelZoom.prototype._onWheelScroll;
    L.Map.ScrollWheelZoom.prototype._onWheelScroll = function (e) {
      if (
        e.shiftKey &&
        this._map &&
        this._map._rotate &&
        this._map.options.shiftKeyRotate
      )
        return;
      return _scrollOnWheel.call(this, e);
    };
  }

  // =====================================================================
  // 10b. DragRotate Handler — right mouse button drag (MapLibre style)
  //      Rotates the map around its center.
  // =====================================================================
  L.Map.DragRotate = L.Handler.extend({
    _SENSITIVITY: 0.5, // degrees per pixel of horizontal movement

    addHooks: function () {
      L.DomEvent.on(this._map._container, "mousedown", this._onDown, this);
      L.DomEvent.on(
        this._map._container,
        "contextmenu",
        L.DomEvent.preventDefault,
      );
    },
    removeHooks: function () {
      L.DomEvent.off(this._map._container, "mousedown", this._onDown, this);
      L.DomEvent.off(
        this._map._container,
        "contextmenu",
        L.DomEvent.preventDefault,
      );
      this._cleanup();
    },
    _onDown: function (e) {
      if (e.button !== 2) return;
      L.DomEvent.preventDefault(e);
      L.DomEvent.stopPropagation(e);
      var map = this._map;
      this._startX = e.clientX;
      this._startBearing = map.getBearing();
      this._moved = false;
      if (map.dragging && map.dragging.enabled()) {
        this._draggingWasEnabled = true;
        map.dragging.disable();
      } else {
        this._draggingWasEnabled = false;
      }
      L.DomEvent.on(document, "mousemove", this._onMove, this);
      L.DomEvent.on(document, "mouseup", this._onUp, this);
    },
    _onMove: function (e) {
      var dx = e.clientX - this._startX;
      if (!this._moved && Math.abs(dx) < 2) return;
      if (!this._moved) this._map.fire("rotatestart");
      this._moved = true;
      this._map.stopHeadingUp();
      var dir = this._map.options.rotateClockwise === false ? -1 : 1;
      this._map.setBearing(this._startBearing + dir * dx * this._SENSITIVITY);
    },
    _onUp: function (e) {
      this._cleanup();
      if (this._draggingWasEnabled && this._map.dragging) {
        this._map.dragging.enable();
      }
      if (this._moved) {
        L.DomEvent.preventDefault(e);
        this._map.fire("rotate");
      }
    },
    _cleanup: function () {
      L.DomEvent.off(document, "mousemove", this._onMove, this);
      L.DomEvent.off(document, "mouseup", this._onUp, this);
    },
  });

  L.Map.addInitHook("addHandler", "dragRotate", L.Map.DragRotate);

  L.Map.addInitHook(function () {
    if (this.options.rotate && this.options.dragRotate) {
      if (this.dragRotate) this.dragRotate.enable();
    }
  });

  // =====================================================================
  // 12. MarkerDrag fix — convert coords in rotated map
  // =====================================================================
  // Leaflet 1.9's MarkerDrag handler is an internal var, not exposed as
  // L.Handler.MarkerDrag, so patch its prototype lazily the first time a
  // marker builds its dragging handler (in _initInteraction).
  var _markerInitInteraction = L.Marker.prototype._initInteraction;
  L.Marker.prototype._initInteraction = function () {
    var result = _markerInitInteraction.call(this);
    if (this.dragging) {
      var proto = Object.getPrototypeOf(this.dragging);
      if (proto && proto._onDrag && !proto._rotateOnDragPatched) {
        proto._rotateOnDragPatched = true;
        var _markerDragOnDrag = proto._onDrag;
        proto._onDrag = function (e) {
          var marker = this._marker;
          var map = marker._map;

          if (map && map._rotate && map._bearing) {
            var iconPos = L.DomUtil.getPosition(marker._icon);
            var layerPos = map.mapPanePointToRotatedPoint(iconPos);
            var latlng = map.layerPointToLatLng(layerPos);

            if (marker._shadow) {
              L.DomUtil.setPosition(marker._shadow, iconPos);
            }

            marker._latlng = latlng;
            e.latlng = latlng;
            e.oldLatLng = this._oldLatLng;
            marker.fire("move", e).fire("drag", e);
            return;
          }

          return _markerDragOnDrag.call(this, e);
        };
      }
    }
    return result;
  };
