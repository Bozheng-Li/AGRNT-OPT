[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$sdkVersion = "8.0.423"
$installerSha256 = "6585899AED55FF6AE13DBE1E8C3B878F2D00433520E7EFBE250B75DB948B7DA9"
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$runtimeRoot = Join-Path $repositoryRoot "var\runtime"
$installRoot = Join-Path $runtimeRoot "dotnet-sdk"
$installer = Join-Path $runtimeRoot "dotnet-install.ps1"
$dotnetName = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { "dotnet.exe" } else { "dotnet" }
$dotnet = Join-Path $installRoot $dotnetName

if (Test-Path -LiteralPath $dotnet -PathType Leaf) {
  $installedVersion = (& $dotnet --version).Trim()
  if ($LASTEXITCODE -eq 0 -and $installedVersion -eq $sdkVersion) {
    Write-Host "BumpGuard .NET SDK $sdkVersion is already installed at $installRoot"
    exit 0
  }
}

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri "https://dot.net/v1/dotnet-install.ps1" -OutFile $installer

$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToUpperInvariant()
if ($actualHash -ne $installerSha256) {
  throw "dotnet-install.ps1 SHA-256 mismatch. Expected $installerSha256, received $actualHash. Review the official installer before updating the pinned hash."
}

& $installer -Version $sdkVersion -InstallDir $installRoot -NoPath
if ($LASTEXITCODE -ne 0) {
  throw "The official dotnet installer exited with code $LASTEXITCODE."
}

$installedVersion = (& $dotnet --version).Trim()
if ($LASTEXITCODE -ne 0 -or $installedVersion -ne $sdkVersion) {
  throw "Expected .NET SDK $sdkVersion after installation, received '$installedVersion'."
}

Write-Host "Installed BumpGuard .NET SDK $installedVersion at $installRoot"
