param([string]$Root = "$env:USERPROFILE\Documents\Codex\personal-file-relay")
$ErrorActionPreference = 'Stop'
$resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$client = Join-Path $resolvedRoot 'client'
$exe = Join-Path $client 'RelayClient.exe'
if (-not ([IO.Path]::GetFullPath($client)).StartsWith($resolvedRoot + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid client path.' }
Get-CimInstance Win32_Process -Filter "Name='RelayClient.exe'" | Where-Object { $_.ExecutablePath -eq $exe } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction Stop }
$backup = Join-Path $resolvedRoot ('backups\client-uninstall-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach($name in @('RelayClient.exe','RelayClient.exe.config','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','relay.ico','WebView2-LICENSE.txt','WebView2-NOTICE.txt')) {
    $file = Join-Path $client $name
    if(Test-Path -LiteralPath $file) { Copy-Item -LiteralPath $file -Destination $backup; Remove-Item -LiteralPath $file -Force }
}
$profile = Join-Path $env:LOCALAPPDATA 'PersonalFileRelay\Client'
if(Test-Path -LiteralPath "$profile\settings.json") { Copy-Item -LiteralPath "$profile\settings.json" -Destination $backup }
$shell = New-Object -ComObject WScript.Shell
foreach($folder in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))) {
    foreach($name in @('中转站.lnk','中转站（Windows客户端）.lnk')) {
        $path = Join-Path $folder $name
        if((Test-Path -LiteralPath $path) -and $shell.CreateShortcut($path).TargetPath -eq $exe) { Remove-Item -LiteralPath $path -Force }
    }
}
@"
Client backup: $backup
Restore the client program files and dependencies to: $client
Client settings and WebView2 profile remain in: $profile
The file service, Funnel, Tailscale and all personal files remain unchanged.
"@ | Set-Content -LiteralPath "$backup\RESTORE.txt" -Encoding utf8
Write-Output "Client uninstalled. Backup: $backup"
Write-Output "User profile retained: $profile"
