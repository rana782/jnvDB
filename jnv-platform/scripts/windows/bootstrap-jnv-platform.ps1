<#
.SYNOPSIS
  Creates apps/api/.env, optional DB, runs Prisma migrate + seed for local pgAdmin/PostgreSQL.

.PARAMETER PostgresPassword
  Same password you use for user "postgres" in pgAdmin (Connection tab on server jnvDB).

.PARAMETER RepoRoot
  Folder that contains jnv-platform/ (default: three levels above this script → learn_git).

.PARAMETER DatabaseName
  PostgreSQL database name (default: jnv_intel).

.PARAMETER Host
  Default 127.0.0.1 to match typical pgAdmin local setup.

.PARAMETER SkipCreateDatabase
  Set if you already created the database in pgAdmin.

.PARAMETER RunImport
  After seed, run full PDF import (can take a long time).

.PARAMETER SqliteOnly
  Skip PostgreSQL: write .env with SQLite (no password), run prisma db push + seed.

.EXAMPLE
  .\bootstrap-jnv-platform.ps1 -PostgresPassword "yourSecret"

.EXAMPLE
  .\bootstrap-jnv-platform.ps1 -SqliteOnly
#>
param(
  [string] $PostgresPassword = "",
  [string] $RepoRoot = "",
  [string] $DatabaseName = "jnv_intel",
  [string] $Host = "127.0.0.1",
  [int] $Port = 5432,
  [string] $DbUser = "postgres",
  [switch] $SkipCreateDatabase,
  [switch] $RunImport,
  [switch] $SqliteOnly
)

$ErrorActionPreference = "Stop"

if ($SqliteOnly) {
  if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
  }
  $ApiDir = Join-Path $RepoRoot "jnv-platform\apps\api"
  $dataRootUnix = ($RepoRoot -replace '\\', '/')
  $envContent = @"
NODE_ENV=development
PORT=4000
HOST=0.0.0.0
DATABASE_URL=file:./dev.db
JNV_DATA_ROOT=$dataRootUnix
JWT_SECRET=dev-jwt-secret-change-me-32chars
CORS_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
SEED_FOUNDER_ROLLCODE=founder
SEED_FOUNDER_PASSWORD=change-me-in-prod
"@
  $envPath = Join-Path $ApiDir ".env"
  Set-Content -Path $envPath -Value $envContent -Encoding UTF8
  Write-Host "Wrote $envPath (SQLite)"
  Push-Location $ApiDir
  try {
    npx prisma generate
    npx prisma db push --accept-data-loss
    npx prisma db seed
    if ($RunImport) { npm run import:run }
  }
  finally { Pop-Location }
  Write-Host "Done (SQLite). Start: cd apps\api && npm run dev"
  exit 0
}

if (-not $PostgresPassword) {
  throw "Provide -PostgresPassword or use -SqliteOnly (no PostgreSQL password needed)."
}

function Find-Psql {
  $globs = @(
    "C:\Program Files\PostgreSQL\*\bin\psql.exe",
    "C:\Program Files (x86)\PostgreSQL\*\bin\psql.exe"
  )
  foreach ($g in $globs) {
    $found = Get-Item $g -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  return $null
}

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
}

$ApiDir = Join-Path $RepoRoot "jnv-platform\apps\api"
if (-not (Test-Path $ApiDir)) {
  throw "API directory not found: $ApiDir (check RepoRoot)"
}

$dataPdfs = Join-Path $RepoRoot "jnv-platform\tools\pmshri-crawler\data\pdfs"
if (-not (Test-Path $dataPdfs)) {
  $legacyPdfs = Join-Path $RepoRoot "pmshri-crawler\data\pdfs"
  if (-not (Test-Path $legacyPdfs)) {
    Write-Warning "PDF data dir not found at $dataPdfs (or legacy $legacyPdfs) — set JNV_DATA_ROOT if your layout differs."
  }
}

$enc = [uri]::EscapeDataString($PostgresPassword)
$dbUrl = "postgresql://${DbUser}:${enc}@${Host}:${Port}/${DatabaseName}?schema=public"
$dataRootUnix = ($RepoRoot -replace '\\', '/')

$envContent = @"
NODE_ENV=development
PORT=4000
HOST=0.0.0.0
DATABASE_URL=$dbUrl
JNV_DATA_ROOT=$dataRootUnix
JWT_SECRET=dev-jwt-secret-change-me-32chars
CORS_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
SEED_FOUNDER_ROLLCODE=founder
SEED_FOUNDER_PASSWORD=change-me-in-prod
"@

$envPath = Join-Path $ApiDir ".env"
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Host "Wrote $envPath"

if (-not $SkipCreateDatabase) {
  $psql = Find-Psql
  if (-not $psql) {
    Write-Warning "psql.exe not found under Program Files\PostgreSQL. Create database '$DatabaseName' manually in pgAdmin, then re-run with -SkipCreateDatabase."
  }
  else {
    $env:PGPASSWORD = $PostgresPassword
    Write-Host "Creating database '$DatabaseName' if missing (using $psql)..."
    $sql = "SELECT 1 FROM pg_database WHERE datname = '$DatabaseName'"
    $exists = & $psql -h $Host -p $Port -U $DbUser -d postgres -tAc $sql 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "psql failed (check host/port/user/password). Output: $exists"
    }
    if (-not ($exists -match "^\s*1\s*$")) {
      & $psql -h $Host -p $Port -U $DbUser -d postgres -c "CREATE DATABASE `"$DatabaseName`";"
      if ($LASTEXITCODE -ne 0) {
        throw "CREATE DATABASE failed."
      }
      Write-Host "Database '$DatabaseName' created."
    }
    else {
      Write-Host "Database '$DatabaseName' already exists."
    }
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}

Push-Location $ApiDir
try {
  Write-Host "Running prisma migrate deploy..."
  npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed" }

  Write-Host "Running prisma db seed..."
  npx prisma db seed
  if ($LASTEXITCODE -ne 0) { throw "prisma db seed failed" }

  if ($RunImport) {
    Write-Host "Running PDF import (this may take a long time)..."
    npm run import:run
    if ($LASTEXITCODE -ne 0) { throw "import:run failed" }
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Done. Next:"
Write-Host "  1) cd jnv-platform\apps\api   && npm run dev"
Write-Host "  2) cd jnv-platform\apps\web   && npm run dev"
Write-Host "  3) Open http://localhost:5173 — login rollcode: founder / password: change-me-in-prod (unless you changed SEED_FOUNDER_PASSWORD)"
if (-not $RunImport) {
  Write-Host "  Optional: re-run with -RunImport to ingest all PDFs into the database."
}
