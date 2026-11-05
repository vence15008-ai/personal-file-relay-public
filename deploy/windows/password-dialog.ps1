$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$db = Join-Path $root 'data\filebrowser.sqlite'
if (Test-Path -LiteralPath $db) {
    [System.Windows.Forms.MessageBox]::Show('A database already exists. Setup will not change it.', 'FileBrowser setup') | Out-Null
    exit 1
}
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Personal file relay: initial password'
$form.Size = New-Object System.Drawing.Size(460, 220)
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$label = New-Object System.Windows.Forms.Label
$label.Text = 'Enter a password of at least 12 characters twice.'
$label.Location = New-Object System.Drawing.Point(20, 20)
$label.AutoSize = $true
$form.Controls.Add($label)
$first = New-Object System.Windows.Forms.TextBox
$first.Location = New-Object System.Drawing.Point(20, 55)
$first.Width = 390
$first.UseSystemPasswordChar = $true
$form.Controls.Add($first)
$second = New-Object System.Windows.Forms.TextBox
$second.Location = New-Object System.Drawing.Point(20, 90)
$second.Width = 390
$second.UseSystemPasswordChar = $true
$form.Controls.Add($second)
$ok = New-Object System.Windows.Forms.Button
$ok.Text = 'Initialize'
$ok.Location = New-Object System.Drawing.Point(20, 130)
$ok.Width = 110
$form.Controls.Add($ok)
$form.AcceptButton = $ok
$ok.Add_Click({
    if ($first.Text.Length -lt 12 -or $first.Text -cne $second.Text) {
        [System.Windows.Forms.MessageBox]::Show('Passwords must match and be at least 12 characters.', 'FileBrowser setup') | Out-Null
        return
    }
    $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Close()
})
if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }
try {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $root 'app\filebrowser.exe'
    $start.Arguments = '-c config.yaml'
    $start.WorkingDirectory = Join-Path $root 'data'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.EnvironmentVariables['FILEBROWSER_ADMIN_PASSWORD'] = $first.Text
    $first.Clear(); $second.Clear()
    $process = [System.Diagnostics.Process]::Start($start)
    $start.EnvironmentVariables.Remove('FILEBROWSER_ADMIN_PASSWORD')
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()
    Start-Sleep -Seconds 5
    if ($process.HasExited) {
        [System.Windows.Forms.MessageBox]::Show('Initialization did not start. Return to Codex for diagnosis.', 'FileBrowser setup') | Out-Null
        exit 1
    }
    [System.Windows.Forms.MessageBox]::Show('Initialization started. Return to Codex and say it is complete.', 'FileBrowser setup') | Out-Null
    while (-not $process.WaitForExit(1000)) { if (Test-Path -LiteralPath "$root\data\stop.request") { $process.Kill(); $process.WaitForExit(); Remove-Item -LiteralPath "$root\data\stop.request" -Force; break } }
} catch {
    [System.Windows.Forms.MessageBox]::Show('Setup encountered an error. Return to Codex for diagnosis.', 'FileBrowser setup') | Out-Null
    exit 1
} finally {
    $first.Clear(); $second.Clear(); $form.Dispose()
}


