<#
.SYNOPSIS
S6a - embed the engine's main window into a host window via Win32 SetParent, capture evidence.

.DESCRIPTION
Launches the engine GUI with the S6 boot script (tools/spikes/s6/s6_ui_init.py,
which reports its HWND + applies branding/theme overrides), creates a host
window, reparents the engine into it, and captures the result with several
methods (screen region, PrintWindow on host, PrintWindow on the engine child,
GetWindowDC of the child, full screen) so occluded windows still yield proof.

  winforms : a plain WinForms host - proves the raw reparent mechanics.
  tauri    : the S1 Tauri hello window as host - proves the real app pattern
             (engine as a native child HWND over the WebView2 surface, with a
             strip of web content left visible).

Outputs (data/spikes/s6/): ui_facts.json, embed_<kind>*.png, capture diagnostics
on the console.

.EXAMPLE
./embed_test.ps1 -HostKind winforms
./embed_test.ps1 -HostKind tauri -Resize -Dialog
#>

param(
  [ValidateSet('winforms', 'tauri')][string]$HostKind = 'winforms',
  [switch]$Dialog,
  [switch]$Resize,
  [switch]$Firewall,
  [switch]$Region,
  [switch]$Owned
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$out = Join-Path $repo 'data\spikes\s6'
$user = Join-Path $out 'user'
New-Item -ItemType Directory -Force $out, $user | Out-Null

# fresh engine profile each run (deterministic; no stale locks after force-kills)
Remove-Item (Join-Path $user 'user.cfg') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $user 'temp') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $out 'ui_facts.json') -ErrorAction SilentlyContinue

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Native {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT point);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll", EntryPoint="CreateWindowExW", CharSet=CharSet.Unicode)] public static extern IntPtr CreateWindowEx(uint exStyle, string className, string windowName, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowDC(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr hdc, int x, int y, int cx, int cy, IntPtr hdcSrc, int sx, int sy, uint rop);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", EntryPoint="GetWindowTextW", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder sb, int max);
  [DllImport("user32.dll", EntryPoint="GetClassNameW", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder sb, int max);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
}
"@
$null = [Native]::SetProcessDPIAware()

$GWL_STYLE = -16; $GWL_EXSTYLE = -20

function Get-Rect([IntPtr]$h) {
  $r = New-Object Native+RECT
  $null = [Native]::GetWindowRect($h, [ref]$r)
  return $r
}

function Save-Region([int]$x, [int]$y, [int]$w, [int]$h, [string]$file) {
  if ($w -le 0 -or $h -le 0) { return "SKIPPED ${w}x${h}" }
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size($w, $h)))
  $g.Dispose(); $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  return "$file (${w}x${h})"
}

function Save-PrintWindow([IntPtr]$h, [string]$file) {
  $r = Get-Rect $h
  $w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
  if ($w -le 0 -or $ht -le 0) { return "SKIPPED ${w}x${ht}" }
  $bmp = New-Object System.Drawing.Bitmap($w, $ht)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  $ok = [Native]::PrintWindow($h, $hdc, 2)  # PW_RENDERFULLCONTENT
  $g.ReleaseHdc($hdc); $g.Dispose()
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  return "$file (${w}x${ht}, ok=$ok)"
}

function Save-WindowDc([IntPtr]$h, [string]$file) {
  $r = Get-Rect $h
  $w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
  if ($w -le 0 -or $ht -le 0) { return "SKIPPED ${w}x${ht}" }
  $bmp = New-Object System.Drawing.Bitmap($w, $ht)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $dst = $g.GetHdc()
  $src = [Native]::GetWindowDC($h)
  $ok = [Native]::BitBlt($dst, 0, 0, $w, $ht, $src, 0, 0, 0x00CC0020)
  $null = [Native]::ReleaseDC($h, $src)
  $g.ReleaseHdc($dst); $g.Dispose()
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  return "$file (${w}x${ht}, ok=$ok)"
}

function Describe-Window([string]$name, [IntPtr]$h) {
  $r = Get-Rect $h
  $style = [Native]::GetWindowLongPtr($h, $GWL_STYLE).ToInt64()
  $ex = [Native]::GetWindowLongPtr($h, $GWL_EXSTYLE).ToInt64()
  $vis = [Native]::IsWindowVisible($h)
  return ("{0}: rect=({1},{2})-({3},{4}) {5}x{6} visible={7} topmost={8} child={9}" -f `
      $name, $r.Left, $r.Top, $r.Right, $r.Bottom, ($r.Right - $r.Left), ($r.Bottom - $r.Top),
    $vis, (($ex -band 0x8) -ne 0), (($style -band [int64]0x40000000) -ne 0))
}

function Get-ProcessTopWindows([int]$TargetPid) {
  $script:s6found = @()
  $script:s6target = [uint32]$TargetPid
  $cb = [Native+EnumWindowsProc]{
    param([IntPtr]$hWnd, [IntPtr]$lParam)
    $p = [uint32]0
    $null = [Native]::GetWindowThreadProcessId($hWnd, [ref]$p)
    if ($p -eq $script:s6target) { $script:s6found += $hWnd }
    return $true
  }
  $null = [Native]::EnumWindows($cb, [IntPtr]::Zero)
  return $script:s6found
}

function Get-WindowText([IntPtr]$h) {
  $sb = New-Object System.Text.StringBuilder 512
  $null = [Native]::GetWindowText($h, $sb, 512)
  return $sb.ToString()
}

function Get-WindowClass([IntPtr]$h) {
  $sb = New-Object System.Text.StringBuilder 256
  $null = [Native]::GetClassName($h, $sb, 256)
  return $sb.ToString()
}

# --- engine ---------------------------------------------------------------
$env:FREECAD_USER_HOME = $user
$env:S6_OUT = $out
$env:S6_DEMO_DOC = '1'
if ($Dialog) { $env:S6_DIALOG = 'about' } else { Remove-Item Env:\S6_DIALOG -ErrorAction SilentlyContinue }
$freecad = 'C:\1_SAJID\CE tools\FreeCAD\bin\freecad.exe'
$init = Join-Path $repo 'tools\spikes\s6\s6_ui_init.py'
$engStart = Get-Date
$eng = Start-Process -FilePath $freecad -ArgumentList ('"' + $init + '"') -PassThru

$facts = $null
$factsPath = Join-Path $out 'ui_facts.json'
for ($i = 0; $i -lt 120 -and -not ($facts -and $facts.winid); $i++) {
  if (Test-Path $factsPath) {
    try { $facts = Get-Content $factsPath -Raw | ConvertFrom-Json } catch { $facts = $null }
  }
  if (-not ($facts -and $facts.winid)) { Start-Sleep -Milliseconds 500 }
}
if (-not ($facts -and $facts.winid)) { throw "engine did not report UI facts within 60 s" }
$engHwnd = [IntPtr]::new([int64]$facts.winid)
"engine: pid=$($eng.Id) hwnd=$engHwnd title_before='$($facts.title_before)' title_after='$($facts.title_after)' facts_ok=$($facts.ok)"

# --- host -----------------------------------------------------------------
$form = $null; $tauriProc = $null
if ($HostKind -eq 'winforms') {
  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'S6-Host (embed spike)'
  $form.ClientSize = New-Object System.Drawing.Size(1280, 800)
  $form.StartPosition = 'Manual'
  $form.Location = New-Object System.Drawing.Point(60, 60)
  $form.TopMost = $true
  $null = $form.Show()
  $null = [Native]::SetWindowPos($form.Handle, [IntPtr]::new(-1), 60, 60, 1296, 839, 0x40)  # HWND_TOPMOST
  $null = [Native]::SetForegroundWindow($form.Handle)
  $hostHwnd = $form.Handle
} else {
  $tauriExe = Join-Path $repo 'data\spikes\s1\tauri-hello\src-tauri\target\release\s1-hello.exe'
  $tauriProc = Start-Process -FilePath $tauriExe -PassThru
  $hostHwnd = [IntPtr]::Zero
  for ($i = 0; $i -lt 60 -and $hostHwnd -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 250
    $tauriProc.Refresh()
    if ($tauriProc.MainWindowHandle -ne 0) { $hostHwnd = [IntPtr]::new([int64]$tauriProc.MainWindowHandle) }
  }
  if ($hostHwnd -eq [IntPtr]::Zero) { throw "tauri host window not found" }
  $null = [Native]::SetWindowPos($hostHwnd, [IntPtr]::new(-1), 60, 60, 1280, 860, 0x40)  # HWND_TOPMOST
  $null = [Native]::SetForegroundWindow($hostHwnd)
}
Start-Sleep -Milliseconds 500

# --- reparent / owned ------------------------------------------------------
$topInset = if ($HostKind -eq 'tauri') { 64 } else { 0 }
if ($Owned) {
  # fallback pattern: engine stays a top-level window, OWNED by the host, positioned over the CAD region.
  $style0 = [Native]::GetWindowLongPtr($engHwnd, $GWL_STYLE).ToInt64()
  $stripMask0 = -bnot ([int64]0x00C00000 -bor 0x00040000 -bor 0x00020000 -bor 0x00010000 -bor 0x00080000 -bor [int64]0x80000000)
  $null = [Native]::SetWindowLongPtr($engHwnd, $GWL_STYLE, [IntPtr]::new($style0 -band $stripMask0))
  $ex0 = [Native]::GetWindowLongPtr($engHwnd, $GWL_EXSTYLE).ToInt64()
  $null = [Native]::SetWindowLongPtr($engHwnd, $GWL_EXSTYLE, [IntPtr]::new($ex0 -bor 0x80))  # WS_EX_TOOLWINDOW
  $null = [Native]::SetWindowLongPtr($engHwnd, -8, $hostHwnd)  # GWLP_HWNDPARENT = owner
  $pt = New-Object Native+POINT
  $pt.X = 0; $pt.Y = 64
  $null = [Native]::ClientToScreen($hostHwnd, [ref]$pt)
  $crc0 = New-Object Native+RECT
  $null = [Native]::GetClientRect($hostHwnd, [ref]$crc0)
  $null = [Native]::SetWindowPos($engHwnd, [IntPtr]::new(-1), $pt.X, $pt.Y, $crc0.Right, ($crc0.Bottom - 64), 0x40)  # HWND_TOPMOST (host is topmost in this harness)
  "owned-window: engine stays top-level, owned by host, at ($($pt.X),$($pt.Y)) $($crc0.Right)x$($crc0.Bottom - 64)"
  Start-Sleep -Seconds 3
} else {
$style = [Native]::GetWindowLongPtr($engHwnd, $GWL_STYLE).ToInt64()
$stripMask = -bnot ([int64]0x00C00000 -bor 0x00040000 -bor 0x00020000 -bor 0x00010000 -bor 0x00080000 -bor [int64]0x80000000)
$newStyle = ($style -band $stripMask) -bor [int64]0x40000000 -bor [int64]0x10000000  # WS_CHILD | WS_VISIBLE
$null = [Native]::SetWindowLongPtr($engHwnd, $GWL_STYLE, [IntPtr]::new($newStyle))
$prevParent = [Native]::SetParent($engHwnd, $hostHwnd)
"setparent: prev_parent=$prevParent"

$topInset = if ($HostKind -eq 'tauri') { 64 } else { 0 }
$cr = New-Object Native+RECT
$null = [Native]::GetClientRect($hostHwnd, [ref]$cr)
$null = [Native]::SetWindowPos($engHwnd, [IntPtr]::Zero, 0, $topInset, $cr.Right, ($cr.Bottom - $topInset), 0x20 -bor 0x40)
# z-order guard: WebView2 re-raises its child surface; keep the engine on top
for ($j = 0; $j -lt 8; $j++) {
  $null = [Native]::BringWindowToTop($engHwnd)
  Start-Sleep -Milliseconds 500
}

# --- z-order diagnostics (tauri host: who covers whom) ---------------------
if ($HostKind -eq 'tauri') {
  $script:s6kids = @()
  $cbc = [Native+EnumWindowsProc]{ param([IntPtr]$h, [IntPtr]$l) $script:s6kids += $h; return $true }
  $null = [Native]::EnumChildWindows($hostHwnd, $cbc, [IntPtr]::Zero)
  "--- host children in z-order (first = topmost) ---"
  $i = 0
  foreach ($k in $script:s6kids) {
    "child${i}: hwnd=$k class='$(Get-WindowClass $k)' title='$(Get-WindowText $k)' $(Describe-Window 'kid' $k)"
    $i++
  }
  $wv = @($script:s6kids | Where-Object { (Get-WindowClass $_) -match 'Chrome|WebView|Edge|Tauri|WRY' })
  "webview-ish children: $($wv.Count)"
  foreach ($k in $wv) { $null = [Native]::ShowWindow($k, 0) }  # SW_HIDE
  $null = [Native]::BringWindowToTop($engHwnd)
  Start-Sleep -Seconds 2
  $hr = Get-Rect $hostHwnd
  Save-Region $hr.Left $hr.Top ($hr.Right - $hr.Left) ($hr.Bottom - $hr.Top) (Join-Path $out "embed_${HostKind}_webviewhidden.png")
  Save-PrintWindow $hostHwnd (Join-Path $out "host_pw_${HostKind}_webviewhidden.png")
  foreach ($k in $wv) { $null = [Native]::ShowWindow($k, 5) }  # SW_SHOW
  $null = [Native]::BringWindowToTop($engHwnd)
  Start-Sleep -Seconds 1

  # region test: webview surface shrunk to a chrome strip; engine owns the rest
  if ($Region) {
    $wry = @($script:s6kids | Where-Object { (Get-WindowClass $_) -eq 'WRY_WEBVIEW' })[0]
    $crc = New-Object Native+RECT
    $null = [Native]::GetClientRect($hostHwnd, [ref]$crc)
    $stripH = 64
    $null = [Native]::SetWindowPos($wry, [IntPtr]::Zero, 0, 0, $crc.Right, $stripH, 0x40)
    Start-Sleep -Milliseconds 500
    $null = [Native]::SetWindowPos($engHwnd, [IntPtr]::Zero, 0, $stripH, $crc.Right, ($crc.Bottom - $stripH), 0x20 -bor 0x40)
    for ($j = 0; $j -lt 4; $j++) { $null = [Native]::BringWindowToTop($engHwnd); Start-Sleep -Milliseconds 400 }
    $hr3 = Get-Rect $hostHwnd
    Save-Region $hr3.Left $hr3.Top ($hr3.Right - $hr3.Left) ($hr3.Bottom - $hr3.Top) (Join-Path $out "embed_${HostKind}_region.png")
    Save-PrintWindow $hostHwnd (Join-Path $out "host_pw_${HostKind}_region.png")
    "region test: webview strip=${stripH}px, engine below"
  }

  # firewall test: isolate the webview container so its compositor cannot fight siblings
  if ($Firewall) {
    $wry = @($script:s6kids | Where-Object { (Get-WindowClass $_) -eq 'WRY_WEBVIEW' })[0]
    if ($wry) {
      $crc = New-Object Native+RECT
      $null = [Native]::GetClientRect($hostHwnd, [ref]$crc)
      $container = [Native]::CreateWindowEx(0, 'STATIC', '', [uint32](0x40000000 -bor 0x10000000 -bor 0x02000000), 0, 0, $crc.Right, $crc.Bottom, $hostHwnd, [IntPtr]::Zero, [IntPtr]::Zero, [IntPtr]::Zero)
      "firewall container: $container rect $($crc.Right)x$($crc.Bottom)"
      $null = [Native]::SetParent($wry, $container)
      $null = [Native]::SetWindowPos($wry, [IntPtr]::Zero, 0, 0, $crc.Right, $crc.Bottom, 0x40)
      Start-Sleep -Milliseconds 800
      $null = [Native]::SetWindowPos($engHwnd, [IntPtr]::Zero, 0, $topInset, $crc.Right, ($crc.Bottom - $topInset), 0x20 -bor 0x40)
      for ($j = 0; $j -lt 4; $j++) { $null = [Native]::BringWindowToTop($engHwnd); Start-Sleep -Milliseconds 500 }
      $hr2 = Get-Rect $hostHwnd
      Save-Region $hr2.Left $hr2.Top ($hr2.Right - $hr2.Left) ($hr2.Bottom - $hr2.Top) (Join-Path $out "embed_${HostKind}_firewall.png")
      Save-PrintWindow $hostHwnd (Join-Path $out "host_pw_${HostKind}_firewall.png")
    } else {
      "no WRY_WEBVIEW child found for firewall test"
    }
  }
}
}

"--- windows ---"
Describe-Window 'host' $hostHwnd
Describe-Window 'engine-child' $engHwnd

"--- evidence ---"
$hostRect = Get-Rect $hostHwnd
Save-Region $hostRect.Left $hostRect.Top ($hostRect.Right - $hostRect.Left) ($hostRect.Bottom - $hostRect.Top) (Join-Path $out "embed_$HostKind.png")
Save-PrintWindow $hostHwnd (Join-Path $out "host_pw_$HostKind.png")
Save-PrintWindow $engHwnd (Join-Path $out "child_pw_$HostKind.png")
Save-WindowDc $engHwnd (Join-Path $out "child_dc_$HostKind.png")
$sw = [Native]::GetSystemMetrics(0); $sh = [Native]::GetSystemMetrics(1)
Save-Region 0 0 $sw $sh (Join-Path $out "full_$HostKind.png")

if ($Resize -and -not $Owned) {
  $null = [Native]::SetWindowPos($hostHwnd, [IntPtr]::new(-1), 60, 60, 940, 660, 0x40)
  Start-Sleep -Milliseconds 500
  $cr2 = New-Object Native+RECT
  $null = [Native]::GetClientRect($hostHwnd, [ref]$cr2)
  $null = [Native]::SetWindowPos($engHwnd, [IntPtr]::Zero, 0, $topInset, $cr2.Right, ($cr2.Bottom - $topInset), 0x20 -bor 0x40)
  for ($j = 0; $j -lt 4; $j++) { $null = [Native]::BringWindowToTop($engHwnd); Start-Sleep -Milliseconds 500 }
  Save-PrintWindow $hostHwnd (Join-Path $out "host_pw_${HostKind}_resized.png")
  Save-PrintWindow $engHwnd (Join-Path $out "child_pw_${HostKind}_resized.png")
}

if ($Dialog) {
  $aboutHwnd = [IntPtr]::Zero
  while (((Get-Date) - $engStart).TotalSeconds -lt 25) {
    $wins = Get-ProcessTopWindows $eng.Id
    foreach ($w in $wins) {
      if ((Get-WindowText $w) -match 'About') { $aboutHwnd = $w; break }
    }
    if ($aboutHwnd -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 700
  }
  if ($aboutHwnd -ne [IntPtr]::Zero) {
    "--- about dialog found ---"
    Describe-Window 'about-dialog' $aboutHwnd
    $null = Save-PrintWindow $aboutHwnd (Join-Path $out "dialog_pw_$HostKind.png")
  } else {
    "about dialog NOT found within 25 s"
  }
}

# enumerate the engine process's top-level windows (dialogs, splash remnants)
$wins = Get-ProcessTopWindows $eng.Id
$list = @()
$i = 0
foreach ($w in $wins) {
  $desc = Describe-Window "top$i" $w
  $desc += " title='$(Get-WindowText $w)' class='$(Get-WindowClass $w)'"
  $list += $desc
  if ($Dialog -and $w -ne $engHwnd) { $null = Save-PrintWindow $w (Join-Path $out "top_pw_${HostKind}_$i.png") }
  $i++
}
$list -join "`n" | Set-Content (Join-Path $out "top_windows_$HostKind.txt")
"--- engine top-level windows ---"
$list

# engine still alive?
$alive = -not $eng.HasExited
"engine_alive_after_embed=$alive"

# --- teardown -------------------------------------------------------------
if ($alive) { Start-Sleep -Seconds 2; $alive = -not $eng.HasExited; "engine_alive_after_wait=$alive" }
& taskkill /F /T /PID $eng.Id 2>&1 | Out-Null
if ($tauriProc) { & taskkill /F /T /PID $tauriProc.Id 2>&1 | Out-Null }
if ($form) { $form.Close(); $form.Dispose() }
"EMBED_TEST_DONE"
