$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
& "$root\scripts\funnel-off.ps1"
& "$root\scripts\stop.ps1"
$backup = Join-Path $root ('backups\uninstall-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item -LiteralPath "$root\data\config.yaml" -Destination $backup
Get-ChildItem -LiteralPath "$root\data" -Filter 'filebrowser.sqlite*' -File | Copy-Item -Destination $backup
Copy-Item -LiteralPath "$root\app\filebrowser.exe" -Destination $backup
$task = Get-ScheduledTask -TaskName 'PersonalFileRelay' -ErrorAction SilentlyContinue
if ($task) {
    Export-ScheduledTask -TaskName 'PersonalFileRelay' | Set-Content -LiteralPath "$backup\task.xml" -Encoding utf8
    try { Unregister-ScheduledTask -TaskName 'PersonalFileRelay' -Confirm:$false -ErrorAction Stop }
    catch { throw "Backup made at $backup, but task removal failed. Run this script as Administrator. $($_.Exception.Message)" }
}
Remove-Item -LiteralPath "$root\app\filebrowser.exe" -ErrorAction Stop
Write-Output "FileBrowser removed. Your files, configuration, recovery scripts and backup remain in $root. Backup: $backup. Tailscale remains installed."

