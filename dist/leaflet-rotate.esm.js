/*! @tomickigrzegorz/leaflet-rotate v0.2.1 | MIT */
import L from 'leaflet';

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

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// =====================================================================
  // 3. L.Map — core rotation
  // =====================================================================
  var _mapProto$1 = L.Map.prototype;

  L.Map.mergeOptions({
    rotate: false,
    bearing: 0,
    touchRotate: false,
    shiftKeyRotate: false,
    dragRotate: true,
    rotateControl: false,
    rotateClockwise: true,
  });

  var _mapInitialize = _mapProto$1.initialize;
  _mapProto$1.initialize = function (id, options) {
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
  var _initPanes = _mapProto$1._initPanes;
  _mapProto$1._initPanes = function () {
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
  _mapProto$1.setBearing = function (theta) {
    if (!this._rotate) return;
    this._commitRotatePan();
    var prev = this._bearing || 0;
    var bearing = ((theta % 360) + 360) % 360;
    this._bearing = bearing;
    this._bearingRad = bearing * DEG_TO_RAD;
    this._updateRotatePaneTransform();
    // Renderers use stock (small) bounds at bearing 0 and the big rotation-
    // invariant square when rotated. Re-size them only when crossing that
    // boundary — avoids clipping on rotate and the giant-SVG re-raster blink
    // on flat pan.
    if ((prev === 0) !== (bearing === 0)) {
      for (var id in this._layers) {
        var layer = this._layers[id];
        if (layer instanceof L.Renderer) layer._update();
      }
    }
    this.fire("rotate");
  };

  _mapProto$1.getBearing = function () {
    return this._bearing || 0;
  };

  _mapProto$1._updateRotatePaneTransform = function () {
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
  _mapProto$1._commitRotatePan = function () {
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

  var _containerPointToLayerPoint = _mapProto$1.containerPointToLayerPoint;
  _mapProto$1.containerPointToLayerPoint = function (point) {
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

  var _layerPointToContainerPoint = _mapProto$1.layerPointToContainerPoint;
  _mapProto$1.layerPointToContainerPoint = function (point) {
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
  _mapProto$1.rotatedPointToMapPanePoint = function (point) {
    if (!this._bearing) return L.point(point);
    var viewHalf = this.getSize().divideBy(2);
    return L.point(point).rotateFrom(this._bearingRad, viewHalf);
  };

  _mapProto$1.mapPanePointToRotatedPoint = function (point) {
    if (!this._bearing) return L.point(point);
    var viewHalf = this.getSize().divideBy(2);
    return L.point(point).rotateFrom(-this._bearingRad, viewHalf);
  };

  // --- _getCenterOffset ---
  // Returns screen-space offset for panBy to work correctly with rotation.
  var _getCenterOffset = _mapProto$1._getCenterOffset;
  _mapProto$1._getCenterOffset = function (latlng) {
    if (!this._rotate || !this._bearing) {
      return _getCenterOffset.call(this, latlng);
    }
    var dp = this.project(latlng).subtract(this.project(this.getCenter()));
    return dp.rotate(this._bearingRad);
  };

  // --- getBounds with 4 corners ---
  var _getBounds = _mapProto$1.getBounds;
  _mapProto$1.getBounds = function () {
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

  _mapProto$1.mapBoundsToContainerBounds = function (bounds) {
    return L.bounds([
      this.latLngToContainerPoint(bounds.getNorthWest()),
      this.latLngToContainerPoint(bounds.getNorthEast()),
      this.latLngToContainerPoint(bounds.getSouthEast()),
      this.latLngToContainerPoint(bounds.getSouthWest()),
    ]);
  };

  var _getBoundsZoom = _mapProto$1.getBoundsZoom;
  _mapProto$1.getBoundsZoom = function (bounds, inside, padding) {
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
  _mapProto$1._animateZoomNoDelay = function (center, zoom, startAnim) {
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
  var _tryAnimatedZoom = _mapProto$1._tryAnimatedZoom;
  _mapProto$1._tryAnimatedZoom = function (center, zoom, options) {
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

  // _commitRotatePan() calls map._resetView() to zero a pan offset (needed so
  // the rotation pivot stays centered). _resetView always fires `viewprereset`,
  // whose default GridLayer handler is _invalidateAll — it removes every tile
  // and re-fades them in, which flickers on every GPS step while walking +
  // heading-up. A pan commit never changes zoom or the visible view, so the
  // tiles stay valid; _setView only needs to reposition them. Skip the full
  // invalidate during a commit to avoid the flicker.
  var _gridInvalidateAll = L.GridLayer.prototype._invalidateAll;
  L.GridLayer.prototype._invalidateAll = function () {
    if (this._map && this._map._committingRotatePan) return;
    return _gridInvalidateAll.call(this);
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
    var halfSize = map
      .getSize()
      .divideBy(Math.min(scale, 1) * 2)
      .multiplyBy(1.25);

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
    }
  };

  var _rendererUpdateTransform = L.Renderer.prototype._updateTransform;
  L.Renderer.prototype._updateTransform = function (center, zoom) {
    if (!this._map || !this._map._rotate || !this._map._bearing) {
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
    if (!this._map || !this._map._rotate || !this._map._bearing) {
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

const _mapProto = L.Map.prototype;

  // --- Heading-up: smooth, source-agnostic ---
  // Any provider (geolocation, LocateControl, ...) feeds a heading in degrees
  // (0 = N, clockwise). An internal rAF loop eases the bearing toward
  // heading-up so a flood of updates never makes the map jump.
  _mapProto.setHeading = function (deg, options) {
    if (!this._rotate) return this;
    if (deg === null || deg === undefined || isNaN(deg)) {
      return this.stopHeadingUp();
    }
    options = options || {};
    this._headingUp = true;
    this._headingEase = options.ease != null ? options.ease : 0.2;
    this._headingDeadzone =
      options.deadzone != null ? options.deadzone : 0.5;
    // Heading direction must point to the top of the screen: bearing = -heading.
    this._headingTarget = (((-deg % 360) + 360) % 360);
    this._startHeadingAnim();
    return this;
  };

  _mapProto.stopHeadingUp = function () {
    this._headingUp = false;
    if (this._headingRAF) {
      L.Util.cancelAnimFrame(this._headingRAF);
      this._headingRAF = null;
    }
    return this;
  };

  _mapProto.getHeadingUp = function () {
    return !!this._headingUp;
  };

  _mapProto._startHeadingAnim = function () {
    if (this._headingRAF) return;
    this._headingRAF = L.Util.requestAnimFrame(this._headingAnim, this);
  };

  _mapProto._headingAnim = function () {
    this._headingRAF = null;
    if (!this._headingUp) return;
    var current = this.getBearing();
    var diff = this._headingTarget - current;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    if (Math.abs(diff) < this._headingDeadzone) {
      if (Math.abs(diff) > 0.001) this.setBearing(this._headingTarget);
      return; // settled; loop restarts on next setHeading
    }
    this.setBearing(current + diff * this._headingEase);
    this._headingRAF = L.Util.requestAnimFrame(this._headingAnim, this);
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
      events.rotate = this._rotateReposition;
      events.rotateend = this._rotateEnd;
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

  // C: Fast per-frame reposition during rotation. center/zoom are constant
  // while rotating, so the layer point is cached and only the bearing is
  // re-applied — skips latLngToLayerPoint projection per marker per frame.
  L.Marker.prototype._rotateReposition = function () {
    var map = this._map;
    if (!map || !this._icon) return;
    var lp;
    if (map._rotInertia && this._rotLayerPt) {
      lp = this._rotLayerPt;
    } else {
      lp = map.latLngToLayerPoint(this._latlng);
      if (map._rotInertia) this._rotLayerPt = lp;
    }
    this._setPos(lp);
    var rotation = this.options.rotation || 0;
    if (this.options.rotateWithView) {
      rotation += map._bearing;
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
  };

  // Rotation session ended: drop the cache and do a full update (which now
  // also flushes the deferred z-index, since _rotating is cleared first).
  L.Marker.prototype._rotateEnd = function () {
    this._rotLayerPt = null;
    this.update();
  };

  // B: Defer z-index writes while a rotation session is active. Skipping the
  // per-frame style.zIndex write avoids stacking-context recalcs ×N markers.
  var _markerResetZIndex = L.Marker.prototype._resetZIndex;
  L.Marker.prototype._resetZIndex = function () {
    if (this._map && this._map._rotating) return;
    return _markerResetZIndex.call(this);
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
    _SCALE_THRESHOLD: 0.04,
    _SCALE_THRESHOLD_ROT: 0.12,
    _MOVE_THRESHOLD: 4,
    _ZOOM_EPS: 0.01,              // skip reproject if zoom unchanged this frame
    _PAN_EPS: 2,                  // skip reproject if midpoint barely moved (px)
    _ZOOM_SNAP_STEP: 0,           // quantize live zoom → fewer reprojects (0 = off; >0 makes zoom step visibly)

    // --- Rotation inertia (momentum spin after release) ---
    _ROT_INERTIA: true,           // master switch for the test
    _ROT_DECAY: 0.0018,           // higher = stops faster (per ms)
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
      // Any new touch (even a single-finger pan) must abort rotation inertia
      // first, or its setBearing loop races the drag: tiles jump and the
      // marker layer-point cache goes stale (markers lag, then snap back).
      this._stopRotateInertia();
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
      this._lastMoveZoom = this._startZoom;
      this._lastMoveMidpoint = this._startMidpoint;

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
        // Quantize live zoom so reproject fires only on step crossings, not on
        // every micro finger-distance jitter while rotating.
        if (this._ZOOM_SNAP_STEP > 0) {
          newZoom =
            Math.round(newZoom / this._ZOOM_SNAP_STEP) * this._ZOOM_SNAP_STEP;
        }
      }

      // --- Rotation (only after threshold exceeded) ---

      var newBearingRad = this._startBearingRad;
      if (map.options.touchRotate) {
        if (!this._rotationActive) {
          if (Math.abs(angleDelta) > this._ROTATION_THRESHOLD) {
            this._rotationActive = true;
            this._rotRefAngle = angle;
            map._rotating = true;
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

      // Gate the costly reproject: only when zoom or midpoint actually changed
      // this frame. During pure rotation neither does → rotation stays as cheap
      // as the mouse (just setBearing), no per-frame _move of all tiles/layers.
      var zoomChanged =
        Math.abs(newZoom - this._lastMoveZoom) > this._ZOOM_EPS;
      var panChanged =
        midpoint.distanceTo(this._lastMoveMidpoint) > this._PAN_EPS;

      if (this._scaleActive && (zoomChanged || panChanged)) {
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
        this._lastMoveZoom = newZoom;
        this._lastMoveMidpoint = midpoint;

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
      } else if (this._scaleActive) ; else {
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
        if (!this._startRotateInertia()) {
          map._rotating = false;
          map.fire("rotateend");
        }
      }
      this.zoom = false;
    },

    _stopRotateInertia: function () {
      if (this._rotInertiaReq) {
        L.Util.cancelAnimFrame(this._rotInertiaReq);
        this._rotInertiaReq = null;
      }
      var map = this._map;
      if (map && map._rotating) {
        map._rotating = false;
        map._rotInertia = false;
        map.fire("rotateend");
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

      map._rotInertia = true;
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
          map._rotating = false;
          map._rotInertia = false;
          map.fire("rotateend");
          return;
        }
        var b = map.getBearing() + v * dt;
        b = ((b % 360) + 360) % 360;
        map.setBearing(b);
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
        this._stopAnim();
        return;
      }

      map.setBearing(current + diff * this._EASE);
      this._animRequest = L.Util.requestAnimFrame(this._animate, this, true);
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

// =====================================================================
  // 11. L.Control.Rotate — unified compass control
  //     behavior: "reset"  → rotation always on, click returns to north
  //     behavior: "toggle" → click enables/disables rotation (+ reset)
  // =====================================================================
  L.Control.Rotate = L.Control.extend({
    options: {
      position: "topleft",
      behavior: "reset", // "reset" | "toggle"
      closeOnZeroBearing: true, // reset mode: hide control at bearing 0
      enabled: false, // toggle mode: initial rotation state
    },

    onAdd: function (map) {
      this._map = map;

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
      link.setAttribute("role", "button");

      var label =
        this.options.behavior === "toggle" ? "Map rotation" : "Reset rotation";
      link.title = label;
      link.setAttribute("aria-label", label);

      link.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill-rule="evenodd" clip-rule="evenodd" style="display:block;transform-origin:center;transform-box:fill-box">' +
        '<path fill="#ebebeb" stroke="#333" stroke-width=".6" d="m11.81.44 3.6 11.27h-7.2z"/>' +
        '<path fill="#b95358" stroke="#333" stroke-width=".6" d="m11.81 23.18-3.6-11.27h7.2z"/>' +
        "</svg>";
      this._needle = link.firstChild;

      this._link = link;
      this._container = container;

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, "click", this._onClick, this);
      map.on("rotate", this._updateDisplay, this);

      if (this.options.behavior === "toggle") {
        if (this.options.enabled) {
          this._enableRotation();
        } else {
          this._disableRotation();
        }
      } else {
        this._updateDisplay();
      }
      return container;
    },

    onRemove: function (map) {
      map.off("rotate", this._updateDisplay, this);
      L.DomEvent.off(this._link, "click", this._onClick, this);
    },

    _onClick: function (e) {
      L.DomEvent.stop(e);
      if (this.options.behavior === "toggle") {
        if (this._enabled) {
          this._disableRotation();
        } else {
          this._enableRotation();
        }
      } else {
        this._map.setBearing(0);
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
      if (this.options.behavior === "toggle") {
        if (this._enabled) {
          L.DomUtil.removeClass(
            this._container,
            "leaflet-control-rotate--inactive",
          );
        } else {
          L.DomUtil.addClass(
            this._container,
            "leaflet-control-rotate--inactive",
          );
        }
      } else if (this.options.closeOnZeroBearing) {
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
  // 13. Block page pinch-zoom gestures (iOS Safari)
  //     CSS touch-action is not enough on iOS — preventDefault on
  //     gesturestart/change/end blocks zooming of the whole page.
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

// Injects ONLY the structural pane CSS (required for rotation to work).
// Control styling lives in dist/leaflet-rotate.css (optional import).
const style = document.createElement("style");
style.textContent = [
  ".leaflet-rotate-pane { position: absolute; top: 0; left: 0; will-change: transform; }",
  ".leaflet-norotate-pane { position: absolute; top: 0; left: 0; z-index: 600; }",
].join("\n");
document.head.appendChild(style);
