param([string]$Root = "$env:USERPROFILE\Documents\Codex\personal-file-relay")
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$built = Join-Path $repo 'build\desktop-client'
if (-not(Test-Path -LiteralPath "$built\RelayClient.exe")) { throw 'Run desktop/windows/build.ps1 first.' }
$destination = Join-Path ([IO.Path]::GetFullPath($Root)) 'client'
if(Get-CimInstance Win32_Process -Filter "Name='RelayClient.exe'" | Where-Object { $_.ExecutablePath -eq (Join-Path $destination 'RelayClient.exe') }) { throw 'Please exit the existing relay client from its tray menu before updating.' }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach($name in @('RelayClient.exe','RelayClient.exe.config','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','relay.ico','WebView2-LICENSE.txt','WebView2-NOTICE.txt')) {
    Copy-Item -LiteralPath (Join-Path $built $name) -Destination $destination -Force
}
$shell = New-Object -ComObject WScript.Shell
foreach($folder in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'))) {
    $shortcutPath = Join-Path $folder '中转站.lnk'
    if(Test-Path -LiteralPath $shortcutPath) {
        $existing = $shell.CreateShortcut($shortcutPath)
        if($existing.TargetPath -ne (Join-Path $destination 'RelayClient.exe')) {
            $shortcutPath = Join-Path $folder '中转站（Windows客户端）.lnk'
            if(Test-Path -LiteralPath $shortcutPath) {
                if($shell.CreateShortcut($shortcutPath).TargetPath -ne (Join-Path $destination 'RelayClient.exe')) { throw 'An unrelated shortcut has the same name; no shortcut was overwritten.' }
            }
        }
    }
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $destination 'RelayClient.exe'
    $shortcut.WorkingDirectory = $destination
    $shortcut.IconLocation = (Join-Path $destination 'relay.ico')
    $shortcut.Description = '个人文件和消息中转站'
    $shortcut.Save()
}
Write-Output "Installed: $destination\RelayClient.exe"
Write-Output 'Files, server credentials and server configuration were not changed.'
