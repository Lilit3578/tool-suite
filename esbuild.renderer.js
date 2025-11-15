const esbuild = require("esbuild")
const path = require("path")
const pathAliasPlugin = require("esbuild-plugin-path-alias")
const postcss = require("postcss")
const tailwindcss = require("tailwindcss")
const autoprefixer = require("autoprefixer")
const fs = require("fs")

const isWatch = process.argv.includes("--watch")

// Process CSS through Tailwind/PostCSS
async function processCSS() {
  const cssPath = path.resolve(__dirname, "src/renderer/styles/globals.css")
  const css = fs.readFileSync(cssPath, "utf8")
  
  const result = await postcss([tailwindcss, autoprefixer])
    .process(css, { from: cssPath })
  
  // Write processed CSS to dist
  const distCssPath = path.resolve(__dirname, "dist/renderer/bundle.css")
  fs.mkdirSync(path.dirname(distCssPath), { recursive: true })
  fs.writeFileSync(distCssPath, result.css)
  
  console.log("✓ CSS processed with Tailwind")
}

const buildOptions = {
  entryPoints: ["src/renderer/index.tsx"],
  bundle: true,
  outfile: "dist/renderer/bundle.js",
  loader: {
    ".tsx": "tsx",
    ".ts": "ts",
    ".css": "empty" // Don't bundle CSS, we'll process it separately
  },
  plugins: [
    pathAliasPlugin({
      alias: {
        "@": path.resolve(__dirname, "src/renderer")
      }
    })
  ]
}

async function build() {
  // Process CSS first
  await processCSS()
  
  // Then build JS
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions)
    await ctx.watch()
    console.log("Watching for changes...")
    
    // Watch CSS file too
    fs.watchFile(
      path.resolve(__dirname, "src/renderer/styles/globals.css"),
      { interval: 500 },
      async () => {
        console.log("CSS changed, reprocessing...")
        await processCSS()
      }
    )
  } else {
    await esbuild.build(buildOptions)
  }
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
