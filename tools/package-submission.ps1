[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RuntimeArchive
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeInput = (Resolve-Path -LiteralPath $RuntimeArchive).Path
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'The submission version must use major.minor.patch.' }
$title = '画中奇谭_V' + $version
$submissionName = $title + '_提交版'
$runtimeName = $title + '_运行版_Windows'
$sourceName = $title + '_源码版'
$releaseRoot = Join-Path $projectRoot 'release'
$destination = Join-Path $releaseRoot $submissionName
$finalArchive = Join-Path $releaseRoot ($submissionName + '.zip')
if ((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $finalArchive)) {
    throw 'This submission version already exists. Existing submissions are never overwritten.'
}
$utf8 = New-Object Text.UTF8Encoding($true)
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-Sha256([string]$Path) {
    $hash = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $hash.Dispose() }
}

Push-Location $projectRoot
try {
    $changes = & git status --porcelain --untracked-files=all
    if ($LASTEXITCODE -ne 0) { throw 'Run submission packaging from the Git repository.' }
    if ($changes) { throw 'Commit the source changes before packaging so the source snapshot is reproducible.' }
    $commit = & git rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the source revision.' }

    $runtimeHash = Get-Sha256 $runtimeInput
    if (Test-Path -LiteralPath ($runtimeInput + '.sha256')) {
        $expectedHash = ((Get-Content -LiteralPath ($runtimeInput + '.sha256') -Raw).Trim() -split '\s+')[0]
        if ($runtimeHash -ne $expectedHash) { throw 'The supplied runtime archive failed its checksum.' }
    }

    $stage = Join-Path $projectRoot ('.local\submission-' + [Guid]::NewGuid().ToString('N'))
    $runtimeExtract = Join-Path $stage 'confirmed-runtime'
    $null = New-Item -ItemType Directory -Path $runtimeExtract
    [IO.Compression.ZipFile]::ExtractToDirectory($runtimeInput, $runtimeExtract)
    $runtimeRoots = @(Get-ChildItem -LiteralPath $runtimeExtract -Directory)
    if ($runtimeRoots.Count -ne 1) { throw 'Expected a runtime archive with one top-level directory.' }
    $original = $runtimeRoots[0].FullName
    foreach ($required in @('画中奇谭.exe', '画中奇谭.exe.config', 'app\index.html', '第三方许可')) {
        if (-not (Test-Path -LiteralPath (Join-Path $original $required))) { throw "Missing runtime content: $required" }
    }

    # Preserve the verified executable and every application resource byte for byte.
    $runtimeRoot = Join-Path $stage $runtimeName
    $null = New-Item -ItemType Directory -Path $runtimeRoot
    foreach ($item in @('画中奇谭.exe', '画中奇谭.exe.config', 'app', '第三方许可')) {
        Copy-Item -LiteralPath (Join-Path $original $item) -Destination $runtimeRoot -Recurse
    }
    Copy-Item -LiteralPath "$projectRoot\docs\submission\运行说明.txt" -Destination (Join-Path $runtimeRoot '00_运行说明.txt')
    $originalFiles = @(Get-ChildItem -LiteralPath $original -Recurse -File | Where-Object { $_.Name -ne '使用说明.txt' })
    foreach ($file in $originalFiles) {
        $relative = $file.FullName.Substring($original.Length + 1)
        $copy = Join-Path $runtimeRoot $relative
        if (-not (Test-Path -LiteralPath $copy) -or (Get-Sha256 $file.FullName) -ne (Get-Sha256 $copy)) {
            throw "Runtime payload mismatch: $relative"
        }
    }

    $snapshot = Join-Path $stage 'source-snapshot.zip'
    & git archive --format=zip "--prefix=$sourceName/" "--output=$snapshot" HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Could not export the source snapshot.' }
    $sourceExtract = Join-Path $stage 'source'
    [IO.Compression.ZipFile]::ExtractToDirectory($snapshot, $sourceExtract)
    $sourceRoot = Join-Path $sourceExtract $sourceName
    Copy-Item -LiteralPath "$projectRoot\docs\submission\源码使用说明.txt" -Destination (Join-Path $sourceRoot '00_源码使用说明.txt')

    $submissionRoot = Join-Path $stage $submissionName
    $null = New-Item -ItemType Directory -Path $submissionRoot
    $runtimeZip = Join-Path $submissionRoot ('01_' + $runtimeName + '.zip')
    $sourceZip = Join-Path $submissionRoot ('02_' + $sourceName + '.zip')
    [IO.Compression.ZipFile]::CreateFromDirectory($runtimeRoot, $runtimeZip, [IO.Compression.CompressionLevel]::Optimal, $true)
    [IO.Compression.ZipFile]::CreateFromDirectory($sourceRoot, $sourceZip, [IO.Compression.CompressionLevel]::Optimal, $true)

    $readme = @"
画中奇谭 · 中国传世名画沉浸式交互体验
正式提交版 V$version

一、直接体验作品（推荐评委使用）
打开 01_${runtimeName}.zip，选择“全部解压”，双击其中的“画中奇谭.exe”。
浏览器自动打开后，点击画卷并选择“入画”。无需安装开发环境或输入命令。
适用于 Windows 10 / 11，使用 Edge 或 Chrome；作品主体可离线体验。
详细操作见运行版中的“00_运行说明.txt”。

二、查阅与运行源码
打开 02_${sourceName}.zip 并全部解压，先阅读“00_源码使用说明.txt”。
包含项目源码、完整素材、依赖锁定文件、测试、启动器源码和项目文档。

三、作品内容
《江山秋色图》：入画漫游，在山水中感受古人的生活与意境。
《韩熙载夜宴图》：循席观宴、探索明暗线索，并了解后世对画作的研究与解读。
《鹿王本生》：参与壁画敷彩，走近敦煌故事与历代文化保护者的努力。
以科技与创意连接古今，在交互体验中讲好中国故事，感受中华文脉的传承。

四、版本信息
作品版本：V$version
源码提交：$commit
生成时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')
运行版内容与已确认可运行的评审包逐文件校验一致，仅规范目录命名并简化使用说明。
SHA256SUMS.txt 提供两个子包的完整性校验值，普通使用无需操作此文件。
"@
    [IO.File]::WriteAllText((Join-Path $submissionRoot '00_提交说明.txt'), $readme, $utf8)
    $checksums = (Get-Sha256 $runtimeZip) + '  ' + [IO.Path]::GetFileName($runtimeZip) + "`r`n" +
        (Get-Sha256 $sourceZip) + '  ' + [IO.Path]::GetFileName($sourceZip) + "`r`n"
    [IO.File]::WriteAllText((Join-Path $submissionRoot 'SHA256SUMS.txt'), $checksums, $utf8)

    $null = New-Item -ItemType Directory -Path $releaseRoot -Force
    $stagedArchive = Join-Path $stage ($submissionName + '.zip')
    [IO.Compression.ZipFile]::CreateFromDirectory($submissionRoot, $stagedArchive, [IO.Compression.CompressionLevel]::NoCompression, $true)
    # Move only this newly created submission, with both paths bounded to the workspace.
    $workspacePrefix = $projectRoot.TrimEnd('\') + '\'
    foreach ($path in @($submissionRoot, $destination, $stagedArchive, $finalArchive)) {
        if (-not [IO.Path]::GetFullPath($path).StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'A submission output path escaped the workspace.'
        }
    }
    Move-Item -LiteralPath $submissionRoot -Destination $destination
    Move-Item -LiteralPath $stagedArchive -Destination $finalArchive
    [IO.File]::WriteAllText(($finalArchive + '.sha256'), ((Get-Sha256 $finalArchive) + '  ' + [IO.Path]::GetFileName($finalArchive) + "`r`n"), $utf8)
    Write-Host "Submission: $finalArchive"
    Write-Host ('Size: {0:N1} MB' -f ((Get-Item -LiteralPath $finalArchive).Length / 1MB))
    Write-Host "Source revision: $commit"
    Write-Host "Preserved runtime files: $($originalFiles.Count)"
}
finally { Pop-Location }
