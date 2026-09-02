$ErrorActionPreference = 'Stop'

if (-not (Get-Command fnm -ErrorAction SilentlyContinue)) {
    throw 'fnm no está disponible. Abre una PowerShell nueva después de instalar Schniz.fnm.'
}

fnm install 22
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo instalar o localizar Node 22 con fnm.'
}

$nodeExecutableOutput = fnm exec --using=22 node -p 'process.execPath'
if ($LASTEXITCODE -ne 0) {
    throw 'fnm no pudo resolver el ejecutable de Node 22.'
}

$nodeExecutable = ($nodeExecutableOutput | Select-Object -Last 1).Trim()
if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) {
    throw "fnm devolvió una ruta de Node no válida: $nodeExecutable"
}

$nodeInstallDirectory = Split-Path -Parent $nodeExecutable
$nodePathEntries = @(
    $env:Path -split [IO.Path]::PathSeparator |
        Where-Object {
            $_ -and -not [string]::Equals(
                $_,
                $nodeInstallDirectory,
                [StringComparison]::OrdinalIgnoreCase
            )
        }
)
$env:Path = (@($nodeInstallDirectory) + $nodePathEntries) -join [IO.Path]::PathSeparator

$nodeVersion = node --version
if ($nodeVersion -notmatch '^v22\.') {
    throw "Fantasya requiere Node 22; la sesión usa $nodeVersion."
}

$npmVersion = npm --version
if ([int]($npmVersion.Split('.')[0]) -lt 10) {
    throw "Fantasya requiere npm 10 o superior; la sesión usa $npmVersion."
}

Write-Host "Fantasya usa Node $nodeVersion y npm $npmVersion en esta sesión."
