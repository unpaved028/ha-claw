# Generates the Home Assistant add-on store assets from the master artwork.
#
#   icon.png  128x128, square      (shown next to the add-on name)
#   logo.png  250x100, wordmark    (shown on the add-on detail page)
#
# HA's presentation guidelines: https://developers.home-assistant.io/docs/add-ons/presentation
# Run from the repository root:  pwsh -File scripts/make-addon-assets.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'logo.png'
$iconOut = Join-Path $root 'ha-claw\icon.png'
$logoOut = Join-Path $root 'ha-claw\logo.png'

if (-not (Test-Path $source)) { throw "Master artwork not found: $source" }

$master = [System.Drawing.Image]::FromFile($source)

function New-Canvas($width, $height) {
    $bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    return @{ Bitmap = $bmp; Graphics = $g }
}

# ── icon.png ──────────────────────────────────────────────────
$icon = New-Canvas 128 128
$icon.Graphics.DrawImage($master, (New-Object System.Drawing.Rectangle(0, 0, 128, 128)))
$icon.Graphics.Dispose()
$icon.Bitmap.Save($iconOut, [System.Drawing.Imaging.ImageFormat]::Png)
$icon.Bitmap.Dispose()
Write-Output "icon.png  128x128  -> $iconOut"

# ── logo.png ──────────────────────────────────────────────────
# The master art is square, so stretching it to 250x100 would distort it. Place it at
# 92x92 on the left and set the product name beside it on the artwork's own background.
$logo = New-Canvas 250 100
$bg = [System.Drawing.Color]::FromArgb(255, 11, 30, 48)
$logo.Graphics.Clear($bg)
$logo.Graphics.DrawImage($master, (New-Object System.Drawing.Rectangle(6, 4, 92, 92)))

$font = New-Object System.Drawing.Font('Segoe UI Semibold', 25, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 226, 245, 252))
$logo.Graphics.DrawString('HA-Claw', $font, $brush, 104, 27)

$subFont = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 108, 197, 224))
$logo.Graphics.DrawString('AI home assistant', $subFont, $subBrush, 106, 58)

$font.Dispose(); $brush.Dispose(); $subFont.Dispose(); $subBrush.Dispose()
$logo.Graphics.Dispose()
$logo.Bitmap.Save($logoOut, [System.Drawing.Imaging.ImageFormat]::Png)
$logo.Bitmap.Dispose()
Write-Output "logo.png  250x100 -> $logoOut"

$master.Dispose()
