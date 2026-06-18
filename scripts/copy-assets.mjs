import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
copyFileSync("src/leaflet-rotate.css", "dist/leaflet-rotate.css");
