[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework compiler is unavailable.' }

Push-Location $projectRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'The production build failed.' }

    # Each build gets its own directory; existing review packages are preserved.
    $packageName = '画中奇谭-免安装评审版-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
    $releaseRoot = Join-Path $projectRoot 'release'
    $bundle = Join-Path $releaseRoot $packageName
    $null = New-Item -ItemType Directory -Path $bundle
    $app = Join-Path $bundle 'app'
    Copy-Item -LiteralPath (Join-Path $projectRoot 'dist') -Destination $app -Recurse
    $executable = Join-Path $bundle '画中奇谭.exe'
    & $compiler /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 "/out:$executable" "/win32manifest:$PSScriptRoot\launcher\app.manifest" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "$PSScriptRoot\launcher\Program.cs" "$PSScriptRoot\launcher\LocalServer.cs"
    if ($LASTEXITCODE -ne 0) { throw 'The launcher compilation failed.' }
    $utf8 = New-Object Text.UTF8Encoding($true)
    [IO.File]::WriteAllText(($executable + '.config'), '<?xml version="1.0" encoding="utf-8"?><configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.6" /></startup></configuration>', $utf8)
    Copy-Item -LiteralPath "$PSScriptRoot\launcher\使用说明.txt" -Destination $bundle

    $licenses = Join-Path $bundle '第三方许可'
    $null = New-Item -ItemType Directory -Path $licenses
    $packages = @('react', 'react-dom', 'scheduler', 'three', '@fontsource/ma-shan-zheng', '@fontsource/noto-serif-sc')
    foreach ($package in $packages) {
        $source = Join-Path $projectRoot "node_modules/$package/LICENSE"
        $name = $package.Replace('@', '').Replace('/', '-') + '.txt'
        Copy-Item -LiteralPath $source -Destination (Join-Path $licenses $name)
    }
    Copy-Item -LiteralPath (Join-Path $projectRoot 'node_modules/gsap/README.md') -Destination (Join-Path $licenses 'GSAP.md')

    $zip = Join-Path $releaseRoot ($packageName + '.zip')
    Compress-Archive -LiteralPath $bundle -DestinationPath $zip -CompressionLevel Optimal
    $hash = [Security.Cryptography.SHA256]::Create()
    $archiveStream = [IO.File]::OpenRead($zip)
    try { $checksum = [BitConverter]::ToString($hash.ComputeHash($archiveStream)).Replace('-', '') }
    finally { $archiveStream.Dispose(); $hash.Dispose() }
    [IO.File]::WriteAllText(($zip + '.sha256'), "$checksum  $packageName.zip`r`n", $utf8)
    Write-Host "`nReview package: $zip"
    Write-Host ('Size: {0:N1} MB' -f ((Get-Item -LiteralPath $zip).Length / 1MB))
    Write-Host "SHA256: $checksum"
}
finally { Pop-Location }
