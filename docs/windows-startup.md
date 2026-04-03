# Windows One-Click Startup

## Goal
Double-click a file → clsh starts → QR code appears → scan with phone → terminal access

## Requirements
- Phone and PC both have Tailscale (E2E encrypted, works anywhere)
- One-click startup (no terminal commands)
- Must work on Windows

## Approaches Tried

### 1. Native Windows with Node 25 ❌
- **Problem:** Node 25 is too new, no prebuilt binaries for native modules
- **Error:** better-sqlite3 needs C++20, build toolchain conflicts

### 2. Native Windows with Node 22 via fnm ❌
- **Problem:** VS Build Tools missing Spectre-mitigated libraries
- **Error:** `MSB8040: Spectre-mitigated libraries are required`
- node-pty and better-sqlite3 both fail to compile

### 3. WSL with Tailscale ❌ (current attempt)
- Installed Tailscale in WSL, authenticated ✅
- **Problem:** node_modules were built for Windows, can't run in WSL
- **Problem:** npm install in WSL uses Windows node-gyp (path confusion)

## Next Steps

### Option A: Fix WSL approach
1. Move project to native WSL filesystem (`~/clsh`)
2. Run npm install there (will use Linux node-gyp)
3. Update start.bat to run from WSL path

### Option B: Fix Windows build tools
1. Install Spectre-mitigated libraries via VS Installer
2. Rebuild with Node 22 on Windows

### Option C: Use local Wi-Fi instead of Tailscale
- Simpler, works if phone/PC on same network
- No native module issues if using WSL

## Current Status
✅ **Working: Option A - WSL native filesystem**

1. Project copied to `~/clsh` in WSL
2. node_modules installed with Linux binaries
3. Tailscale installed and authenticated in WSL
4. `start.bat` runs clsh from WSL native path

### File Sync Note
Code changes made in `D:\Dev\clsh` need to be synced to `~/clsh`:
```bash
wsl -e bash -c "rsync -av --exclude node_modules /mnt/d/Dev/clsh/ ~/clsh/"
```
