param(
    [ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version = '0.1.1',
    [string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$built = Join-Path $repo 'build/desktop-client'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repo 'build/releases' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$packageName = "PersonalRelay-Client-v$Version-win-x64"
$stage = Join-Path $OutputDirectory $packageName
$zip = Join-Path $OutputDirectory "$packageName.zip"
if ((Test-Path -LiteralPath $stage) -or (Test-Path -LiteralPath $zip)) {
    throw 'Release staging already exists. Choose a fresh output directory; existing files are not overwritten.'
}
$names = @('RelayClient.exe','RelayClient.exe.config','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','relay.ico','WebView2-LICENSE.txt','WebView2-NOTICE.txt')
foreach ($name in $names) {
    if (-not (Test-Path -LiteralPath (Join-Path $built $name) -PathType Leaf)) { throw "Missing built file: $name" }
}
$commit = (& git -C $repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify release source commit.' }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
foreach ($name in $names) { Copy-Item -LiteralPath (Join-Path $built $name) -Destination $stage }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'QUICKSTART.zh-CN.md') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'LICENSE') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'MODIFICATIONS.md') -Destination $stage
@{
    version = $Version
    sourceCommit = $commit
    architecture = 'Windows x64'
    clientSha256 = (Get-FileHash -LiteralPath (Join-Path $stage 'RelayClient.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
    builtWithWebView2Sdk = '1.0.4314.35'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'RELEASE.json') -Encoding UTF8
$internalSums = @(Get-ChildItem -LiteralPath $stage -File | Sort-Object Name | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.Name
})
$internalSums | Set-Content -LiteralPath (Join-Path $stage 'SHA256SUMS-INTERNAL.txt') -Encoding ASCII
Compress-Archive -LiteralPath $stage -DestinationPath $zip
$quickstart = Join-Path $OutputDirectory 'QUICKSTART.zh-CN.md'
Copy-Item -LiteralPath (Join-Path $stage 'QUICKSTART.zh-CN.md') -Destination $quickstart
@($zip, $quickstart) | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant(), [IO.Path]::GetFileName($_)
} | Set-Content -LiteralPath (Join-Path $OutputDirectory 'SHA256SUMS.txt') -Encoding ASCII
Write-Output $zip
