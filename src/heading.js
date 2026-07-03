import L from "leaflet";
import { normalizeDeg, wrapDeg } from "./constants.js";

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
    this._headingTarget = normalizeDeg(-deg);
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
    var diff = wrapDeg(this._headingTarget - current);
    if (Math.abs(diff) < this._headingDeadzone) {
      if (Math.abs(diff) > 0.001) this.setBearing(this._headingTarget);
      return; // settled; loop restarts on next setHeading
    }
    this.setBearing(current + diff * this._headingEase);
    this._headingRAF = L.Util.requestAnimFrame(this._headingAnim, this);
  };
