const esbuild = require("esbuild")

esbuild.build({
  entryPoints: ["src/preload/index.ts"],
  bundle: true,
  platform: "node",
  external: ["electron"],
  outfile: "dist/preload/preload.js",
})
