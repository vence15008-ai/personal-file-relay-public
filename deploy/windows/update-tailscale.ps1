param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$service = Get-CimInstance Win32_Service -Filter "Name='Tailscale'" -ErrorAction Stop
$ts = Join-Path (Split-Path -Parent $service.PathName.Trim('"')) 'tailscale.exe'
if (-not (Test-Path -LiteralPath $ts)) { throw 'Tailscale CLI not found.' }
if ($CheckOnly) { & $ts update --dry-run --track stable }
else { & $ts update --track stable }
if ($LASTEXITCODE -ne 0) { throw "Tailscale update failed with exit code $LASTEXITCODE." }

