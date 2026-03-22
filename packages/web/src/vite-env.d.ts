/// <reference types="vite/client" />

// Agent port exposed via Vite's define config for direct WebSocket connections
// in development mode, bypassing the Vite proxy (which fails in WSL environments)
declare const __DEV_AGENT_PORT__: string
