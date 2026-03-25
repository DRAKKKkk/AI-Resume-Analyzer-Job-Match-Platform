import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Opens the server to the outside (Docker) network
    port: 5173,
    watch: {
      usePolling: true // Forces Windows to detect file changes inside the Linux container
    }
  }
})