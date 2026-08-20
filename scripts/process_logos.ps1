Add-Type -AssemblyName System.Drawing

$src1 = "C:/Users/x4iii/.gemini/antigravity/brain/fe00ceeb-09bc-4c50-893c-d2c7c32c86d3/.user_uploaded/media_1787230457800.png" # mada
$src2 = "C:/Users/x4iii/.gemini/antigravity/brain/fe00ceeb-09bc-4c50-893c-d2c7c32c86d3/.user_uploaded/media_1787230474171.png" # apple-pay
$src3 = "C:/Users/x4iii/.gemini/antigravity/brain/fe00ceeb-09bc-4c50-893c-d2c7c32c86d3/.user_uploaded/media_1787230502202.png" # visa-mastercard
$src4 = "C:/Users/x4iii/.gemini/antigravity/brain/fe00ceeb-09bc-4c50-893c-d2c7c32c86d3/.user_uploaded/media_1787230629530.png" # samsung

function Auto-Crop([string]$inPath, [string]$outPath, [int]$cropLeftRatio = 0, [int]$cropRightRatio = 100) {
    $img = [System.Drawing.Bitmap]::FromFile([System.IO.Path]::GetFullPath($inPath))
    [int]$w = $img.Width
    [int]$h = $img.Height
    
    [int]$startCol = [int]($w * ($cropLeftRatio / 100.0))
    [int]$endCol = [int]($w * ($cropRightRatio / 100.0))
    
    # Find bounding box
    [int]$minX = $endCol
    [int]$maxX = $startCol
    [int]$minY = $h
    [int]$maxY = 0
    
    for ($y = 0; $y -lt $h; $y++) {
        for ($x = $startCol; $x -lt $endCol; $x++) {
            $pixel = $img.GetPixel($x, $y)
            # Not white and not transparent
            if ($pixel.A -gt 20 -and ($pixel.R -lt 245 -or $pixel.G -lt 245 -or $pixel.B -lt 245)) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    
    if ($minX -ge $maxX -or $minY -ge $maxY) {
        Write-Host "Warning: empty crop for $inPath"
        $minX = $startCol
        $maxX = $endCol - 1
        $minY = 0
        $maxY = $h - 1
    }
    
    # Add a small 2% padding
    [int]$cropW = $maxX - $minX + 1
    [int]$cropH = $maxY - $minY + 1
    
    $cropRect = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
    $destBmp = New-Object System.Drawing.Bitmap($cropW, $cropH)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $cropW, $cropH)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
    
    $destBmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $destBmp.Dispose()
    $img.Dispose()
    
    Write-Host "Saved $outPath ($cropW x $cropH)"
}

$outDir = Join-Path $PSScriptRoot "..\public\images\payments"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force }

Auto-Crop $src1 (Join-Path $outDir "mada.png") 0 100
Auto-Crop $src2 (Join-Path $outDir "apple-pay.png") 0 100
Auto-Crop $src3 (Join-Path $outDir "visa.png") 0 50
Auto-Crop $src3 (Join-Path $outDir "mastercard.png") 50 100
Auto-Crop $src4 (Join-Path $outDir "samsung-pay.png") 0 100

Write-Host "All logos processed and cropped perfectly!"
