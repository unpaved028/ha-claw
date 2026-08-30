# Regenerates ha-claw/logo.png (250x100 wordmark) from ha-claw/icon.png.
#
#   icon.png  128x128, square, real alpha   — do not rebuild from the root JPEG
#   logo.png  250x100, wordmark on navy
#
# The root logo.png is a JPEG in a .png name and has no alpha. Scaling that
# file is what flattened the rounded corners onto white. icon.png is the
# source of truth (corners must stay transparent).
#
# HA presentation guidelines: https://developers.home-assistant.io/docs/add-ons/presentation
# Run from the repository root:  pwsh -File scripts/make-addon-assets.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconIn = Join-Path $root 'ha-claw\icon.png'
$logoOut = Join-Path $root 'ha-claw\logo.png'

if (-not (Test-Path $iconIn)) { throw "Transparent icon not found: $iconIn" }

$icon = [System.Drawing.Bitmap]::FromFile($iconIn)
if ($icon.PixelFormat -notmatch '32bpp') {
    $icon.Dispose()
    throw "icon.png has no alpha channel. Restore the transparent original before generating the wordmark."
}

$bmp = New-Object System.Drawing.Bitmap(250, 100, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
$g.Clear([System.Drawing.Color]::FromArgb(255, 11, 30, 48))
$g.DrawImage($icon, (New-Object System.Drawing.Rectangle(6, 4, 92, 92)))

$font = New-Object System.Drawing.Font('Segoe UI Semibold', 25, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 226, 245, 252))
$g.DrawString('HA-Claw', $font, $brush, 104, 27)

$subFont = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 108, 197, 224))
$g.DrawString('AI home assistant', $subFont, $subBrush, 106, 58)

$font.Dispose(); $brush.Dispose(); $subFont.Dispose(); $subBrush.Dispose()
$g.Dispose()
$bmp.Save($logoOut, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$icon.Dispose()
Write-Output "logo.png  250x100 -> $logoOut"
