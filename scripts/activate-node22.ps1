$ErrorActionPreference = 'Stop'

function Test-TrustedNode22Executable {
    param([string]$Executable)

    if (-not $Executable -or -not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
        return $false
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $Executable
    $signer = $signature.SignerCertificate.Subject
    if (
        $signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid -or
        $signer -notmatch '(^|, )O=OpenJS Foundation(,|$)'
    ) {
        return $false
    }

    $version = & $Executable --version 2>$null
    return $LASTEXITCODE -eq 0 -and $version -match '^v22\.'
}

$nodeExecutable = $null
$currentNode = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
if ($currentNode -and (Test-TrustedNode22Executable $currentNode.Source)) {
    $nodeExecutable = $currentNode.Source
}

if (-not $nodeExecutable) {
    $roamingAppData = [Environment]::GetFolderPath(
        [Environment+SpecialFolder]::ApplicationData
    )
    $versionsDirectory = Join-Path $roamingAppData 'fnm\node-versions'
    if (Test-Path -LiteralPath $versionsDirectory -PathType Container) {
        $versionDirectories = @(
            Get-ChildItem -LiteralPath $versionsDirectory -Directory |
                Where-Object { $_.Name -match '^v22\.\d+\.\d+$' } |
                Sort-Object {
                    [version]$_.Name.Substring(1)
                } -Descending
        )
        foreach ($versionDirectory in $versionDirectories) {
            $candidate = Join-Path $versionDirectory.FullName 'installation\node.exe'
            if (Test-TrustedNode22Executable $candidate) {
                $nodeExecutable = $candidate
                break
            }
        }
    }
}

if (-not $nodeExecutable) {
    throw 'No se encontró un Node 22 oficial y firmado. Ejecuta fnm install 22 en una PowerShell normal y vuelve a intentarlo.'
}

$nodeInstallDirectory = Split-Path -Parent $nodeExecutable
$npmExecutable = Join-Path $nodeInstallDirectory 'npm.cmd'
$npmCli = Join-Path $nodeInstallDirectory 'node_modules\npm\bin\npm-cli.js'
if (
    -not (Test-Path -LiteralPath $npmExecutable -PathType Leaf) -or
    -not (Test-Path -LiteralPath $npmCli -PathType Leaf)
) {
    throw "La instalación Node 22 no contiene su npm local: $nodeInstallDirectory"
}

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

$nodeVersion = & $nodeExecutable --version
if ($nodeVersion -notmatch '^v22\.') {
    throw "Fantasya requiere Node 22; la sesión usa $nodeVersion."
}

$npmVersion = & $nodeExecutable $npmCli --version
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo ejecutar el npm incluido con Node 22.'
}
if ([int]($npmVersion.Split('.')[0]) -lt 10) {
    throw "Fantasya requiere npm 10 o superior; la sesión usa $npmVersion."
}

Set-Alias -Name node -Value $nodeExecutable -Scope Global -Force
Set-Alias -Name npm -Value $npmExecutable -Scope Global -Force

Write-Host "Fantasya usa Node $nodeVersion y npm $npmVersion en esta sesión."
