$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
$testRoot = Join-Path $projectRoot ('.local\launcher-tests-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $testRoot
$executable = Join-Path $testRoot 'ServerTests.exe'
& $compiler /nologo /target:exe /codepage:65001 "/out:$executable" "$PSScriptRoot\launcher\LocalServer.cs" "$PSScriptRoot\launcher\ServerTests.cs"
if ($LASTEXITCODE -ne 0) { throw 'Server tests failed to compile.' }
& $executable $testRoot
if ($LASTEXITCODE -ne 0) { throw 'Server tests failed.' }
