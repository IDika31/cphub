# CPHub V4 — Windows dev launcher
# Usage: .\dev.ps1 [-Force]

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

function Write-Color($Color, $Text) {
    Write-Host $Text -ForegroundColor $Color
}

function Test-NeedsBuild {
    param(
        [string]$Marker,
        [string[]]$Sources
    )
    if ($Force) { return $true }
    if (-not (Test-Path $Marker)) { return $true }
    $markerTime = (Get-Item $Marker).LastWriteTime
    foreach ($src in $Sources) {
        if (-not (Test-Path $src)) { continue }
        $newer = Get-ChildItem -Path $src -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -gt $markerTime } |
            Select-Object -First 1
        if ($newer) { return $true }
    }
    return $false
}

Write-Color Green "Starting CPHub V4 dev environment (Windows)..."
Write-Host ""

# --- Install deps if missing ---
foreach ($app in @("web", "extension")) {
    $appDir = Join-Path $ROOT "apps\$app"
    $nm = Join-Path $appDir "node_modules"
    if (-not (Test-Path $nm)) {
        Write-Color Yellow "Installing $app dependencies..."
        Push-Location $appDir
        try { npm install } finally { Pop-Location }
        Write-Color Green "$app deps installed."
        Write-Host ""
    }
}

# --- API ---
$apiBin = Join-Path $ROOT "apps\api\bin\cphub-api.exe"
$apiSources = @(
    (Join-Path $ROOT "apps\api\cmd"),
    (Join-Path $ROOT "apps\api\internal"),
    (Join-Path $ROOT "apps\api\go.mod"),
    (Join-Path $ROOT "apps\api\go.sum")
)

if (Test-NeedsBuild -Marker $apiBin -Sources $apiSources) {
    Write-Color Yellow "Building API..."
    Push-Location (Join-Path $ROOT "apps\api")
    try {
        go build -o ./bin/cphub-api.exe ./cmd/main.go
        if ($LASTEXITCODE -ne 0) { throw "API build failed" }
        Write-Color Green "API build OK."
    } finally { Pop-Location }
} else {
    Write-Color Green "API up to date - skip build."
}
Write-Host ""

# --- Web ---
$webMarker = Join-Path $ROOT "apps\web\.next\BUILD_ID"
$webSources = @(
    (Join-Path $ROOT "apps\web\src"),
    (Join-Path $ROOT "apps\web\package.json"),
    (Join-Path $ROOT "apps\web\next.config.mjs"),
    (Join-Path $ROOT "apps\web\postcss.config.mjs"),
    (Join-Path $ROOT "apps\web\tailwind.config.ts"),
    (Join-Path $ROOT "apps\web\tsconfig.json")
)

if (Test-NeedsBuild -Marker $webMarker -Sources $webSources) {
    Write-Color Yellow "Building web..."
    Push-Location (Join-Path $ROOT "apps\web")
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Web build failed" }
        Write-Color Green "Web build OK."
    } finally { Pop-Location }
} else {
    Write-Color Green "Web up to date - skip build."
}
Write-Host ""

# --- Extension ---
$extMarker = Join-Path $ROOT "apps\extension\dist\manifest.json"
$extSources = @(
    (Join-Path $ROOT "apps\extension\src"),
    (Join-Path $ROOT "apps\extension\manifest.json"),
    (Join-Path $ROOT "apps\extension\vite.config.ts"),
    (Join-Path $ROOT "apps\extension\tsconfig.json"),
    (Join-Path $ROOT "apps\extension\package.json")
)

if (Test-NeedsBuild -Marker $extMarker -Sources $extSources) {
    Write-Color Yellow "Building extension..."
    Push-Location (Join-Path $ROOT "apps\extension")
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Extension build failed" }
        Write-Color Green "Extension build OK."
    } finally { Pop-Location }
} else {
    Write-Color Green "Extension up to date - skip build."
}
Write-Host ""

# --- Run API + Web in parallel ---
Write-Color Yellow "Starting services..."

$apiJob = Start-Process -FilePath $apiBin `
    -WorkingDirectory (Join-Path $ROOT "apps\api") `
    -PassThru -NoNewWindow

$webJob = Start-Process -FilePath "npm" -ArgumentList "start" `
    -WorkingDirectory (Join-Path $ROOT "apps\web") `
    -PassThru -NoNewWindow

Write-Color Yellow "PIDs: api=$($apiJob.Id) web=$($webJob.Id)"
Write-Color Yellow "Extension built to apps\extension\dist (load unpacked in browser)."
Write-Color Yellow "Press Ctrl+C to stop all. Use .\dev.ps1 -Force to rebuild everything."
Write-Host ""

# Cleanup on Ctrl+C or exit
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    if ($apiJob -and -not $apiJob.HasExited) { $apiJob.Kill() }
    if ($webJob -and -not $webJob.HasExited) { $webJob.Kill() }
}

try {
    while ($true) {
        if ($apiJob.HasExited -and $webJob.HasExited) {
            Write-Color Yellow "All services stopped."
            break
        }
        if ($apiJob.HasExited) {
            Write-Color Red "API exited (code $($apiJob.ExitCode))"
            if (-not $webJob.HasExited) { $webJob.Kill() }
            break
        }
        if ($webJob.HasExited) {
            Write-Color Red "Web exited (code $($webJob.ExitCode))"
            if (-not $apiJob.HasExited) { $apiJob.Kill() }
            break
        }
        Start-Sleep -Milliseconds 500
    }
} finally {
    Write-Color Yellow "Stopping all services..."
    if ($apiJob -and -not $apiJob.HasExited) {
        try { $apiJob.Kill() } catch {}
    }
    if ($webJob -and -not $webJob.HasExited) {
        try { $webJob.Kill() } catch {}
    }
    Write-Color Yellow "Done."
}
