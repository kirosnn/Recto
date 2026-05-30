param(
  [switch]$SkipTauriBuild,
  [switch]$SkipWebView2Download
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$installerDir = Join-Path $root "build\installer"
$exePath = Join-Path $root "src-tauri\target\release\recto.exe"
$webView2Path = Join-Path $installerDir "MicrosoftEdgeWebView2Setup.exe"
$wizardPath = Join-Path $installerDir "wizard.bmp"
$wizardSmallPath = Join-Path $installerDir "wizard-small.bmp"
$logoPath = Join-Path $root "public\assets\logo.png"
$iconPath = Join-Path $root "src-tauri\icons\icon.png"

New-Item -ItemType Directory -Force -Path $installerDir | Out-Null

function New-WizardBitmap {
  param(
    [string]$OutputPath,
    [int]$Width,
    [int]$Height,
    [string]$SourcePath
  )

  Add-Type -AssemblyName System.Drawing

  $bitmap = New-Object System.Drawing.Bitmap $Width, $Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::FromArgb(15, 23, 42))

  $image = [System.Drawing.Image]::FromFile($SourcePath)
  $maxWidth = [Math]::Floor($Width * 0.72)
  $maxHeight = [Math]::Floor($Height * 0.42)
  $ratio = [Math]::Min($maxWidth / $image.Width, $maxHeight / $image.Height)
  $drawWidth = [Math]::Max(1, [Math]::Floor($image.Width * $ratio))
  $drawHeight = [Math]::Max(1, [Math]::Floor($image.Height * $ratio))
  $x = [Math]::Floor(($Width - $drawWidth) / 2)
  $y = [Math]::Floor(($Height - $drawHeight) / 2)

  $graphics.DrawImage($image, $x, $y, $drawWidth, $drawHeight)
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)

  $image.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-WizardBitmap -OutputPath $wizardPath -Width 164 -Height 314 -SourcePath $logoPath
New-WizardBitmap -OutputPath $wizardSmallPath -Width 55 -Height 58 -SourcePath $iconPath

if (-not $SkipWebView2Download -and -not (Test-Path $webView2Path)) {
  Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $webView2Path
}

if (-not (Test-Path $webView2Path)) {
  throw "MicrosoftEdgeWebView2Setup.exe est manquant dans build\installer."
}

if (-not $SkipTauriBuild) {
  npm run tauri -- build
}

if (-not (Test-Path $exePath)) {
  throw "recto.exe est introuvable. Lance npm run tauri -- build ou relance ce script sans -SkipTauriBuild."
}

$iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue

if (-not $iscc) {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 7\ISCC.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 7\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
  )

  $isccPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

  if (-not $isccPath) {
    throw "ISCC.exe est introuvable. Installe Inno Setup 7 ou ajoute ISCC.exe au PATH."
  }
} else {
  $isccPath = $iscc.Source
}

& $isccPath (Join-Path $root "recto.iss")

if ($LASTEXITCODE -ne 0) {
  throw "La compilation Inno Setup a échoué."
}

Get-ChildItem $installerDir -Filter "Recto-*-Setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
