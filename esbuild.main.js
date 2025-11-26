const esbuild = require("esbuild")

const isWatch = process.argv.includes("--watch")

const buildOptions = {
  entryPoints: ["src/main/index.ts"],
  bundle: true,
  platform: "node",
  external: ["electron"],
  outfile: "dist/main/index.js",
}

if (isWatch) {
  esbuild.context(buildOptions).then(context => {
    context.watch().then(() => {
      console.log("Watching main process files...")
    })
  })
} else {
  esbuild.build(buildOptions).catch(() => process.exit(1))
}
