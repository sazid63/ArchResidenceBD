param(
  [string]$Staging = "C:\1_SAJID\ArchResidenceBD\repo\scripts\floorplans-curation\staging",
  [string]$Out = "C:\1_SAJID\ArchResidenceBD\repo\scripts\floorplans-curation\staging\sheets",
  [int]$PerSheet = 16,
  [int]$TileW = 400,
  [int]$TileH = 430,
  [string]$Pattern = "cand*.*"
)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$files = Get-ChildItem -Path $Staging -Recurse -File | Where-Object { $_.DirectoryName -notlike "*sheets*" -and $_.Extension -match "^.(jpg|jpeg|png|webp)$" } |
  Sort-Object { $_.Directory.Name }, Name
$cols = 4
$rows = [int][math]::Ceiling($PerSheet / $cols)
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 78)
$list = @($files)
$sheetNo = 0
for ($start = 0; $start -lt $list.Count; $start += $PerSheet) {
  $chunk = $list[$start..([math]::Min($start + $PerSheet - 1, $list.Count - 1))]
  $sheetNo++
  $bmp = New-Object System.Drawing.Bitmap ($cols * $TileW), ($rows * $TileH)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $font = New-Object System.Drawing.Font("Consolas", 14)
  $j = 0
  foreach ($f in $chunk) {
    $cx = ($j % $cols) * $TileW
    $cy = [int][math]::Floor($j / $cols) * $TileH
    try {
      $img = [System.Drawing.Image]::FromFile($f.FullName)
      $availW = $TileW - 8
      $availH = $TileH - 30
      $scale = [math]::Min($availW / $img.Width, $availH / $img.Height)
      $g.DrawImage($img, ($cx + 4), ($cy + 26), [int]($img.Width * $scale), [int]($img.Height * $scale))
      $img.Dispose()
    } catch { $g.DrawString("ERR", $font, [System.Drawing.Brushes]::Red, ($cx + 4), ($cy + 26)) }
    $g.DrawString("$($f.Directory.Name)/$($f.Name)", $font, [System.Drawing.Brushes]::Black, ($cx + 4), ($cy + 3))
    $g.DrawRectangle([System.Drawing.Pens]::LightGray, $cx, $cy, ($TileW - 1), ($TileH - 1))
    $j++
  }
  $g.Dispose()
  $path = Join-Path $Out ("sheet-{0:d2}.jpg" -f $sheetNo)
  $bmp.Save($path, $enc, $ep)
  $bmp.Dispose()
  Write-Output "$path  $([int]((Get-Item $path).Length/1024))KB"
}
