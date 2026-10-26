import react from "@vitejs/plugin-react"
import {defineConfig, loadEnv} from "vite"
import {viteStaticCopy} from "vite-plugin-static-copy"
import tsconfigPaths from "vite-tsconfig-paths"

// https://vitejs.dev/config/
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), "")
  const apiTarget = env.VITE_DEV_API_URL || "http://127.0.0.1:18000"
  const wsTarget = apiTarget.replace(/^http/i, "ws")

  return {
    // When VITE_BASE_URL is unset, RTK uses relative `/api` on the dev server.
    // Proxy to the native backend (default :18000) or docker app (:12000 via
    // VITE_DEV_API_URL=http://127.0.0.1:12000).
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true
        },
        "/ws": {
          target: wsTarget,
          ws: true,
          changeOrigin: true
        }
      }
    },
    plugins: [
    react(),
    tsconfigPaths(),
    viteStaticCopy({
      targets: [
        {
          src: "../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
          dest: "",
          rename: "pdf.worker.min.js"
        }
      ]
    })
  ],
  /*
  build: {
    minify: false, // 🔧 Disable minification
    sourcemap: true, // Optional: include source maps for better debugging
    rollupOptions: {
      output: {
        manualChunks: undefined, // Disable automatic code splitting
      }
    }
  },
  */
  optimizeDeps: {
    include: ["viewer", "pdfjs-dist"]
  },
  resolve: {
    alias: [
      {find: "@", replacement: "/src"},
      // https://github.com/tabler/tabler-icons/issues/1233#issuecomment-2428245119
      // https://stackoverflow.com/questions/79194970/tabler-icons-for-react-slowing-down-app-on-initial-load
      // /esm/icons/index.mjs only exports the icons statically, so no separate chunks are created
      {
        find: "@tabler/icons-react",
        replacement: "@tabler/icons-react/dist/esm/icons/index.mjs"
      }
    ],
    // Add dedupe to use the versions from apps/ui for workspace packages
    dedupe: [
      "@mantine/core",
      "@mantine/hooks",
      "@tabler/icons-react",
      "clsx",
      "react",
      "react-dom"
    ]
  },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use "/src/_mantine";`
        }
      }
    }
  }
})
