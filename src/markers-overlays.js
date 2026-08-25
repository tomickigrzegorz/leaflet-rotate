import L from "leaflet";

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

  // Shared by update() and _rotateReposition: apply the marker's own
  // rotation/scale on top of the position transform.
  function _applyIconTransform(marker, map) {
    var rotation = marker.options.rotation || 0;
    if (marker.options.rotateWithView) {
      rotation += map._bearing || 0;
    }
    if (rotation || marker.options.scale) {
      var pos = L.DomUtil.getPosition(marker._icon) || new L.Point(0, 0);
      var transform = "translate3d(" + pos.x + "px," + pos.y + "px,0)";
      if (rotation) {
        transform += " rotate(" + rotation + "deg)";
      }
      if (marker.options.scale) {
        transform += " scale(" + marker.options.scale + ")";
      }
      marker._icon.style[L.DomUtil.TRANSFORM] = transform;
    }
  }

  var _markerUpdate = L.Marker.prototype.update;
  L.Marker.prototype.update = function () {
    var result = _markerUpdate.call(this);
    if (this._icon && this._map) {
      _applyIconTransform(this, this._map);
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
    _applyIconTransform(this, map);
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

  // Marker icons are focusable by default (keyboard accessibility), so a
  // plain click focuses the icon and fires Leaflet's built-in
  // autoPanOnFocus → _panOnFocus → map.panInside(). panInside works in the
  // map's unrotated projected-pixel plane (project()/getPixelBounds()) —
  // it has no concept of the CSS rotation applied to the view. While the
  // map sits exactly at its initial center this coincidentally lines up,
  // but after any pan it judges "is this marker visible" against an
  // axis-aligned box that no longer matches what's actually on screen and
  // fires an arbitrary, wrong pan on every marker click — the map jumps
  // instead of the popup opening. Same fix as Popup._adjustPan below:
  // skip it while rotated.
  if (L.Marker.prototype._panOnFocus) {
    var _markerPanOnFocus = L.Marker.prototype._panOnFocus;
    L.Marker.prototype._panOnFocus = function () {
      if (this._map && this._map._rotate) return;
      return _markerPanOnFocus.call(this);
    };
  }

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
