# Mirror source to the Google Drive folder for backup.
#
# node_modules is excluded deliberately: Google Drive's sync layer corrupts
# npm installs (EBADF / vanishing files), and Drive rejects junctions, so the
# working copy has to live on local disk. This copies only source.

$ErrorActionPreference = 'Stop'

$src  = $PSScriptRoot
$dest = 'G:\My Drive\_Personal\_AI\_Claude\Spittastr furniture'

if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force $dest | Out-Null }

robocopy $src $dest /MIR /XD node_modules .git dist /XF *.log /NFL /NDL /NJH /NJS /NP | Out-Null

# robocopy exit codes below 8 are success (files copied / nothing to do).
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

# Ship the standalone build alongside the source. This has to happen AFTER the
# mirror: /MIR removes anything in the destination that isn't in the source, so
# copying it first would just delete it again.
$standalone = Join-Path $src 'dist\standalone.html'
if (Test-Path $standalone) {
  Copy-Item $standalone (Join-Path $dest 'spittastr-planner.html') -Force
  Write-Host 'Copied spittastr-planner.html (standalone, double-clickable)'
} else {
  Write-Host 'No dist\standalone.html yet — run `npm run build:share` to refresh it.'
}

# robocopy's non-zero success codes would otherwise surface as a script failure.
$global:LASTEXITCODE = 0

Write-Host "Mirrored to $dest"
