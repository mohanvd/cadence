<#
  Install, upgrade and uninstall Cadence, and check what each step leaves in
  the registry.

      ./scripts/test-installer.ps1 -New <installer.exe> [-Old <installer.exe>]

  `-Old` is a released installer to upgrade from; without it the test starts
  from a clean machine. Run it somewhere disposable, as CI does: it installs
  for the current user and writes under HKCU\Software\Classes.

  What it proves is the part of the installer nothing else exercises: that
  Cadence registers its own classes and an "Open with" entry, that it repairs
  the classes 0.8.3 left behind instead of deleting them, that it never takes
  a file type another program owns, and that uninstalling leaves nothing that
  points at a program which is no longer there.
#>
param(
  [Parameter(Mandatory)] [string] $New,
  [string] $Old
)

$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'Cadence'
$exe = Join-Path $dir 'cadence.exe'
$classes = 'HKCU:\Software\Classes'
$quoted = "`"$exe`" `"%1`""
$failures = 0

function Value($path, $name = '(default)') {
  $item = Get-ItemProperty -LiteralPath $path -ErrorAction SilentlyContinue
  if ($null -eq $item) { return $null }
  return $item.$name
}

function Check($what, $ok) {
  if ($ok) { Write-Host "  ok    $what" }
  else { Write-Host "  FAIL  $what"; $script:failures++ }
}

function Run($file, [string[]] $arguments) {
  $process = Start-Process -FilePath $file -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "$file $arguments exited with $($process.ExitCode)" }
}

if ($Old) {
  Write-Host "`nInstalling the old release"
  Run $Old @('/S')
  Check 'the old installer registered the bare Video class' ((Value "$classes\Video\shell\open\command") -like "*cadence.exe*")
}

# Two file types that belong to somebody else, claimed after Cadence was
# installed, the way Canva claimed .mp4 and .mkv on the machine that found
# this. Planted after the old release because that release took every type it
# registered, whoever had it. One class has a command under
# it; the other is a bare key with no subkeys at all, which is the case where
# "does this class exist" has to be answered without a subkey to find.
New-Item "$classes\Other.Webm\shell\open\command" -Force | Out-Null
if (-not (Test-Path "$classes\.webm")) { New-Item "$classes\.webm" -Force | Out-Null }
Set-ItemProperty "$classes\.webm" '(default)' 'Other.Webm'
New-Item "$classes\Bare.Ogv" -Force | Out-Null
Set-ItemProperty "$classes\Bare.Ogv" '(default)' 'A class with no subkeys'
if (-not (Test-Path "$classes\.ogv")) { New-Item "$classes\.ogv" -Force | Out-Null }
Set-ItemProperty "$classes\.ogv" '(default)' 'Bare.Ogv'

Write-Host "`nInstalling this build$(if ($Old) { ' over it, as the updater does' })"
# The updater passes /P /R /UPDATE; /R restarts the app afterwards, which a
# test has no use for.
Run $New @('/P', '/UPDATE')

Check 'Cadence.Video opens Cadence, with its path quoted' ((Value "$classes\Cadence.Video\shell\open\command") -eq $quoted)
Check 'Cadence.Audio opens Cadence, with its path quoted' ((Value "$classes\Cadence.Audio\shell\open\command") -eq $quoted)
Check '.mkv lists Cadence.Video under Open with' ($null -ne (Value "$classes\.mkv\OpenWithProgids" 'Cadence.Video'))
Check '.mp3 lists Cadence.Audio under Open with' ($null -ne (Value "$classes\.mp3\OpenWithProgids" 'Cadence.Audio'))
Check '.webm lists Cadence.Video under Open with' ($null -ne (Value "$classes\.webm\OpenWithProgids" 'Cadence.Video'))
Check 'Applications\cadence.exe opens Cadence' ((Value "$classes\Applications\cadence.exe\shell\open\command") -eq $quoted)
Check 'Applications\cadence.exe lists .mkv' ($null -ne (Value "$classes\Applications\cadence.exe\SupportedTypes" '.mkv'))
Check 'Cadence is in RegisteredApplications' ((Value 'HKCU:\Software\RegisteredApplications' 'Cadence') -eq 'Software\Auva\Cadence\Capabilities')
Check 'Capabilities maps .mkv to Cadence.Video' ((Value 'HKCU:\Software\Auva\Cadence\Capabilities\FileAssociations' '.mkv') -eq 'Cadence.Video')
Check '.webm still belongs to the program that had it' ((Value "$classes\.webm") -eq 'Other.Webm')
Check '.ogv still belongs to the program that had it' ((Value "$classes\.ogv") -eq 'Bare.Ogv')
Check 'no Video_backup value left on .mkv' ($null -eq (Value "$classes\.mkv" 'Video_backup'))

if ($Old) {
  Check 'the old Video class is kept, so a default chosen against it survives' (Test-Path "$classes\Video")
  Check 'the old Video class now has its path quoted' ((Value "$classes\Video\shell\open\command") -eq $quoted)
  Check '.mkv still opens through a class that exists' (Test-Path ("$classes\" + (Value "$classes\.mkv")))
} else {
  Check '.mkv defaults to Cadence.Video on a clean machine' ((Value "$classes\.mkv") -eq 'Cadence.Video')
}

Write-Host "`nUninstalling"
# `_?=` keeps the uninstaller in place rather than copying itself to a
# temporary directory and returning before it has finished.
Run (Join-Path $dir 'uninstall.exe') @('/S', "_?=$dir")

Check 'Cadence.Video is gone' (-not (Test-Path "$classes\Cadence.Video"))
Check 'Cadence.Audio is gone' (-not (Test-Path "$classes\Cadence.Audio"))
Check 'the old Video class is gone' (-not (Test-Path "$classes\Video"))
Check 'the old Audio class is gone' (-not (Test-Path "$classes\Audio"))
Check 'Applications\cadence.exe is gone' (-not (Test-Path "$classes\Applications\cadence.exe"))
Check 'Cadence is out of RegisteredApplications' ($null -eq (Value 'HKCU:\Software\RegisteredApplications' 'Cadence'))
Check '.mkv no longer lists Cadence.Video' ($null -eq (Value "$classes\.mkv\OpenWithProgids" 'Cadence.Video'))
$mkv = Value "$classes\.mkv"
Check ".mkv does not point at a class that is gone (it is '$mkv')" ([string]::IsNullOrEmpty($mkv) -or (Test-Path "$classes\$mkv"))
$mp3 = Value "$classes\.mp3"
Check ".mp3 does not point at a class that is gone (it is '$mp3')" ([string]::IsNullOrEmpty($mp3) -or (Test-Path "$classes\$mp3"))
Check '.webm still belongs to the program that had it' ((Value "$classes\.webm") -eq 'Other.Webm')
Check '.ogv still belongs to the program that had it' ((Value "$classes\.ogv") -eq 'Bare.Ogv')

Write-Host ''
if ($failures -gt 0) { throw "$failures check(s) failed" }
Write-Host 'Every check passed.'
