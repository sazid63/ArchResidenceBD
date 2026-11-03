param([string]$Out="C:\1_SAJID\ArchResidenceBD\repo\scripts\floorplans-curation\staging\zoom")
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$base="C:\1_SAJID\ArchResidenceBD\repo\scripts\floorplans-curation\staging"
$sets=@(
 @("bd-2u-010/cand3.jpg","bd-2u-019/cand0.jpg"),
 @("bd-1u-018/cand0.jpg","bd-3u-016/cand3.jpg")
)
$tw=1250;$th=1150;$cols=2;$rows=1
$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|Where-Object{$_.MimeType -eq 'image/jpeg'}
$ep=New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,85)
$n=10
foreach($set in $sets){
 $n++
 $bmp=New-Object System.Drawing.Bitmap ($cols*$tw),($rows*$th)
 $g=[System.Drawing.Graphics]::FromImage($bmp);$g.Clear([System.Drawing.Color]::White)
 $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
 $font=New-Object System.Drawing.Font("Consolas",18)
 $j=0
 foreach($rel in $set){
  $cx=($j%$cols)*$tw;$cy=[int][math]::Floor($j/$cols)*$th
  $p=Join-Path $base ($rel -replace '/','\')
  $img=[System.Drawing.Image]::FromFile($p)
  $sc=[math]::Min(($tw-10)/$img.Width,($th-40)/$img.Height)
  $g.DrawImage($img,($cx+5),($cy+34),[int]($img.Width*$sc),[int]($img.Height*$sc))
  $img.Dispose()
  $g.DrawString($rel,$font,[System.Drawing.Brushes]::Black,($cx+5),($cy+4))
  $j++
 }
 $g.Dispose()
 $p2=Join-Path $Out ("zoom-{0:d2}.jpg" -f $n)
 $bmp.Save($p2,$enc,$ep);$bmp.Dispose()
 Write-Output "$p2 $([int]((Get-Item $p2).Length/1024))KB"
}
