$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stopFile = Join-Path $root 'data\stop.request'
$listener = Get-NetTCPConnection -State Listen -LocalPort 18473 -ErrorAction SilentlyContinue
$task = Get-ScheduledTask -TaskName 'PersonalFileRelay' -ErrorAction SilentlyContinue
if (-not $listener -and (-not $task -or $task.State -ne 'Running')) { Write-Output 'FileBrowser is already stopped.'; exit 0 }
New-Item -ItemType File -Path $stopFile -Force | Out-Null
for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    $task = Get-ScheduledTask -TaskName 'PersonalFileRelay' -ErrorAction SilentlyContinue
    if ((-not $task -or $task.State -ne 'Running') -and -not (Get-NetTCPConnection -State Listen -LocalPort 18473 -ErrorAction SilentlyContinue)) {
        Write-Output 'FileBrowser stopped; startup task remains configured.'
        exit 0
    }
}
throw 'Service did not stop through its supervisor. No unrelated process was terminated.'

