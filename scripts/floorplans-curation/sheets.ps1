param(
  [string]$Staging = "C:\1_SAJID\ArchResidenceBD\repo\scripts\floorplans-curation\staging",
  [string]$Out = "C:\1_SAJID\ArchResidenceBD\repo\scripts\floorplans-curation\staging\sheets",
  [int]$PerSheet = 16,
  [int]$TileW = 470,
  [int]$TileH = 500
)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$files = Get-ChildItem -Path $Staging -Recurse -Filter "cand*.*" | Where-Object { $_.DirectoryName -notlike "*sheets*" } |
  Sort-Object { $_.Directory.Name }, Name

$cols = 4
$rows = [math]::Ceiling($PerSheet / $cols)
$index = 0
$sheetNo = 0

foreach ($batch in ($files | ForEach-Object { ,$_ } | ForEach-Object -Begin { $i=0; $all=$files } -Process { } )) { break }

# simple chunking
$list = @($files)
for ($start = 0; $start -lt $list.Count; $start += $PerSheet) {
  $chunk = $list[$start..([math]::Min($start + $PerSheet - 1, $list.Count - 1))]
  $sheetNo++
  $bmp = New-Object System.Drawing.Bitmap ($cols * $TileW), ($rows * $TileH)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $font = New-Object System.Drawing.Font("Consolas", 15)
  $brush = [System.Drawing.Brushes]::Black
  $j = 0
  foreach ($f in $chunk) {
    $cx = ($j % $cols) * $TileW
    $cy = [math]::Floor($j / $cols) * $TileH
    try {
      $img = [System.Drawing.Image]::FromFile($f.FullName)
      $availW = $TileW - 10
      $availH = $TileH - 34
      $scale = [math]::Min($availW / $img.Width, $availH / $img.Height)
      $dw = [int]($img.Width * $scale)
      $dh = [int]($img.Height * $scale)
      $g.DrawImage($img, $cx + 5, $cy + 28, $dw, $dh)
      $img.Dispose()
    } catch {
      $g.DrawString("ERR", $font, $brush, $cx + 5, $cy + 28)
    }
    $label = "$($f.Directory.Name)/$($f.Name)"
    $g.DrawString($label, $font, $brush, $cx + 5, $cy + 4)
    $g.DrawRectangle([System.Drawing.Pens]::LightGray, $cx, $cy, $TileW - 1, $TileH - 1)
    $j++
  }
  $g.Dispose()
  $path = Join-Path $Out ("sheet-{0:d2}.png" -f $sheetNo)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output $path
}
