const esbuild = require("esbuild")

esbuild.build({
  entryPoints: ["src/main/main.ts"],
  bundle: true,
  platform: "node",
  external: ["electron"],
  outfile: "dist/main/main.js",
})
