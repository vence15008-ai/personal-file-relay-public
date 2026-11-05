$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'app\filebrowser.exe'
$listener = Get-NetTCPConnection -State Listen -LocalPort 18473 -ErrorAction SilentlyContinue
if ($listener) { Write-Output 'Port 18473 is already in use; check status.'; & "$root\scripts\status.ps1"; exit 1 }
Remove-Item -LiteralPath "$root\data\stop.request" -Force -ErrorAction SilentlyContinue
$task = Get-ScheduledTask -TaskName 'PersonalFileRelay' -ErrorAction SilentlyContinue
if ($task) { Start-ScheduledTask -TaskName 'PersonalFileRelay' } else {
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$root\scripts\supervisor.ps1`"") -WindowStyle Hidden
}
for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:18473/health' -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { & "$root\scripts\status.ps1"; exit 0 }
    } catch { }
}
throw 'FileBrowser did not become healthy within 30 seconds; inspect the task and service-events.log.'

