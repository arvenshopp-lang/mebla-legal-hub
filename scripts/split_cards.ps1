Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\public\images\payments\visa-mastercard.png"
$fullPath = [System.IO.Path]::GetFullPath($srcPath)
$img = [System.Drawing.Image]::FromFile($fullPath)

[int]$w = $img.Width
[int]$h = $img.Height
[int]$halfW = [math]::Floor($w / 2)
[int]$mcW = $w - $halfW

Write-Host "Image size: $w x $h"

# Visa
$cropVisa = New-Object System.Drawing.Rectangle(0, 0, $halfW, $h)
$bmpVisa = New-Object System.Drawing.Bitmap $halfW, $h
$gVisa = [System.Drawing.Graphics]::FromImage($bmpVisa)
$gVisa.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $halfW, $h)), $cropVisa, [System.Drawing.GraphicsUnit]::Pixel)
$visaOut = Join-Path $PSScriptRoot "..\public\images\payments\visa.png"
$bmpVisa.Save($visaOut, [System.Drawing.Imaging.ImageFormat]::Png)
$gVisa.Dispose()
$bmpVisa.Dispose()

# Mastercard
$cropMc = New-Object System.Drawing.Rectangle($halfW, 0, $mcW, $h)
$bmpMc = New-Object System.Drawing.Bitmap $mcW, $h
$gMc = [System.Drawing.Graphics]::FromImage($bmpMc)
$gMc.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $mcW, $h)), $cropMc, [System.Drawing.GraphicsUnit]::Pixel)
$mcOut = Join-Path $PSScriptRoot "..\public\images\payments\mastercard.png"
$bmpMc.Save($mcOut, [System.Drawing.Imaging.ImageFormat]::Png)
$gMc.Dispose()
$bmpMc.Dispose()

$img.Dispose()

Write-Host "Successfully generated visa.png and mastercard.png!"
