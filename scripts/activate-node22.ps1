$ErrorActionPreference = 'Stop'

if (-not (Get-Command fnm -ErrorAction SilentlyContinue)) {
    throw 'fnm no está disponible. Abre una PowerShell nueva después de instalar Schniz.fnm.'
}

fnm env --shell powershell | Out-String | Invoke-Expression
fnm use --install-if-missing 22

$nodeVersion = node --version
if ($nodeVersion -notmatch '^v22\.') {
    throw "Fantasya requiere Node 22; la sesión usa $nodeVersion."
}

Write-Host "Fantasya usa $nodeVersion en esta sesión."
