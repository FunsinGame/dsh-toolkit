#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Register dsh-notes as a Windows scheduled task that starts at boot.

.NOTES
  A dedicated service account is preferred. This helper defaults to SYSTEM for
  a simple installation; if you use a named account, grant it "Log on as a
  service" and ACL rights on the data directory. NSSM/WinSW are also supported
  and give better restart/logging behavior.

  After installing, create the account and token locally:
    node server\bin.js user add alice --data-dir C:\ProgramData\dsh-notes
    node server\bin.js token create --user alice --name dsh-plugin --data-dir C:\ProgramData\dsh-notes

  Then expose only 443 through Caddy/WinSW; never open 8787 on the firewall.
#>
param(
  [string]$TaskName = 'dsh-notes',
  [string]$User = 'SYSTEM',
  [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$DataDir = 'C:\ProgramData\dsh-notes'
)

$ErrorActionPreference = 'Stop'
$start = Join-Path $PSScriptRoot 'start-server.cmd'
if (-not (Test-Path $start)) { throw "start script not found: $start" }
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DataDir 'logs') | Out-Null

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$start`"" -WorkingDirectory $AppDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Registered scheduled task '$TaskName' as $User."
Write-Host "Data: $DataDir"
Write-Host "Create an account/token with the CLI, then start the task:"
Write-Host "  Start-ScheduledTask -TaskName $TaskName"
Write-Host "Remember: bind 127.0.0.1 and expose HTTPS through Caddy; do not open 8787."
