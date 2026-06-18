(function (L) {
  "use strict";

  if (!L)
    throw new Error("Leaflet must be loaded before leaflet-rotate-custom.js");

  var DEG_TO_RAD = Math.PI / 180;
  var RAD_TO_DEG = 180 / Math.PI;

  // =====================================================================
  // 1. L.Point — rotation helpers
  // =====================================================================
  L.Point.prototype.rotate = function (theta) {
    var cos = Math.cos(theta),
      sin = Math.sin(theta);
    return new L.Point(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos,
    );
  };

  L.Point.prototype.rotateFrom = function (theta, pivot) {
    if (!pivot) return this.rotate(theta);
    return this.subtract(pivot).rotate(theta).add(pivot);
  };

  // =====================================================================
  // 2. L.DomUtil — extended setTransform / setPosition
  // =====================================================================
  L.DomUtil.setTransform = function (el, offset, scale, bearing, pivot) {
    var pos = offset || new L.Point(0, 0);
    var transform = "translate3d(" + pos.x + "px," + pos.y + "px,0)";
    if (scale !== undefined && scale !== null) {
      transform += " scale(" + scale + ")";
    }
    if (bearing) {
      transform += " rotate(" + bearing + "rad)";
    }
    el.style[L.DomUtil.TRANSFORM] = transform;
    if (pivot) {
      el.style[L.DomUtil.TRANSFORM + "Origin"] =
        pivot.x + "px " + pivot.y + "px";
    }
  };

  L.DomUtil.setPosition = function (el, point, bearing, pivot) {
    el._leaflet_pos = point;
    if (L.Browser.any3d) {
      L.DomUtil.setTransform(el, point, undefined, bearing, pivot);
    } else {
      el.style.left = point.x + "px";
      el.style.top = point.y + "px";
    }
  };

  // =====================================================================
  // 3. L.Map — core rotation
  // =====================================================================
  var _mapProto = L.Map.prototype;

  L.Map.mergeOptions({
    rotate: false,
    bearing: 0,
    touchRotate: false,
    shiftKeyRotate: false,
    dragRotate: true,
    rotateControl: false,
  });

  var _mapInitialize = _mapProto.initialize;
  _mapProto.initialize = function (id, options) {
    if (options && options.rotate) {
      this._rotate = true;
      this._bearing = 0;
      this._bearingRad = 0;
    }
    _mapInitialize.call(this, id, options);
    if (this._rotate) {
      this.setBearing(options.bearing || 0);
    }
  };

  // --- Pane hierarchy ---
  var _initPanes = _mapProto._initPanes;
  _mapProto._initPanes = function () {
    _initPanes.call(this);
    if (!this._rotate) return;

    var mapPane = this._mapPane;
    this._rotatePane = L.DomUtil.create("div", "leaflet-rotate-pane", mapPane);
    this._norotatePane = L.DomUtil.create(
      "div",
      "leaflet-norotate-pane",
      mapPane,
    );

    this._rotatePane.appendChild(this._panes.tilePane);
    this._rotatePane.appendChild(this._panes.overlayPane);

    this._norotatePane.appendChild(this._panes.shadowPane);
    this._norotatePane.appendChild(this._panes.markerPane);
    this._norotatePane.appendChild(this._panes.tooltipPane);
    this._norotatePane.appendChild(this._panes.popupPane);

    L.DomUtil.addClass(this._rotatePane, "leaflet-proxy leaflet-zoom-animated");
  };

  // --- setBearing / getBearing ---
  _mapProto.setBearing = function (theta) {
    if (!this._rotate) return;
    this._commitRotatePan();
    var bearing = ((theta % 360) + 360) % 360;
    this._bearing = bearing;
    this._bearingRad = bearing * DEG_TO_RAD;
    this._updateRotatePaneTransform();
    this.fire("rotate");
  };

  _mapProto.getBearing = function () {
    return this._bearing || 0;
  };

  _mapProto._updateRotatePaneTransform = function () {
    if (!this._rotatePane) return;
    if (!this._bearing) {
      this._rotatePane.style[L.DomUtil.TRANSFORM] = "";
      this._rotatePane.style[L.DomUtil.TRANSFORM + "Origin"] = "";
      return;
    }
    var size = this.getSize();
    var viewHalf = size.divideBy(2);
    this._rotatePane.style[L.DomUtil.TRANSFORM + "Origin"] =
      viewHalf.x + "px " + viewHalf.y + "px";
    this._rotatePane.style[L.DomUtil.TRANSFORM] =
      "rotate(" + this._bearingRad + "rad)";
  };

  // After a pan, reproject so the map pane position returns to (0,0).
  // Keeps the rotation pivot (transform-origin) at the viewport center.
  _mapProto._commitRotatePan = function () {
    if (!this._rotate || this._committingRotatePan) return;
    var pos = this._getMapPanePos();
    if (!pos || (pos.x === 0 && pos.y === 0)) return;
    this._committingRotatePan = true;
    this._resetView(this.getCenter(), this.getZoom(), true);
    this._committingRotatePan = false;
  };

  // --- Coordinate transforms ---
  // CSS rotation on rotatePane rotates around viewHalf (center of viewport).
  // A layer point lp in rotatePane appears on screen at:
  //   containerPoint = (lp - viewHalf).rotate(bearing) + viewHalf + mapPanePos
  // Inverse:
  //   layerPoint = (cp - mapPanePos - viewHalf).rotate(-bearing) + viewHalf

  var _containerPointToLayerPoint = _mapProto.containerPointToLayerPoint;
  _mapProto.containerPointToLayerPoint = function (point) {
    if (!this._rotate || !this._bearing) {
      return _containerPointToLayerPoint.call(this, point);
    }
    var cp = L.point(point);
    var mapPanePos = this._getMapPanePos();
    var viewHalf = this.getSize().divideBy(2);
    return cp
      .subtract(mapPanePos)
      .subtract(viewHalf)
      .rotate(-this._bearingRad)
      .add(viewHalf);
  };

  var _layerPointToContainerPoint = _mapProto.layerPointToContainerPoint;
  _mapProto.layerPointToContainerPoint = function (point) {
    if (!this._rotate || !this._bearing) {
      return _layerPointToContainerPoint.call(this, point);
    }
    var lp = L.point(point);
    var mapPanePos = this._getMapPanePos();
    var viewHalf = this.getSize().divideBy(2);
    return lp
      .subtract(viewHalf)
      .rotate(this._bearingRad)
      .add(viewHalf)
      .add(mapPanePos);
  };

  // --- rotatedPointToMapPanePoint ---
  // Converts a layer point (rotatePane coords) to norotatePane coords.
  // Marker is in norotatePane, so its position = lp.rotateFrom(bearing, viewHalf)
  _mapProto.rotatedPointToMapPanePoint = function (point) {
    if (!this._bearing) return L.point(point);
    var viewHalf = this.getSize().divideBy(2);
    return L.point(point).rotateFrom(this._bearingRad, viewHalf);
  };

  _mapProto.mapPanePointToRotatedPoint = function (point) {
    if (!this._bearing) return L.point(point);
    var viewHalf = this.getSize().divideBy(2);
    return L.point(point).rotateFrom(-this._bearingRad, viewHalf);
  };

  // --- _getCenterOffset ---
  // Returns screen-space offset for panBy to work correctly with rotation.
  var _getCenterOffset = _mapProto._getCenterOffset;
  _mapProto._getCenterOffset = function (latlng) {
    if (!this._rotate || !this._bearing) {
      return _getCenterOffset.call(this, latlng);
    }
    var dp = this.project(latlng).subtract(this.project(this.getCenter()));
    return dp.rotate(this._bearingRad);
  };

  // --- getBounds with 4 corners ---
  var _getBounds = _mapProto.getBounds;
  _mapProto.getBounds = function () {
    if (!this._rotate || !this._bearing) {
      return _getBounds.call(this);
    }
    var size = this.getSize();
    var bounds = L.latLngBounds();
    bounds.extend(this.containerPointToLatLng(L.point(0, 0)));
    bounds.extend(this.containerPointToLatLng(L.point(size.x, 0)));
    bounds.extend(this.containerPointToLatLng(L.point(size.x, size.y)));
    bounds.extend(this.containerPointToLatLng(L.point(0, size.y)));
    return bounds;
  };

  _mapProto.mapBoundsToContainerBounds = function (bounds) {
    return L.bounds([
      this.latLngToContainerPoint(bounds.getNorthWest()),
      this.latLngToContainerPoint(bounds.getNorthEast()),
      this.latLngToContainerPoint(bounds.getSouthEast()),
      this.latLngToContainerPoint(bounds.getSouthWest()),
    ]);
  };

  var _getBoundsZoom = _mapProto.getBoundsZoom;
  _mapProto.getBoundsZoom = function (bounds, inside, padding) {
    if (!this._rotate || !this._bearing) {
      return _getBoundsZoom.call(this, bounds, inside, padding);
    }
    bounds = L.latLngBounds(bounds);
    padding = L.point(padding || [0, 0]);
    var zoom = this.getZoom() || 0;
    var min = this.getMinZoom();
    var max = this.getMaxZoom();
    var size = this.getSize().subtract(padding);
    if (size.x <= 0 || size.y <= 0) return zoom;
    var containerBounds = this.mapBoundsToContainerBounds(bounds);
    var boundsSize = containerBounds.getSize();
    var snap = this.options.zoomSnap;
    var scaleX = size.x / boundsSize.x;
    var scaleY = size.y / boundsSize.y;
    var scale = inside ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    zoom = this.getScaleZoom(scale, zoom);
    if (snap) zoom = Math.round(zoom / snap) * snap;
    return Math.max(min, Math.min(max, zoom));
  };

  // --- _animateZoomNoDelay (PR#61 fix) ---
  _mapProto._animateZoomNoDelay = function (center, zoom, startAnim) {
    if (!this._mapPane) return;
    if (startAnim) {
      this._animatingZoom = true;
      this._animateToCenter = center;
      this._animateToZoom = zoom;
    }
    this._move(this._animateToCenter, this._animateToZoom, undefined, true);
    this._onZoomTransitionEnd();
  };

  // --- Smooth (animated) zoom while rotated ---
  // The animated zoom path is rotation-correct (rotation-aware _getCenterOffset,
  // renderer _updateTransform, marker/popup _animateZoom) as long as the map
  // pane offset is zero. A leftover pan offset gave a wrong center + gray tiles,
  // so commit the pan (reproject to mapPanePos = 0, visually identical) before
  // animating, then let the standard animation run.
  var _tryAnimatedZoom = _mapProto._tryAnimatedZoom;
  _mapProto._tryAnimatedZoom = function (center, zoom, options) {
    if (this._rotate && this._bearing && !this._animatingZoom) {
      var pos = this._getMapPanePos();
      if (pos && (pos.x || pos.y)) {
        this._resetView(this.getCenter(), this.getZoom(), true);
      }
    }
    return _tryAnimatedZoom.call(this, center, zoom, options);
  };

  // --- Resize handler: update transform-origin ---
  L.Map.addInitHook(function () {
    if (this._rotate) {
      this.on("resize", this._updateRotatePaneTransform, this);
    }
  });

  // =====================================================================
  // 4. L.GridLayer — tile loading with rotation
  // =====================================================================
  var _gridGetEvents = L.GridLayer.prototype.getEvents;
  L.GridLayer.prototype.getEvents = function () {
    var events = _gridGetEvents.call(this);
    if (this._map && this._map._rotate) {
      events.rotate = this._onRotate;
    }
    return events;
  };

  L.GridLayer.prototype._onRotate = function () {
    this._update();
  };

  var _getTiledPixelBounds = L.GridLayer.prototype._getTiledPixelBounds;
  L.GridLayer.prototype._getTiledPixelBounds = function (center) {
    if (!this._map._rotate || !this._map._bearing) {
      return _getTiledPixelBounds.call(this, center);
    }
    var map = this._map;
    var mapZoom = map._animatingZoom
      ? Math.max(map._animateToZoom, map.getZoom())
      : map.getZoom();
    var scale = map.getZoomScale(mapZoom, this._tileZoom);
    var pixelCenter = map.project(center, this._tileZoom).floor();
    // Clamp scale to <=1 so zoom-out still loads the full (larger) target
    // view; otherwise fast wheel zoom-out left gray gaps.
    var halfSize = map.getSize().divideBy(Math.min(scale, 1) * 2);

    var bounds = new L.Bounds();
    var corners = [
      L.point(-halfSize.x, -halfSize.y),
      L.point(halfSize.x, -halfSize.y),
      L.point(halfSize.x, halfSize.y),
      L.point(-halfSize.x, halfSize.y),
    ];
    for (var i = 0; i < 4; i++) {
      bounds.extend(pixelCenter.add(corners[i].rotate(-map._bearingRad)));
    }
    return bounds;
  };

  // =====================================================================
  // 5. L.Renderer (Canvas + SVG) — rotation support
  // =====================================================================
  var _rendererOnAdd = L.Renderer.prototype.onAdd;
  L.Renderer.prototype.onAdd = function (map) {
    _rendererOnAdd.call(this, map);
    if (map._rotate) {
      L.DomUtil.addClass(this._container, "leaflet-zoom-animated");
      this.options.padding = Math.max(this.options.padding || 0, 1.5);
    }
  };

  var _rendererUpdateTransform = L.Renderer.prototype._updateTransform;
  L.Renderer.prototype._updateTransform = function (center, zoom) {
    if (!this._map || !this._map._rotate) {
      return _rendererUpdateTransform.call(this, center, zoom);
    }
    if (!this._bounds || !this._boundsMinLatLng) return;
    var map = this._map;
    var scale = map.getZoomScale(zoom, this._zoom);
    var offset = map._latLngToNewLayerPoint(this._boundsMinLatLng, zoom, center);
    L.DomUtil.setTransform(this._container, offset, scale);
  };

  var _rendererUpdate = L.Renderer.prototype._update;
  L.Renderer.prototype._update = function () {
    if (!this._map || !this._map._rotate) {
      return _rendererUpdate.call(this);
    }

    // Rotation-invariant bounds: a square centered on the view whose radius
    // covers the padded viewport at ANY bearing. Independent of bearing, so
    // the SVG isn't re-sized every rotation frame (avoids flicker) and is
    // large enough to never clip shapes when rotated.
    var p = Math.max(this.options.padding || 0, 1.5);
    var map = this._map;
    var size = map.getSize();
    var center = map.containerPointToLayerPoint(size.divideBy(2));
    var half = size.multiplyBy(0.5 + p);
    var r = Math.ceil(Math.sqrt(half.x * half.x + half.y * half.y));

    this._bounds = new L.Bounds(
      center.subtract([r, r]).round(),
      center.add([r, r]).round(),
    );
    this._center = map.getCenter();
    this._zoom = map.getZoom();
    // Latlng of bounds.min captured while renderer zoom == map zoom, so
    // _updateTransform can reproject it even after map._zoom changed (pinch).
    this._boundsMinLatLng = map.layerPointToLatLng(this._bounds.min);
  };

  // =====================================================================
  // 6. L.Marker — rotation-aware positioning
  // =====================================================================
  L.Marker.mergeOptions({
    rotation: 0,
    rotateWithView: false,
    scale: undefined,
  });

  var _markerGetEvents = L.Marker.prototype.getEvents;
  L.Marker.prototype.getEvents = function () {
    var events = _markerGetEvents.call(this);
    if (this._map && this._map._rotate) {
      events.rotate = this.update;
    }
    return events;
  };

  var _markerSetPos = L.Marker.prototype._setPos;
  L.Marker.prototype._setPos = function (pos) {
    if (this._map && this._map._rotate && this._map._bearing) {
      pos = this._map.rotatedPointToMapPanePoint(pos);
    }
    if (_markerSetPos) {
      _markerSetPos.call(this, pos);
      return;
    }
    L.DomUtil.setPosition(this._icon, pos);
    if (this._shadow) {
      L.DomUtil.setPosition(this._shadow, pos);
    }
    this._zIndex = pos.y + this.options.zIndexOffset;
    this._resetZIndex();
  };

  var _markerUpdate = L.Marker.prototype.update;
  L.Marker.prototype.update = function () {
    var result = _markerUpdate.call(this);
    if (this._icon && this._map) {
      var rotation = this.options.rotation || 0;
      if (this.options.rotateWithView) {
        rotation += this._map._bearing;
      }
      if (rotation || this.options.scale) {
        var pos = L.DomUtil.getPosition(this._icon) || new L.Point(0, 0);
        var transform = "translate3d(" + pos.x + "px," + pos.y + "px,0)";
        if (rotation) {
          transform += " rotate(" + rotation + "deg)";
        }
        if (this.options.scale) {
          transform += " scale(" + this.options.scale + ")";
        }
        this._icon.style[L.DomUtil.TRANSFORM] = transform;
      }
    }
    return result;
  };

  // =====================================================================
  // 7. L.Icon — transform-origin on anchor
  // =====================================================================
  var _setIconStyles = L.Icon.prototype._setIconStyles;
  L.Icon.prototype._setIconStyles = function (img, name) {
    _setIconStyles.call(this, img, name);
    var anchor = this.options.iconAnchor || this.options.shadowAnchor;
    if (anchor) {
      img.style[L.DomUtil.TRANSFORM + "Origin"] =
        anchor[0] + "px " + anchor[1] + "px";
    }
  };

  // =====================================================================
  // 8. L.DivOverlay / L.Popup / L.Tooltip — rotation support
  // =====================================================================
  if (L.DivOverlay) {
    var _divOverlayGetEvents = L.DivOverlay.prototype.getEvents;
    L.DivOverlay.prototype.getEvents = function () {
      var events = _divOverlayGetEvents.call(this);
      if (this._map && this._map._rotate) {
        events.rotate = this._updatePosition;
      }
      return events;
    };
  }

  if (L.Popup) {
    var _popupUpdatePosition = L.Popup.prototype._updatePosition;
    L.Popup.prototype._updatePosition = function () {
      if (!this._map) return;
      if (!this._map._rotate || !this._map._bearing) {
        return _popupUpdatePosition.call(this);
      }

      var pos = this._map.latLngToLayerPoint(this._latlng);
      var rotatedPos = this._map.rotatedPointToMapPanePoint(pos);
      var offset = L.point(this.options.offset);
      var anchor = this._getAnchor();
      L.DomUtil.setPosition(this._container, rotatedPos.add(anchor));

      this._containerBottom = -offset.y;
      this._containerLeft =
        -Math.round(this._containerWidth / 2) + offset.x;
      this._container.style.bottom = this._containerBottom + "px";
      this._container.style.left = this._containerLeft + "px";
    };

    var _popupAnimateZoom = L.Popup.prototype._animateZoom;
    L.Popup.prototype._animateZoom = function (e) {
      if (!this._map || !this._map._rotate || !this._map._bearing) {
        if (_popupAnimateZoom) return _popupAnimateZoom.call(this, e);
        return;
      }
      var pos = this._map._latLngToNewLayerPoint(
        this._latlng,
        e.zoom,
        e.center,
      );
      pos = this._map.rotatedPointToMapPanePoint(pos);
      var anchor = this._getAnchor();
      L.DomUtil.setPosition(this._container, pos.add(anchor));
    };

    var _popupAdjustPan = L.Popup.prototype._adjustPan;
    L.Popup.prototype._adjustPan = function () {
      if (this._map && this._map._rotate) return;
      if (_popupAdjustPan) _popupAdjustPan.call(this);
    };
  }

  if (L.Tooltip) {
    var _tooltipUpdatePosition = L.Tooltip.prototype._updatePosition;
    L.Tooltip.prototype._updatePosition = function () {
      if (!this._map) return;
      if (!this._map._rotate || !this._map._bearing) {
        return _tooltipUpdatePosition.call(this);
      }

      var pos = this._map.latLngToLayerPoint(this._latlng);
      this._setPosition(this._map.rotatedPointToMapPanePoint(pos));
    };

    var _tooltipAnimateZoom = L.Tooltip.prototype._animateZoom;
    L.Tooltip.prototype._animateZoom = function (e) {
      if (!this._map || !this._map._rotate || !this._map._bearing) {
        if (_tooltipAnimateZoom) return _tooltipAnimateZoom.call(this, e);
        return;
      }
      var pos = this._map._latLngToNewLayerPoint(
        this._latlng,
        e.zoom,
        e.center,
      );
      this._setPosition(this._map.rotatedPointToMapPanePoint(pos));
    };
  }

  // =====================================================================
  // 9. Touch Gestures Handler — pinch zoom + rotate (Google Maps style)
  //    - Rotation has a deadzone threshold (~10°) so pinch-zoom works
  //      without accidental rotation
  //    - Anchor point: the geographic point under the midpoint between
  //      fingers stays under that midpoint throughout the gesture
  // =====================================================================
  L.Map.TouchGestures = L.Handler.extend({
    _ROTATION_THRESHOLD: 30 * DEG_TO_RAD,
    _SCALE_THRESHOLD: 0.015,
    _MOVE_THRESHOLD: 4,

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
      if (map.dragging && map.dragging.enabled()) {
        this._draggingWasEnabled = true;
        map.dragging.disable();
      } else {
        this._draggingWasEnabled = false;
      }
      if (map._stop) map._stop();
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
      var scaleBeyond = scaleDelta > this._SCALE_THRESHOLD;
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
          }
        }
        if (this._rotationActive) {
          var rotDelta = angle - this._rotRefAngle;
          while (rotDelta > Math.PI) rotDelta -= 2 * Math.PI;
          while (rotDelta < -Math.PI) rotDelta += 2 * Math.PI;
          var newBearing = this._startBearing - rotDelta * RAD_TO_DEG;
          newBearing = ((newBearing % 360) + 360) % 360;
          map.setBearing(newBearing);
          newBearingRad = map._bearingRad || 0;
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
      if (!this._active) return;
      this._active = false;
      var map = this._map;
      if (this._draggingWasEnabled && map.dragging) {
        map.dragging.enable();
      }
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
        map.fire("rotate");
      }
      this.zoom = false;
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
      var delta = L.DomEvent.getWheelDelta(e);
      var next = map.getBearing() - delta * this._ROTATE_STEP;
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
      this._moved = true;
      this._map.setBearing(this._startBearing + dx * this._SENSITIVITY);
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
  // 11. L.Control.Rotate — compass control
  // =====================================================================
  L.Control.Rotate = L.Control.extend({
    options: {
      position: "topleft",
      closeOnZeroBearing: true,
    },

    onAdd: function (map) {
      var container = L.DomUtil.create(
        "div",
        "leaflet-control-rotate leaflet-bar",
      );
      var link = L.DomUtil.create(
        "a",
        "leaflet-control-rotate-toggle",
        container,
      );
      link.href = "#";
      link.title = "Resetuj rotację";
      link.setAttribute("role", "button");
      link.setAttribute("aria-label", "Resetuj rotację");
      link.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" style="display:block;margin:auto;padding:3px">' +
        '<path d="M12 2L8 8h3v8h2V8h3L12 2z" fill="currentColor"/></svg>';

      this._link = link;
      this._container = container;

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, "click", this._resetBearing, this);
      map.on("rotate", this._updateDisplay, this);
      this._updateDisplay();
      return container;
    },

    onRemove: function (map) {
      map.off("rotate", this._updateDisplay, this);
      L.DomEvent.off(this._link, "click", this._resetBearing, this);
    },

    _resetBearing: function (e) {
      L.DomEvent.stop(e);
      this._map.setBearing(0);
    },

    _updateDisplay: function () {
      if (!this._map || !this._link) return;
      var bearing = this._map.getBearing();
      this._link.style[L.DomUtil.TRANSFORM] = "rotate(" + -bearing + "deg)";
      if (this.options.closeOnZeroBearing) {
        this._container.style.display = bearing === 0 ? "none" : "";
      }
    },
  });

  L.control.rotate = function (options) {
    return new L.Control.Rotate(options);
  };

  L.Map.addInitHook(function () {
    if (this.options.rotate && this.options.rotateControl) {
      var opts =
        this.options.rotateControl === true ? {} : this.options.rotateControl;
      this.rotateControl = L.control.rotate(opts);
      this.addControl(this.rotateControl);
    }
  });

  // =====================================================================
  // 11b. L.Control.RotateCompass — bottom-right compass toggle
  // =====================================================================
  L.Control.RotateCompass = L.Control.extend({
    options: {
      position: "bottomright",
      enabled: false,
    },

    onAdd: function (map) {
      this._map = map;

      var container = L.DomUtil.create(
        "div",
        "leaflet-control-rotate-compass leaflet-bar",
      );
      var link = L.DomUtil.create(
        "a",
        "leaflet-control-rotate-compass-toggle",
        container,
      );
      link.href = "#";
      link.title = "Obrót mapy";
      link.setAttribute("role", "button");
      link.setAttribute("aria-label", "Obrót mapy");
      link.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill-rule="evenodd" clip-rule="evenodd" style="display:block;transform-origin:center;transform-box:fill-box">' +
        '<path fill="#ebebeb" stroke="#333" stroke-width=".6" d="m11.81.44 3.6 11.27h-7.2z"/>' +
        '<path fill="#b95358" stroke="#333" stroke-width=".6" d="m11.81 23.18-3.6-11.27h7.2z"/>' +
        "</svg>";
      this._needle = link.firstChild;

      this._link = link;
      this._container = container;

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, "click", this._toggleRotation, this);
      map.on("rotate", this._updateDisplay, this);
      if (this.options.enabled) {
        this._enableRotation();
      } else {
        this._disableRotation();
      }
      return container;
    },

    onRemove: function (map) {
      map.off("rotate", this._updateDisplay, this);
      L.DomEvent.off(this._link, "click", this._toggleRotation, this);
    },

    _toggleRotation: function (e) {
      L.DomEvent.stop(e);
      if (this._enabled) {
        this._disableRotation();
      } else {
        this._enableRotation();
      }
    },

    _disableRotation: function () {
      this._enabled = false;
      if (this._map.dragRotate) this._map.dragRotate.disable();
      if (this._map.touchGestures) this._map.touchGestures.disable();
      if (this._map.touchZoom) this._map.touchZoom.enable();
      if (this._map.shiftKeyRotate) this._map.shiftKeyRotate.disable();
      this._map.setBearing(0);
      this._updateDisplay();
    },

    _enableRotation: function () {
      this._enabled = true;
      if (this._map.dragRotate && this._map.options.dragRotate) {
        this._map.dragRotate.enable();
      }
      if (this._map.touchGestures && this._map.options.touchRotate) {
        this._map.touchGestures.enable();
        if (this._map.touchZoom) this._map.touchZoom.disable();
      }
      if (this._map.shiftKeyRotate && this._map.options.shiftKeyRotate) {
        this._map.shiftKeyRotate.enable();
      }
      this._updateDisplay();
    },

    _updateDisplay: function () {
      if (!this._map || !this._link) return;
      var bearing = this._map.getBearing();
      if (this._needle) {
        this._needle.style[L.DomUtil.TRANSFORM] = "rotate(" + -bearing + "deg)";
      }
      if (this._enabled) {
        L.DomUtil.removeClass(
          this._container,
          "leaflet-rotate-compass--inactive",
        );
      } else {
        L.DomUtil.addClass(this._container, "leaflet-rotate-compass--inactive");
      }
    },
  });

  L.control.rotateCompass = function (options) {
    return new L.Control.RotateCompass(options);
  };

  L.Map.addInitHook(function () {
    if (this.options.rotate && this.options.rotateCompassControl) {
      var opts =
        this.options.rotateCompassControl === true
          ? {}
          : this.options.rotateCompassControl;
      this.rotateCompassControl = L.control.rotateCompass(opts);
      this.addControl(this.rotateCompassControl);
    }
  });

  // =====================================================================
  // 12. MarkerDrag fix — convert coords in rotated map
  // =====================================================================
  if (L.Handler.MarkerDrag) {
    var _markerDragOnDrag = L.Handler.MarkerDrag.prototype._onDrag;
    L.Handler.MarkerDrag.prototype._onDrag = function (e) {
      var marker = this._marker;
      var map = marker._map;

      if (map && map._rotate && map._bearing) {
        var iconPos = L.DomUtil.getPosition(marker._icon);
        var layerPos = map.mapPanePointToRotatedPoint(iconPos);
        var latlng = map.layerPointToLatLng(layerPos);

        marker._latlng = latlng;
        e.latlng = latlng;
        e.oldLatLng = this._oldLatLng;
        marker.fire("move", e);
        if (marker._shadowLatLng) marker._shadowLatLng = latlng;
        if (this._oldLatLng) marker.fire("drag", e);
        this._oldLatLng = latlng;
        return;
      }

      if (_markerDragOnDrag) return _markerDragOnDrag.call(this, e);
    };
  }

  // =====================================================================
  // 13. Block page pinch-zoom gestures (iOS Safari)
  //     CSS touch-action nie wystarcza na iOS — preventDefault na
  //     gesturestart/change/end blokuje zoom całej strony.
  // =====================================================================
  L.Map.mergeOptions({ preventPageGestures: true });

  L.Map.addInitHook(function () {
    if (!this.options.preventPageGestures) return;
    var events = ["gesturestart", "gesturechange", "gestureend"];
    var prevent = function (e) {
      e.preventDefault();
    };
    events.forEach(function (ev) {
      document.addEventListener(ev, prevent, { passive: false });
    });
    this.on("unload", function () {
      events.forEach(function (ev) {
        document.removeEventListener(ev, prevent, { passive: false });
      });
    });
  });

  // =====================================================================
  // CSS injection
  // =====================================================================
  var style = document.createElement("style");
  style.textContent = [
    ".leaflet-rotate-pane { position: absolute; top: 0; left: 0; will-change: transform; }",
    ".leaflet-norotate-pane { position: absolute; top: 0; left: 0; z-index: 600; }",
    ".leaflet-control-rotate { background: #fff; }",
    ".leaflet-control-rotate a { display: block; width: 26px; height: 26px; line-height: 26px; text-align: center; cursor: pointer; }",
    ".leaflet-control-rotate a:hover { background: #f4f4f4; }",
    ".leaflet-control-rotate-compass { background: #fff; }",
    ".leaflet-control-rotate-compass a { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; cursor: pointer; }",
    ".leaflet-control-rotate-compass a:hover { background: #f4f4f4; }",
    ".leaflet-rotate-compass--inactive a svg { filter: grayscale(1); }",
  ].join("\n");
  document.head.appendChild(style);
})(L);
