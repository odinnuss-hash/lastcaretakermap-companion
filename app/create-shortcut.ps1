# Legt auf dem Desktop eine Verknuepfung "Last Caretaker Map" mit Karten-Symbol an.
$ErrorActionPreference = 'Stop'
$root    = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk     = Join-Path $desktop 'Last Caretaker Map.lnk'

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnk)
$sc.TargetPath       = Join-Path $root 'start.bat'
$sc.WorkingDirectory = $root
$sc.IconLocation     = (Join-Path $root 'app\icon.ico') + ',0'
$sc.WindowStyle      = 7   # minimiert
$sc.Description      = 'The Last Caretaker Map'
$sc.Save()

Write-Host ''
Write-Host "Verknuepfung angelegt: $lnk"
Write-Host 'Du kannst sie auch an die Taskleiste oder ins Startmenue anheften.'
