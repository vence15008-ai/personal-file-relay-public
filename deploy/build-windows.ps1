$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location (Join-Path $repo 'frontend')
try {
    npm ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    npx vitest run src/views/TextRelay.test.js
    if ($LASTEXITCODE -ne 0) { throw 'Chat tests failed.' }
    npx vite build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally { Pop-Location }
New-Item -ItemType Directory -Path "$repo\backend\internal\web\embed" -Force | Out-Null
Copy-Item -Path "$repo\backend\internal\web\dist\*" -Destination "$repo\backend\internal\web\embed" -Recurse -Force
New-Item -ItemType Directory -Path "$repo\build" -Force | Out-Null
$env:CGO_ENABLED = '0'
Push-Location "$repo\backend"
try {
    go test ./internal/icons
    if ($LASTEXITCODE -ne 0) { throw 'PWA manifest tests failed.' }
    go build -o "$repo\build\filebrowser.exe" -ldflags '-s -w -X github.com/gtsteffaniak/filebrowser/backend/internal/version.Version=v2.0.2-stable+personal-chat' .
    if ($LASTEXITCODE -ne 0) { throw 'Backend build failed. Use Go 1.27 or later and check GOROOT.' }
} finally { Pop-Location }
