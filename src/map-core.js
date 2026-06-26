import L from "leaflet";
import { DEG_TO_RAD } from "./constants.js";

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
    rotateClockwise: true,
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
