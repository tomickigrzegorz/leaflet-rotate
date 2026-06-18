// Wstrzykuje TYLKO strukturalny CSS paneów (wymagany do działania rotacji).
// Kosmetyka kontrolek jest w dist/leaflet-rotate.css (opcjonalny import).
const style = document.createElement("style");
style.textContent = [
  ".leaflet-rotate-pane { position: absolute; top: 0; left: 0; will-change: transform; }",
  ".leaflet-norotate-pane { position: absolute; top: 0; left: 0; z-index: 600; }",
].join("\n");
document.head.appendChild(style);
