import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {defineConfig} from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Isolated dev server for Playwright DOM logging (not part of production `yarn build`).
 * Manual + automated checklist: see comment block at top of `e2e/selectable-pdf-dom.spec.ts`.
 * Transition repros: `/?scenario=doc-switch`, `/?scenario=doc-switch-remount` (`./main.tsx`).
 */
export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, "../fixtures"),
  plugins: [
    react(),
    tsconfigPaths({
      projects: [path.resolve(__dirname, "../../tsconfig.json")]
    })
  ],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true
  },
  resolve: {
    alias: [
      {find: "@", replacement: path.resolve(__dirname, "../../src")},
      {
        find: "@tabler/icons-react",
        replacement: "@tabler/icons-react/dist/esm/icons/index.mjs"
      }
    ],
    dedupe: [
      "@mantine/core",
      "@mantine/hooks",
      "@tabler/icons-react",
      "clsx",
      "react",
      "react-dom"
    ]
  },
  optimizeDeps: {
    include: ["pdfjs-dist"]
  }
})
