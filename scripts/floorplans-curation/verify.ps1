param([string]$Out="C:\1_SAJID\ArchResidenceBD\repo\scripts\floorplans-curation\staging\verify")
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$dir="C:\1_SAJID\ArchResidenceBD\repo\public\assets\floorplans"
$files=Get-ChildItem -Path $dir -File | Where-Object { $_.Extension -match "^.(jpg|jpeg|png)$" } | Sort-Object Name
$tw=400;$th=380;$cols=4;$per=24;$rows=[int][math]::Ceiling($per/$cols)
$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|Where-Object{$_.MimeType -eq 'image/jpeg'}
$ep=New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,75)
$list=@($files);$no=0
for($s=0;$s -lt $list.Count;$s+=$per){
  $chunk=$list[$s..([math]::Min($s+$per-1,$list.Count-1))];$no++
  $bmp=New-Object System.Drawing.Bitmap ($cols*$tw),($rows*$th)
  $g=[System.Drawing.Graphics]::FromImage($bmp);$g.Clear([System.Drawing.Color]::White)
  $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $font=New-Object System.Drawing.Font("Consolas",13)
  $j=0
  foreach($f in $chunk){
    $cx=($j%$cols)*$tw;$cy=[int][math]::Floor($j/$cols)*$th
    try{$img=[System.Drawing.Image]::FromFile($f.FullName)
      $sc=[math]::Min(($tw-8)/$img.Width,($th-28)/$img.Height)
      $g.DrawImage($img,($cx+4),($cy+24),[int]($img.Width*$sc),[int]($img.Height*$sc));$img.Dispose()
    }catch{$g.DrawString("ERR",$font,[System.Drawing.Brushes]::Red,($cx+4),($cy+24))}
    $g.DrawString($f.Name,$font,[System.Drawing.Brushes]::Black,($cx+4),($cy+3))
    $g.DrawRectangle([System.Drawing.Pens]::LightGray,$cx,$cy,($tw-1),($th-1));$j++
  }
  $g.Dispose();$p=Join-Path $Out ("verify-{0:d2}.jpg" -f $no);$bmp.Save($p,$enc,$ep);$bmp.Dispose()
  Write-Output "$p"
}
