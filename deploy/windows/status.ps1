$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'app\filebrowser.exe'
$listener = @(Get-NetTCPConnection -State Listen -LocalPort 18473 -ErrorAction SilentlyContinue | Where-Object LocalAddress -eq '127.0.0.1')
$processes = @($listener | ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue } | Where-Object ProcessName -eq 'filebrowser')
if ($processes.Count) { $processes | Select-Object Id,Path,@{n='WorkingSetMiB';e={[math]::Round($_.WorkingSet64/1MB,1)}},@{n='PrivateMiB';e={[math]::Round($_.PrivateMemorySize64/1MB,1)}} | Format-Table } else { Write-Output 'FileBrowser is stopped.' }
$listener | Select-Object LocalAddress,LocalPort,OwningProcess | Format-Table
Get-ScheduledTask -TaskName 'PersonalFileRelay' -ErrorAction SilentlyContinue | Select-Object TaskName,State | Format-Table
$svc = Get-CimInstance Win32_Service -Filter "Name='Tailscale'" -ErrorAction SilentlyContinue
if ($svc -and $svc.PathName) {
    $daemon = $svc.PathName.Trim('"')
    $ts = Join-Path (Split-Path -Parent $daemon) 'tailscale.exe'
    if (Test-Path -LiteralPath $ts) { & $ts funnel status }
}

