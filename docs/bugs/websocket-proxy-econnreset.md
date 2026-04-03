# Bug: WebSocket Proxy ECONNRESET in WSL/Tailscale Setup

**Status: RESOLVED** (2026-03-30)

## Fix Applied
1. Removed `/ws` WebSocket proxy from `vite.config.ts` — root cause of ECONNRESET
2. Frontend (`useSessionManager.ts`) now always connects directly to agent port in dev mode
3. Agent (`server.ts`) enumerates all network IPs (including Tailscale) for origin validation

## Summary
WebSocket connections die immediately with `ECONNRESET` when running clsh through WSL with Tailscale tunnel. Authentication works, but the terminal WebSocket connection fails.

## Environment
- Windows 11 PC running clsh via WSL
- Tailscale installed in WSL (authenticated)
- Node.js in WSL with native modules (node-pty, better-sqlite3)
- Vite dev server on port 4031 proxying to agent on port 4030
- Phone connects via Tailscale IP (e.g., `http://100.117.130.99:4031`)

## Symptoms
1. QR code displays correctly with Tailscale URL
2. Bootstrap token authentication **succeeds** (`auth.login` event fires)
3. WebSocket connects then immediately disconnects (within 100ms)
4. Vite logs: `ws proxy socket error: Error: read ECONNRESET`
5. "Set password" button on LockSetup screen does nothing (requires stable WS)

## Logs
```
{"timestamp":"...","event":"ws.connected","data":{"ip":"::ffff:127.0.0.1"}}
{"timestamp":"...","event":"ws.disconnected","data":{"ip":"::ffff:127.0.0.1"}}  // 98ms later
{"timestamp":"...","event":"ws.connected","data":{"ip":"::ffff:127.0.0.1"}}
12:07:56 PM [vite] ws proxy socket error:
Error: read ECONNRESET
    at TCP.onStreamRead (node:internal/stream_base_commons:216:20)
{"timestamp":"...","event":"ws.disconnected","data":{"ip":"::ffff:127.0.0.1"}}
{"timestamp":"...","event":"auth.login","data":{"method":"bootstrap","ip":"::ffff:127.0.0.1"}}
{"timestamp":"...","event":"ws.connected","data":{"ip":"::ffff:127.0.0.1"}}
{"timestamp":"...","event":"ws.disconnected","data":{"ip":"::ffff:127.0.0.1"}}  // 19ms later!
```

## Key Observation
- This happens even on **localhost** (same PC), not just over Tailscale
- The issue is NOT Tailscale-specific - it's the Vite WebSocket proxy failing in WSL

## Vite Proxy Config
```typescript
// packages/web/vite.config.ts
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
```

## What Works
- HTTP API calls through proxy (auth succeeds)
- This setup works fine on macOS with ngrok tunnel
- Native Windows + ngrok works (when native modules compile)

## What Doesn't Work
- WebSocket connections through Vite proxy in WSL

## Potential Fixes to Try

### Option 1: Bypass Vite Proxy for WebSocket
Have the web app connect directly to the agent on port 4030 instead of going through Vite's proxy.

In `packages/web/src/hooks/useSessionManager.ts` or wherever the WS URL is constructed:
```typescript
// Instead of using location.host (which goes through Vite proxy)
// Connect directly to agent port
const wsUrl = import.meta.env.DEV
  ? `ws://${location.hostname}:4030/ws`
  : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
```

This requires the agent to have CORS headers for the WebSocket upgrade.

### Option 2: Serve Built Assets from Agent
Build the web app and serve it directly from the agent (no Vite dev server):
```bash
npm run build --workspace=@clsh/web
# Then have agent serve the built files
```

### Option 3: Use Different Proxy (http-proxy-middleware)
Replace Vite's built-in proxy with a custom middleware that handles WebSocket better.

### Option 4: Debug Vite's WebSocket Handling
Check if Vite's HMR WebSocket conflicts with the app's WebSocket on `/ws`.

## Files to Investigate
- `packages/web/vite.config.ts` - proxy configuration
- `packages/web/src/lib/ws-client.ts` - WebSocket client
- `packages/web/src/hooks/useSessionManager.ts` - where WS URL is constructed
- `packages/agent/src/ws-handler.ts` - server-side WebSocket handling

## Reproduction Steps
1. Clone clsh to Windows
2. Copy to WSL native filesystem: `rsync -av --exclude node_modules /mnt/d/Dev/clsh/ ~/clsh/`
3. Install in WSL: `cd ~/clsh && npm install`
4. Install/auth Tailscale in WSL
5. Run: `TUNNEL=tailscale npm run dev`
6. Open the Tailscale URL in browser
7. Authenticate with bootstrap token
8. Observe WebSocket dying immediately
