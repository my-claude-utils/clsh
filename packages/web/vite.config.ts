import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// AGENT_PORT is set by the root dev script (defaults to 4030)
const agentPort = process.env.AGENT_PORT || '4030'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Expose agent port to frontend so it can connect directly in dev mode,
    // bypassing Vite's WebSocket proxy (which fails in WSL environments)
    __DEV_AGENT_PORT__: JSON.stringify(agentPort),
  },
  server: {
    port: 4031,
    host: true, // bind to 0.0.0.0 so phones on the same Wi-Fi can connect
    allowedHosts: 'all', // Allow Tailscale IPs and all tunnel domains
    proxy: {
      '/api': {
        target: `http://localhost:${agentPort}`,
        changeOrigin: true,
      },
    },
  },
})
