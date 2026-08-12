$ErrorActionPreference = "Stop"

$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $RepositoryRoot "runtime-build"
$PythonRoot = Join-Path $RuntimeRoot "python"
$PiRoot = Join-Path $RuntimeRoot "pi"
$PythonVersion = "3.12.10"
$PythonArchive = Join-Path $RuntimeRoot "python-embed-amd64.zip"
$PythonUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"

if (Test-Path $RuntimeRoot) {
  Remove-Item -LiteralPath $RuntimeRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $PythonRoot -Force | Out-Null

Write-Host "Downloading the isolated Python runtime..."
Invoke-WebRequest -Uri $PythonUrl -OutFile $PythonArchive
Expand-Archive -LiteralPath $PythonArchive -DestinationPath $PythonRoot -Force
Remove-Item -LiteralPath $PythonArchive -Force

$SitePackages = Join-Path $PythonRoot "Lib\site-packages"
New-Item -ItemType Directory -Path $SitePackages -Force | Out-Null
python -m pip install --disable-pip-version-check --no-compile --target $SitePackages -r (Join-Path $RepositoryRoot "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Could not install the Python runtime dependencies." }

$PathFile = Join-Path $PythonRoot "python312._pth"
@(
  "python312.zip",
  ".",
  "Lib\site-packages",
  "..\backend",
  "import site"
) | Set-Content -LiteralPath $PathFile -Encoding ascii

Write-Host "Creating a portable Pi production dependency tree..."
New-Item -ItemType Directory -Path $PiRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $RepositoryRoot "runtime\pi\package.json") -Destination (Join-Path $PiRoot "package.json")
Copy-Item -LiteralPath (Join-Path $RepositoryRoot "runtime\pi\pnpm-lock.yaml") -Destination (Join-Path $PiRoot "pnpm-lock.yaml")
Copy-Item -LiteralPath (Join-Path $RepositoryRoot "runtime\pi\pnpm-workspace.yaml") -Destination (Join-Path $PiRoot "pnpm-workspace.yaml")
pnpm --dir $PiRoot install --prod --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "Could not create the Pi runtime." }

$PiCli = Join-Path $PiRoot "node_modules\@earendil-works\pi-coding-agent\dist\cli.js"
$PiChrome = Join-Path $PiRoot "node_modules\pi-chrome\extensions\chrome-profile-bridge\index.ts"
if (-not (Test-Path -LiteralPath $PiCli -PathType Leaf)) { throw "Pi CLI is missing from the portable runtime." }
if (-not (Test-Path -LiteralPath $PiChrome -PathType Leaf)) { throw "pi-chrome is missing from the portable runtime." }

Write-Host "Windows backend and Pi runtime are ready."
