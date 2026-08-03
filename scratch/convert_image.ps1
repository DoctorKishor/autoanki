Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("c:\Projects\Antigravity\auto-anki-app\public\developer_profile.png")
$min = [System.Math]::Min($img.Width, $img.Height)
$bmp = new-object System.Drawing.Bitmap($min, $min)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, (new-object System.Drawing.Rectangle(0, 0, $min, $min)), (new-object System.Drawing.Rectangle([int](($img.Width - $min)/2), 0, $min, $min)), [System.Drawing.GraphicsUnit]::Pixel)
$finalBmp = new-object System.Drawing.Bitmap(512, 512)
$gFinal = [System.Drawing.Graphics]::FromImage($finalBmp)
$gFinal.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gFinal.DrawImage($bmp, 0, 0, 512, 512)
$finalBmp.Save("c:\Projects\Antigravity\auto-anki-app\public\developer_profile_square.png", [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
$bmp.Dispose()
$finalBmp.Dispose()
$g.Dispose()
$gFinal.Dispose()
Write-Output "Successfully generated developer_profile_square.png"
