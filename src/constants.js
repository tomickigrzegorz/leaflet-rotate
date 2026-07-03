export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

// Normalize degrees to [0, 360)
export function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

// Wrap a degree delta to [-180, 180)
export function wrapDeg(deg) {
  return normalizeDeg(deg + 180) - 180;
}

// Wrap a radian delta to [-PI, PI)
export function wrapRad(rad) {
  var twoPi = 2 * Math.PI;
  return ((((rad + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

// Monotonic-ish timestamp; performance.now is missing in some old WebViews
export function now() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}
