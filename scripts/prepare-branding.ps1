$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot 'assets\branding\tuxie-avatar-512.jpg'
$resourceRoot = Join-Path $projectRoot 'assets\branding\android-res'
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Required square Tuxie branding image is missing: $sourcePath"
}

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile($sourcePath)
try {
    if ($source.Width -ne $source.Height) {
        throw "Launcher source must be square; found $($source.Width)x$($source.Height): $sourcePath"
    }

    $sizes = @(
        @{ Density = 'mdpi'; Pixel = 48 },
        @{ Density = 'hdpi'; Pixel = 72 },
        @{ Density = 'xhdpi'; Pixel = 96 },
        @{ Density = 'xxhdpi'; Pixel = 144 },
        @{ Density = 'xxxhdpi'; Pixel = 192 }
    )
    $background = [System.Drawing.ColorTranslator]::FromHtml('#08080B')
    $quality = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    foreach ($entry in $sizes) {
        $directory = Join-Path $resourceRoot "mipmap-$($entry.Density)"
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
        $icon = New-Object System.Drawing.Bitmap($entry.Pixel, $entry.Pixel)
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($icon)
            try {
                $graphics.Clear($background)
                $graphics.InterpolationMode = $quality
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $margin = [int][Math]::Round($entry.Pixel * 0.08)
                $content = $entry.Pixel - (2 * $margin)
                $graphics.DrawImage($source, $margin, $margin, $content, $content)
            } finally {
                $graphics.Dispose()
            }
            foreach ($name in @('ic_launcher.png', 'ic_launcher_round.png')) {
                $icon.Save((Join-Path $directory $name), [System.Drawing.Imaging.ImageFormat]::Png)
            }
        } finally {
            $icon.Dispose()
        }

        $foregroundSize = [int]($entry.Pixel * 2.25)
        $foreground = New-Object System.Drawing.Bitmap($foregroundSize, $foregroundSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($foreground)
            try {
                $graphics.Clear([System.Drawing.Color]::Transparent)
                $graphics.InterpolationMode = $quality
                $content = [int][Math]::Round($foregroundSize * (2.0 / 3.0))
                $offset = [int](($foregroundSize - $content) / 2)
                $graphics.DrawImage($source, $offset, $offset, $content, $content)
            } finally {
                $graphics.Dispose()
            }
            $foreground.Save((Join-Path $directory 'ic_launcher_foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $foreground.Dispose()
        }
    }

    $adaptive = Join-Path $resourceRoot 'mipmap-anydpi-v26'
    New-Item -ItemType Directory -Path $adaptive -Force | Out-Null
    $adaptiveIcon = @'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/tuxie_icon_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
'@
    Set-Content -LiteralPath (Join-Path $adaptive 'ic_launcher.xml') -Value $adaptiveIcon -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $adaptive 'ic_launcher_round.xml') -Value $adaptiveIcon -Encoding UTF8

    $values = Join-Path $resourceRoot 'values'
    New-Item -ItemType Directory -Path $values -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $values 'tuxie_branding.xml') -Value @'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="tuxie_icon_background">#08080B</color>
</resources>
'@ -Encoding UTF8
} finally {
    $source.Dispose()
}

Write-Output "Generated uncropped square Tuxie launcher artwork from $sourcePath"
