$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$version = '1.0.4314.35'
$cache = Join-Path $repo "build\webview2-$version"
$destination = Join-Path $repo 'build\desktop-client'
New-Item -ItemType Directory -Path $cache,$destination -Force | Out-Null
if (-not (Test-Path -LiteralPath "$cache\sdk\lib\net462\Microsoft.Web.WebView2.Core.dll")) {
    Invoke-WebRequest -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile "$cache\package.zip"
    Expand-Archive -LiteralPath "$cache\package.zip" -DestinationPath "$cache\sdk" -Force
}
$libraries = @("$cache\sdk\lib\net462\Microsoft.Web.WebView2.Core.dll","$cache\sdk\lib\net462\Microsoft.Web.WebView2.WinForms.dll","$cache\sdk\runtimes\win-x64\native\WebView2Loader.dll")
foreach($library in $libraries) {
    $signature = Get-AuthenticodeSignature -LiteralPath $library
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notlike '*O=Microsoft Corporation*') { throw "Microsoft SDK signature check failed: $library" }
    Copy-Item -LiteralPath $library -Destination $destination -Force
}
Copy-Item -LiteralPath "$PSScriptRoot\relay.ico" -Destination $destination -Force
Copy-Item -LiteralPath "$PSScriptRoot\RelayClient.exe.config" -Destination $destination -Force
Copy-Item -LiteralPath "$cache\sdk\LICENSE.txt" -Destination "$destination\WebView2-LICENSE.txt" -Force
Copy-Item -LiteralPath "$cache\sdk\NOTICE.txt" -Destination "$destination\WebView2-NOTICE.txt" -Force
$compiler = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $compiler /nologo /codepage:65001 /target:winexe /platform:x64 /optimize+ "/out:$destination\RelayClient.exe" "/win32icon:$PSScriptRoot\relay.ico" "/win32manifest:$PSScriptRoot\app.manifest" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll "/r:$destination\Microsoft.Web.WebView2.Core.dll" "/r:$destination\Microsoft.Web.WebView2.WinForms.dll" "$PSScriptRoot\RelayClient.cs"
if ($LASTEXITCODE -ne 0) { throw 'Windows client compilation failed.' }
$selfTest = Start-Process -FilePath "$destination\RelayClient.exe" -ArgumentList '--self-test' -WindowStyle Hidden -PassThru -Wait
if ($selfTest.ExitCode -ne 0 -or -not (Test-Path "$destination\self-test-result.txt")) { throw 'Windows client self-test failed.' }
Get-Content "$destination\self-test-result.txt"
Write-Output "Client built: $destination\RelayClient.exe"
