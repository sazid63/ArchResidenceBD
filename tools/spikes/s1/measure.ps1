<#
.SYNOPSIS
S1 spike - launch a candidate app shell, measure time-to-window and idle RAM.
.DESCRIPTION
Starts the given executable, polls every 40 ms until any process in its tree owns a
top-level window, waits for the settle period, sums the working set of the whole
process tree, prints one result line, then stops the tree.
.EXAMPLE
./measure.ps1 -Exe .\tauri-hello\src-tauri\target\release\s1-hello.exe -Name tauri
.EXAMPLE
./measure.ps1 -Exe .\electron-hello\node_modules\electron\dist\electron.exe -Name electron -ArgumentLine "." -WorkDir .\electron-hello
#>
param(
  [Parameter(Mandatory = $true)][string]$Exe,
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$ArgumentLine = "",
  [string]$WorkDir = "",
  [int]$TimeoutS = 120,
  [int]$SettleMs = 4000
)

function Get-TreePids([int]$RootPid) {
  $all = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  $found = @($RootPid)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($item in $all) {
      if ($found -contains [int]$item.ParentProcessId -and $found -notcontains [int]$item.ProcessId) {
        $found += [int]$item.ProcessId
        $changed = $true
      }
    }
  }
  return $found
}

$sw = [Diagnostics.Stopwatch]::StartNew()
if ($WorkDir -ne "") { $wd = Resolve-Path $WorkDir }
if ($ArgumentLine -ne "") {
  $p = if ($WorkDir -ne "") { Start-Process -FilePath $Exe -ArgumentList $ArgumentLine -WorkingDirectory $wd -PassThru }
       else { Start-Process -FilePath $Exe -ArgumentList $ArgumentLine -PassThru }
} else {
  $p = if ($WorkDir -ne "") { Start-Process -FilePath $Exe -WorkingDirectory $wd -PassThru }
       else { Start-Process -FilePath $Exe -PassThru }
}
$rootId = $p.Id

$windowMs = $null
while ($sw.Elapsed.TotalSeconds -lt $TimeoutS) {
  foreach ($procId in (Get-TreePids $rootId)) {
    $gp = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($gp -and $gp.MainWindowHandle -ne 0) {
      $windowMs = [Math]::Round($sw.Elapsed.TotalMilliseconds)
      break
    }
  }
  if ($windowMs) { break }
  Start-Sleep -Milliseconds 40
}

Start-Sleep -Milliseconds $SettleMs
$pids = Get-TreePids $rootId
$ramMb = 0.0
$procCount = 0
foreach ($procId in $pids) {
  $gp = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($gp) { $ramMb += $gp.WorkingSet64 / 1MB; $procCount += 1 }
}

$windowText = if ($windowMs) { "$windowMs" } else { "NONE" }
"[{0}] processes={1} window_ms={2} idle_ram_mb={3:N1}" -f $Name, $procCount, $windowText, $ramMb

foreach ($procId in $pids) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
