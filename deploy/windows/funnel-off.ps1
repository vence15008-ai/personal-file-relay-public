$ErrorActionPreference = 'Stop'
$svc = Get-CimInstance Win32_Service -Filter "Name='Tailscale'" -ErrorAction Stop
$daemon = $svc.PathName.Trim('"')
$ts = Join-Path (Split-Path -Parent $daemon) 'tailscale.exe'
if (-not (Test-Path -LiteralPath $ts)) { throw 'Tailscale CLI was not found next to the installed service.' }
$status = (& $ts funnel status --json | Out-String | ConvertFrom-Json)
if (-not $status.Web) { Write-Output 'No Funnel web handlers are configured.'; exit 0 }
$targets = @()
foreach ($web in $status.Web.PSObject.Properties) {
    $handlers = $web.Value.Handlers
    if ($handlers) {
        $root = $handlers.PSObject.Properties['/']
        if ($root -and $root.Value.Proxy -match '^http://127\.0\.0\.1:18473/?$') { $targets += $web }
    }
}
if ($targets.Count -eq 0) { Write-Output 'No matching personal file relay Funnel was found; no configuration changed.'; exit 0 }
if ($targets.Count -ne 1 -or $targets[0].Name -notmatch ':443$') { throw 'Unexpected Funnel configuration; inspect it manually before making changes.' }
& $ts funnel --https=443 --set-path=/ off
if ($LASTEXITCODE -ne 0) { throw 'Tailscale rejected the removal.' }
$after = (& $ts funnel status --json | Out-String | ConvertFrom-Json)
if ($after.Web) {
    foreach ($web in $after.Web.PSObject.Properties) {
        if (-not $web.Value.Handlers) { continue }
        $handler = $web.Value.Handlers.PSObject.Properties['/']
        if ($handler -and $handler.Value.Proxy -match '^http://127\.0\.0\.1:18473/?$') { throw 'The target handler is still present.' }
    }
}
Write-Output 'Personal file relay Funnel removed.'

