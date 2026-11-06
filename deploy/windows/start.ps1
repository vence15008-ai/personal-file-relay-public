$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'app\filebrowser.exe'
$listener = Get-NetTCPConnection -State Listen -LocalPort 18473 -ErrorAction SilentlyContinue
if ($listener) { Write-Output 'Port 18473 is already in use; check status.'; & "$root\scripts\status.ps1"; exit 1 }
Remove-Item -LiteralPath "$root\data\stop.request" -Force -ErrorAction SilentlyContinue
$task = Get-ScheduledTask -TaskName 'PersonalFileRelay' -ErrorAction SilentlyContinue
if ($task) {
    $expectedScript = Join-Path $root 'scripts\supervisor.ps1'
    if ($task.Actions.Count -ne 1 -or $task.Actions[0].Arguments.IndexOf($expectedScript, [StringComparison]::OrdinalIgnoreCase) -lt 0) { throw 'Relay task points to a different installation; it was not started.' }
    Start-ScheduledTask -TaskName 'PersonalFileRelay'
} else {
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$root\scripts\supervisor.ps1`"") -WindowStyle Hidden
}
for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:18473/health' -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { & "$root\scripts\status.ps1"; exit 0 }
    } catch { }
    # A stale IgnoreNew instance can accept a CIM start without launching an action.
    # Recover only this project's stopped task, after confirming there is no listener.
    if ($i -eq 8 -and $task -and -not (Get-NetTCPConnection -State Listen -LocalPort 18473 -ErrorAction SilentlyContinue)) {
        $current = Get-ScheduledTask -TaskName 'PersonalFileRelay'
        if ($current.State -eq 'Ready') {
            $expectedScript = Join-Path $root 'scripts\supervisor.ps1'
            if ($current.Actions.Count -ne 1 -or $current.Actions[0].Arguments.IndexOf($expectedScript, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
                throw 'Relay task points to a different installation; it was not changed.'
            }
            Stop-ScheduledTask -TaskName 'PersonalFileRelay'
            $scheduler = New-Object -ComObject Schedule.Service
            $scheduler.Connect()
            $registered = $scheduler.GetFolder($current.TaskPath).GetTask($current.TaskName)
            # Explicit on-demand start only; saved triggers, privileges and power policies are unchanged.
            $null = $registered.RunEx($null, 2, 0, $null)
        }
    }
}
throw 'FileBrowser did not become healthy within 30 seconds; inspect the task and service-events.log.'
