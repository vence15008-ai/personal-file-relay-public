$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalToken = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principalToken.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this registration script as Administrator.' }
if (Get-ScheduledTask -TaskName 'PersonalFileRelay' -ErrorAction SilentlyContinue) { throw 'PersonalFileRelay already exists; refusing to replace it.' }
$owner = (Get-Acl -LiteralPath $root).Owner
$principal = New-ScheduledTaskPrincipal -UserId $owner -LogonType S4U -RunLevel Limited
$trigger = New-ScheduledTaskTrigger -AtStartup
$action = New-ScheduledTaskAction -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$root\scripts\supervisor.ps1`"" -WorkingDirectory "$root\data"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit ([timespan]::Zero) -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'PersonalFileRelay' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Personal file relay loopback service'
Write-Output 'Registered. Start the task and verify it runs before relying on startup.'

