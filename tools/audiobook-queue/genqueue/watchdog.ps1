# Keeps audiobook voicing running without Claude: run by the Windows task
# "Readalong voicing watchdog" at logon and every 10 minutes.
# Starts VoiceStudio if it isn't running, and the queue service if it doesn't
# answer. It never stops anything, so it can't interrupt work in progress.
#
# Register it (once) with, from the tool folder:
#   powershell -ExecutionPolicy Bypass -File genqueue\install-watchdog.ps1 -VoiceStudio "<path to VoiceStudio.exe>"
param([string]$VoiceStudio = '')
$ErrorActionPreference = 'Continue'
$poc = Split-Path $PSScriptRoot          # the tool folder (holds genqueue\)
$data = Join-Path $poc 'queue_data'
$python = @((Join-Path $poc '.venv\Scripts\python.exe'), (Join-Path $poc '..\.venv\Scripts\python.exe')) |
    Where-Object { Test-Path $_ } | Select-Object -First 1
New-Item -ItemType Directory -Force $data | Out-Null
$log = Join-Path $data 'watchdog.log'

function Write-Log([string]$msg) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Out-File -FilePath $log -Append -Encoding utf8
}

function Test-Url([string]$url) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
        return $r.StatusCode -eq 200
    } catch { return $false }
}

# VoiceStudio: start the app if no copy is running. Loading takes a minute or
# two; the queue waits for it by itself ("Waiting for VoiceStudio").
if (-not (Get-Process -Name 'VoiceStudio' -ErrorAction SilentlyContinue)) {
    if ($VoiceStudio -and (Test-Path $VoiceStudio)) {
        Write-Log 'VoiceStudio not running: starting it'
        Start-Process -FilePath $VoiceStudio -WindowStyle Minimized
    } else {
        Write-Log 'VoiceStudio not running and no -VoiceStudio path given: start it yourself'
    }
}

# Queue service: /api/health answers without the pairing code.
if (-not (Test-Url 'http://127.0.0.1:3910/api/health')) {
    $running = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
        Where-Object { $_.CommandLine -match 'genqueue serve' }
    if ($running) {
        # Busy or starting up: give it until the next check.
        Write-Log "queue not answering but its process is alive (pid $($running[0].ProcessId)): leaving it"
    } else {
        Write-Log 'queue service not running: starting it'
        Start-Process -FilePath $python `
            -ArgumentList '-u', '-m', 'genqueue', 'serve', '--host', '127.0.0.1' `
            -WorkingDirectory $poc -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $data "service.log") `
            -RedirectStandardError (Join-Path $data "service.err.log")
    }
}

# Tailscale forwarding for the phone (kept by tailscaled across reboots, but
# cheap to check).
$ts = 'C:\Program Files\Tailscale\tailscale.exe'
if (Test-Path $ts) {
    $status = & $ts serve status 2>&1 | Out-String
    if ($status -notmatch '3910') {
        Write-Log 'tailscale serve for 3910 missing: adding it'
        & $ts serve --bg --http 3910 http://127.0.0.1:3910 | Out-Null
    }
}
