import terser from "@rollup/plugin-terser";

const banner = "/*! @tomickigrzegorz/leaflet-rotate v0.1.0 | MIT */";
const umd = {
  format: "umd",
  name: "LeafletRotate",
  globals: { leaflet: "L" },
  banner,
};

export default {
  input: "src/index.js",
  external: ["leaflet"],
  output: [
    { file: "dist/leaflet-rotate.esm.js", format: "es", banner },
    { ...umd, file: "dist/leaflet-rotate.umd.js" },
    { ...umd, file: "dist/leaflet-rotate.umd.min.js", plugins: [terser()] },
  ],
};
