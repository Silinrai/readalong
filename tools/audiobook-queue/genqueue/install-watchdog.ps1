# Registers the Windows task "Readalong voicing watchdog": runs watchdog.ps1 at
# logon and every 10 minutes, so voicing keeps going without anyone watching.
#   powershell -ExecutionPolicy Bypass -File genqueue\install-watchdog.ps1 -VoiceStudio "C:\...\VoiceStudio.exe"
# Remove it with: Unregister-ScheduledTask -TaskName 'Readalong voicing watchdog'
param([string]$VoiceStudio = '')
$script = Join-Path $PSScriptRoot 'watchdog.ps1'
$taskArgs = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
if ($VoiceStudio) { $taskArgs += " -VoiceStudio `"$VoiceStudio`"" }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgs
$logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$every = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Readalong voicing watchdog' -Force `
    -Description "Keeps VoiceStudio and the Readalong audiobook queue running. Script: $script" `
    -Action $action -Trigger $logon, $every -Settings $settings -Principal $principal | Out-Null
"Registered 'Readalong voicing watchdog' ($script)"
