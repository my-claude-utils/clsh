# clsh one-click startup for Windows
Set-Location $PSScriptRoot

# Resize terminal window for optimal QR code display
if ($Host.Name -eq 'ConsoleHost') {
    $Host.UI.RawUI.WindowSize = New-Object System.Management.Automation.Host.Size(120, 50)
    $Host.UI.RawUI.BufferSize = New-Object System.Management.Automation.Host.Size(120, 1000)
}

# Use Node 22 from fnm
$nodeBin = "C:\Users\Chris\AppData\Roaming\fnm\node-versions\v22.22.1\installation"
$env:PATH = "$nodeBin;$env:PATH"

# Verify Node version
Write-Host "Using Node: $(node --version)"

# Force Tailscale tunnel
$env:TUNNEL = "tailscale"
$env:WEB_PORT = "4031"

# Reinstall native modules if needed (first run only)
if (-not (Test-Path "node_modules\.win22")) {
    Write-Host "Rebuilding native modules for Node 22 on Windows..."
    if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" }
    npm install
    New-Item -ItemType File -Path "node_modules\.win22" -Force | Out-Null
}

# Start web server in background
Start-Process -WindowStyle Minimized -FilePath "cmd" -ArgumentList "/c `"set PATH=$nodeBin;%PATH% && npm run dev --workspace=@clsh/web -- --port 4031`""

# Start agent in foreground (shows QR code)
npm run dev --workspace=@clsh/agent
