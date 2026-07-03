// Injects ONLY the structural pane CSS (required for rotation to work).
// Control styling lives in dist/leaflet-rotate.css (optional import).
// Guarded for SSR (no document) and double injection (ESM + UMD, HMR).
const STYLE_ID = "leaflet-rotate-panes";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    ".leaflet-rotate-pane { position: absolute; top: 0; left: 0; will-change: transform; }",
    ".leaflet-norotate-pane { position: absolute; top: 0; left: 0; z-index: 600; }",
  ].join("\n");
  document.head.appendChild(style);
}
