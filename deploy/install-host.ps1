param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$Root = [IO.Path]::GetFullPath($Root)
if (Test-Path -LiteralPath $Root) { throw 'Choose a new empty installation directory; existing directories are not overwritten.' }
if (-not (Test-Path -LiteralPath "$repo\build\filebrowser.exe")) { throw 'Build the application first.' }
foreach ($folder in @('app','data','files','logs','scripts','backups')) { New-Item -ItemType Directory -Path (Join-Path $Root $folder) -Force | Out-Null }
Copy-Item -LiteralPath "$repo\build\filebrowser.exe" -Destination "$Root\app\filebrowser.exe"
Copy-Item -Path "$PSScriptRoot\windows\*.ps1" -Destination "$Root\scripts"
$filePath = (Join-Path $Root 'files').Replace('\','/').Replace("'","''")
@"
http:
  listen: '127.0.0.1'
  port: 18473
  trustProxyHeaders: true
  disableWebDAV: true
server:
  sources:
    - path: '$filePath'
      name: 'Personal'
      config:
        defaultEnabled: true
        private: true
auth:
  methods:
    password:
      enabled: true
      signup: false
      minLength: 12
"@ | Set-Content -LiteralPath "$Root\data\config.yaml" -Encoding utf8
Write-Output "Installed to $Root. Set your password with scripts\password-dialog.ps1 before registering startup."
