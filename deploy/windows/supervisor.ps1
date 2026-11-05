$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $root 'logs\service-events.log'
$stopFile = Join-Path $root 'data\stop.request'
function Log-Event([string]$message) {
    if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 1MB) {
        Move-Item -LiteralPath $log -Destination "$log.old" -Force
    }
    Add-Content -LiteralPath $log -Value ("{0} {1}" -f (Get-Date -Format o), $message)
}
Set-Location (Join-Path $root 'data')
if (-not (Test-Path -LiteralPath 'filebrowser.sqlite')) { Log-Event 'Database missing; refusing to bootstrap.'; exit 1 }
$executable = Join-Path $root 'app\filebrowser.exe'
while ($true) {
    if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile -Force; Log-Event 'Stop requested.'; exit 0 }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $executable
    $info.Arguments = '-c config.yaml'
    $info.WorkingDirectory = Join-Path $root 'data'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.EnvironmentVariables.Remove('FILEBROWSER_ADMIN_PASSWORD')
    try {
        $child = [System.Diagnostics.Process]::Start($info)
        $child.BeginOutputReadLine(); $child.BeginErrorReadLine()
        Log-Event "Started FileBrowser PID $($child.Id)."
        while (-not $child.WaitForExit(1000)) {
            if (Test-Path -LiteralPath $stopFile) {
                $child.Kill()
                $child.WaitForExit()
                Remove-Item -LiteralPath $stopFile -Force
                Log-Event 'Stop requested; FileBrowser stopped.'
                exit 0
            }
        }
        Log-Event "FileBrowser PID $($child.Id) exited with code $($child.ExitCode); retrying in 10 seconds."
    } catch { Log-Event 'Failed to start FileBrowser; retrying in 10 seconds.' }
    Start-Sleep -Seconds 10
}

