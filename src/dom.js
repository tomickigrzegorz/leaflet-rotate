import L from "leaflet";

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
