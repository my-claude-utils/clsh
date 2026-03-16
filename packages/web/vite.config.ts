import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// AGENT_PORT is set by the root dev script (defaults to 4030)
const agentPort = process.env.AGENT_PORT || '4030'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4031,
    host: true, // bind to 0.0.0.0 so phones on the same Wi-Fi can connect
    allowedHosts: ['.ngrok-free.dev', '.ngrok.io', '.localhost.run', '.lhr.life'],
    proxy: {
      '/ws': {
        target: `ws://localhost:${agentPort}`,
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: `http://localhost:${agentPort}`,
        changeOrigin: true,
      },
    },
  },
})
