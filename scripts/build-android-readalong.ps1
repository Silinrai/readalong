# Readalong: build an installable arm64 APK (Galaxy Z Fold 7 and other phones).
#
# Needs, once: Visual Studio 2022 Build Tools (C++ workload), Rust (rustup),
# Temurin JDK 17, and in Android Studio > SDK Manager > SDK Tools:
# "Android SDK Command-line Tools" and "NDK (Side by side)". See READALONG.md.
#
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File app\scripts\build-android-readalong.ps1
# Output: app\dist\Readalong-arm64.apk
# -Devtools: a debugging build whose WebView Chrome DevTools can inspect over
# USB (chrome://inspect). For testing on a phone only; never give it out.

param([switch]$Devtools)

$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$web = Join-Path $appRoot 'apps\readalong-app'
$gen = Join-Path $web 'src-tauri\gen\android'

function Find-First($paths) { foreach ($p in $paths) { if ($p -and (Test-Path $p)) { return (Resolve-Path $p).Path } } return $null }

# --- toolchain -------------------------------------------------------------
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Rust is not installed (winget install Rustlang.Rustup).' }

$jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $jdk) { throw 'JDK 17 not found (winget install EclipseAdoptium.Temurin.17.JDK).' }
$env:JAVA_HOME = $jdk.FullName

$sdk = Find-First @($env:ANDROID_HOME, "$env:LOCALAPPDATA\Android\Sdk")
if (-not $sdk) { throw 'Android SDK not found.' }
$env:ANDROID_HOME = $sdk
$ndk = Get-ChildItem (Join-Path $sdk 'ndk') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $ndk) { throw 'Android NDK not found (Android Studio > SDK Manager > SDK Tools > NDK).' }
$env:NDK_HOME = $ndk.FullName
Write-Host "JDK  $env:JAVA_HOME`nSDK  $env:ANDROID_HOME`nNDK  $env:NDK_HOME"

rustup target add aarch64-linux-android
if ($LASTEXITCODE) { throw 'rustup target add failed' }

$pnpm = @('npx', '-y', 'pnpm@11.1.1')
Push-Location $web
try {
  & $pnpm[0] $pnpm[1..2] install
  if ($LASTEXITCODE) { throw 'pnpm install failed' }

  # --- Android project ----------------------------------------------------
  # The repo tracks only Readalong's customised files under gen/android; `tauri
  # android init` creates the rest. Keep the tracked files across init.
  if (-not (Test-Path (Join-Path $gen 'gradlew'))) {
    $keep = Join-Path $env:TEMP 'readalong-gen-android'
    if (Test-Path $keep) { Remove-Item $keep -Recurse -Force }
    Copy-Item $gen $keep -Recurse
    & $pnpm[0] $pnpm[1..2] tauri android init
    if ($LASTEXITCODE) { throw 'tauri android init failed' }
    # Launcher icons (as Readalong's CI does). `tauri icon` also rewrites the
    # tracked desktop icons, so put those back.
    & $pnpm[0] $pnpm[1..2] tauri icon ../../data/icons/readalong-book.png
    if ($LASTEXITCODE) { throw 'tauri icon failed' }
    git -C $appRoot checkout -- apps/readalong-app/src-tauri/icons
    Copy-Item (Join-Path $keep '*') $gen -Recurse -Force
  }

  # --- Readalong icons (launcher, themed icon, startup screen) -------------
  # gen/android isn't in git, so write them on every build from data/icons.
  $py = (Get-Command python -ErrorAction SilentlyContinue).Source
  if ($py) {
    & $py (Join-Path $appRoot 'scriptsndroid-icons.py')
    if ($LASTEXITCODE) { Write-Warning 'android-icons.py failed (pip install pillow); keeping the icons already there' }
  } else {
    Write-Warning 'Python not found: Readalong icons not refreshed (needs Python with Pillow)'
  }

  # --- signing (a local key, kept outside the repo) ------------------------
  $props = Join-Path $gen 'keystore.properties'
  if (-not (Test-Path $props)) {
    $keyDir = Join-Path $env:USERPROFILE '.readalong'
    New-Item -ItemType Directory -Force $keyDir | Out-Null
    $store = Join-Path $keyDir 'readalong-release.jks'
    $passFile = Join-Path $keyDir 'keystore-password.txt'
    if (-not (Test-Path $store)) {
      # A CSPRNG (Get-Random is not one, and -Count never repeats a character).
      # Rejection sampling keeps all 62 characters equally likely.
      $alphabet = [char[]]((48..57) + (65..90) + (97..122))
      $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
      $buf = New-Object byte[] 1
      $chars = New-Object System.Collections.Generic.List[char]
      while ($chars.Count -lt 32) {
        $rng.GetBytes($buf)
        if ($buf[0] -lt 248) { $chars.Add($alphabet[$buf[0] % 62]) }
      }
      $rng.Dispose()
      $pass = -join $chars
      Set-Content -Path $passFile -Value $pass -NoNewline
      & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -keystore $store -alias readalong `
        -keyalg RSA -keysize 2048 -validity 10000 -storepass $pass -keypass $pass `
        -dname 'CN=Readalong, O=Personal'
      if ($LASTEXITCODE) { throw 'keytool failed' }
    }
    $pass = Get-Content $passFile -Raw
    @("keyAlias=readalong", "password=$pass", "storeFile=$($store -replace '\\', '/')") | Set-Content $props
    Write-Host "Signing key: $store (back it up: updates must be signed with the same key)"
  }

  # --- build ---------------------------------------------------------------
  $started = Get-Date
  $cargoArgs = if ($Devtools) { @('--', '--features', 'devtools') } else { @() }
  & $pnpm[0] $pnpm[1..2] tauri android build -t aarch64 --apk @cargoArgs
  if ($LASTEXITCODE) {
    # Tauri symlinks the Rust library into the Android project, which Windows
    # only allows in Developer Mode. If the library was built, copy it in and
    # run the Android packaging step ourselves.
    $lib = Join-Path $appRoot 'target\aarch64-linux-android\release\libreadalonglib.so'
    if (-not (Test-Path $lib) -or (Get-Item $lib).LastWriteTime -lt $started) { throw 'tauri android build failed' }
    Write-Host 'tauri could not link the library (no Developer Mode?); packaging with Gradle directly'
    $jni = Join-Path $gen 'app\src\main\jniLibs\arm64-v8a'
    New-Item -ItemType Directory -Force $jni | Out-Null
    Copy-Item $lib $jni -Force
    Push-Location $gen
    try {
      .\gradlew.bat --no-daemon assembleUniversalRelease -PabiList=arm64-v8a -ParchList=arm64 `
        -PtargetList=aarch64 -x rustBuildArm64Release -x rustBuildUniversalRelease
      if ($LASTEXITCODE) { throw 'gradle assembleUniversalRelease failed' }
    } finally { Pop-Location }
  }

  $apk = Get-ChildItem (Join-Path $gen 'app\build\outputs\apk') -Recurse -Filter '*.apk' |
    Where-Object { $_.Name -notmatch 'unsigned' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $apk) { throw 'No signed APK found under gen/android/app/build/outputs/apk' }
  $dist = Join-Path $appRoot 'dist'
  New-Item -ItemType Directory -Force $dist | Out-Null
  $out = Join-Path $dist 'Readalong-arm64.apk'
  Copy-Item $apk.FullName $out -Force
  Write-Host "`nAPK: $out"
} finally {
  Pop-Location
}
