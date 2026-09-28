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
