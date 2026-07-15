import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true, // Allow tunneling hosts like localtunnel
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:5001',
        ws: true,
      },
    },
  }
})
