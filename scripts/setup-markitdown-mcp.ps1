param(
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $repo ".venv-markitdown"
$pythonExe = Join-Path $venv "Scripts\python.exe"
$requirements = Join-Path $repo "requirements-markitdown-mcp.txt"

if (-not (Test-Path -LiteralPath $pythonExe)) {
  & $Python -m venv $venv
}

& $pythonExe -m pip install --upgrade pip
& $pythonExe -m pip install --requirement $requirements
& $pythonExe -m pip install --no-deps "markitdown-mcp==0.0.1a4"
& $pythonExe -c "import markitdown_mcp, markitdown; print('MarkItDown MCP isolated runtime ready')"
