param([Parameter(Mandatory=$true)][string]$RepoPath,[string]$Branch='assets/growth-mode-concept-20261014')
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot 'public/assets/growth'
$dest=Join-Path $RepoPath 'public/assets/growth'
if (-not (Test-Path (Join-Path $RepoPath '.git'))) { throw 'RepoPath must point to the cloned Git repository root.' }
if (-not (Test-Path $source)) { throw 'Asset package is incomplete: public/assets/growth missing.' }
Push-Location $RepoPath
try {
 if ((git status --porcelain).Length -gt 0) { throw 'Working tree is not clean. Commit/stash your changes first.' }
 git fetch origin $Branch
 if ($LASTEXITCODE -ne 0) { throw 'Failed to fetch target branch.' }
 git switch $Branch
 if ($LASTEXITCODE -ne 0) { throw 'Failed to switch branch.' }
 git pull --ff-only origin $Branch
 if ($LASTEXITCODE -ne 0) { throw 'Failed to fast-forward.' }
 New-Item -ItemType Directory -Force -Path $dest | Out-Null
 Copy-Item -Path (Join-Path $source 'characters') -Destination $dest -Recurse -Force
 Copy-Item -Path (Join-Path $source 'seasons') -Destination $dest -Recurse -Force
 Copy-Item -Path (Join-Path $source 'README-illustrations.md') -Destination $dest -Force
 git add -- public/assets/growth/characters/*.png public/assets/growth/seasons/*.webp public/assets/growth/README-illustrations.md
 git commit -m 'assets(growth): add refined mascot PNGs and seasonal WebP scenes'
 if ($LASTEXITCODE -ne 0) { throw 'Commit failed (or no changes).' }
 git push origin $Branch
 if ($LASTEXITCODE -ne 0) { throw 'Push failed. Verify your GitHub credentials and access.' }
 Write-Host 'Upload completed. Branch:' $Branch
} finally { Pop-Location }
