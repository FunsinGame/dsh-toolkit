param(
    [switch]$NoTest,
    [switch]$Run
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $root) {
    $root = (Get-Location).Path
}
$src = Join-Path $root 'src'
$assets = Join-Path $root 'assets'
$release = Join-Path $root 'release'
$exe = Join-Path $release 'ExplorerStateKeeper.exe'
$icon = Join-Path $assets 'app.ico'
$manifest = Join-Path $src 'app.manifest'

$cscCandidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$csc = $cscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) {
    throw '找不到 .NET Framework 4.x 的 csc.exe。请确认已启用 .NET Framework 4.8。'
}
if (-not (Test-Path $icon)) {
    throw "缺少图标文件：$icon"
}
if (-not (Test-Path $manifest)) {
    throw "缺少清单文件：$manifest"
}

New-Item -ItemType Directory -Force -Path $release | Out-Null

$sources = Get-ChildItem -Path $src -Filter '*.cs' | Sort-Object Name | ForEach-Object { $_.FullName }

$cscArgs = @(
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    '/debug-',
    '/codepage:65001',
    '/utf8output',
    '/highentropyva+',
    "/out:$exe",
    "/win32icon:$icon",
    "/win32manifest:$manifest",
    "/resource:$icon,app.ico",
    '/r:System.dll',
    '/r:System.Core.dll',
    '/r:System.Drawing.dll',
    '/r:System.Windows.Forms.dll',
    '/r:System.Web.Extensions.dll',
    '/r:Microsoft.CSharp.dll'
)

Write-Host "编译 $exe ..."
& $csc @cscArgs $sources
if ($LASTEXITCODE -ne 0) {
    throw "C# 编译失败（退出码 $LASTEXITCODE）。"
}

if (-not (Test-Path $exe)) {
    throw "编译完成但没有生成 $exe"
}

$hash = (Get-FileHash -Algorithm SHA256 -Path $exe).Hash
$size = (Get-Item $exe).Length
Write-Host ("生成成功：{0:N0} 字节" -f $size)
Write-Host "SHA256: $hash"

if (-not $NoTest) {
    $testDir = Join-Path $release '.self-test'
    if (Test-Path $testDir) {
        Remove-Item -Path $testDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $testDir | Out-Null

    Write-Host '运行自检 ...'
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $exe
    $startInfo.Arguments = '--self-test --data-dir "' + $testDir + '"'
    $startInfo.UseShellExecute = $false
    $process = [System.Diagnostics.Process]::Start($startInfo)
    if (-not $process.WaitForExit(30000)) {
        try { $process.Kill() } catch { }
        throw '自检进程超时（30 秒）。'
    }
    $report = Join-Path $testDir 'self-test.txt'
    if (Test-Path $report) {
        Get-Content -Path $report -Encoding UTF8 | ForEach-Object { Write-Host $_ }
    }
    if ($process.ExitCode -ne 0) {
        throw "自检失败（退出码 $($process.ExitCode)）。报告：$report"
    }
    Write-Host '自检通过。'
    Remove-Item -Path $testDir -Recurse -Force
}

if ($Run) {
    Start-Process -FilePath $exe
}
