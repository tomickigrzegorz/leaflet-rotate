import L from "leaflet";

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
