[CmdletBinding()]
param(
  [string]$Machine,
  [ValidateSet('full', 'llm', 'tts', 'stt', 'llm-stt')]
  [string]$Mode = 'full',
  [switch]$NonInteractive,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$script:OwnedOllamaProcess = $null
$script:NpmCommand = $null

function Get-PropertyValue {
  # Windows PowerShell 5.1 has no null-conditional operator (`$obj?.Prop`),
  # so use this helper for any property read on a possibly-null object.
  param(
    [Parameter(Position = 0)]$InputObject,
    [Parameter(Position = 1, Mandatory = $true)][string]$Name,
    [Parameter(Position = 2)]$Default = $null
  )

  if ($null -eq $InputObject) {
    return $Default
  }
  $property = $InputObject.PSObject.Properties[$Name]
  if (-not $property) {
    return $Default
  }
  if ($null -eq $property.Value) {
    return $Default
  }
  return $property.Value
}

function Write-Section {
  param([string]$Title)

  Write-Host ''
  Write-Host ('=' * 68) -ForegroundColor DarkCyan
  Write-Host $Title -ForegroundColor Cyan
  Write-Host ('=' * 68) -ForegroundColor DarkCyan
}

function Resolve-MachineLabel {
  param([string]$RequestedLabel)

  $fallback = if ($env:COMPUTERNAME) {
    $env:COMPUTERNAME.ToLowerInvariant()
  } else {
    'windows-machine'
  }
  $candidate = $RequestedLabel
  if ([string]::IsNullOrWhiteSpace($candidate)) {
    $candidate = $fallback
  }

  $normalised = $candidate.Trim() -replace '[^\p{L}\p{Nd}._-]+', '-'
  $normalised = $normalised.Trim('-', '.')
  if ([string]::IsNullOrWhiteSpace($normalised)) {
    throw '机器标签不能为空；请使用字母、数字、中文、点、下划线或短横线。'
  }
  return $normalised
}

function Update-ProcessPathFromRegistry {
  # winget 装完东西后系统 PATH 会更新，但当前进程的 PATH 缓存不会自动刷新；
  # 后面新开的子进程（比如再次调用 npm/ollama）看到的还是旧的，所以每次装完都要重新拼一遍。
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machinePath;$userPath"
}

function Install-WithWinget {
  param(
    [string]$Id,
    [string]$DisplayName
  )

  $winget = Get-Command 'winget.exe' -ErrorAction SilentlyContinue
  if (-not $winget) {
    Write-Warning "没有 winget，无法自动安装 $DisplayName；请手动安装后重新运行本脚本。"
    return $false
  }
  Write-Host "正在通过 winget 自动安装 $DisplayName..."
  & $winget.Source install --id $Id -e --accept-package-agreements --accept-source-agreements | Out-Null
  $installOk = $LASTEXITCODE -eq 0
  Update-ProcessPathFromRegistry
  if (-not $installOk) {
    Write-Warning "$DisplayName 自动安装失败（退出码 $LASTEXITCODE）。"
  }
  return $installOk
}

function Ensure-NodeJs {
  $nodeCommand = Get-Command 'node.exe' -ErrorAction SilentlyContinue
  $npmCommand = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
  if ($nodeCommand -and $npmCommand) {
    return [PSCustomObject]@{ Node = $nodeCommand; Npm = $npmCommand }
  }
  if ($DryRun) {
    Write-Host '[dry-run] 将自动安装 Node.js LTS' -ForegroundColor Yellow
    return $null
  }
  Install-WithWinget -Id 'OpenJS.NodeJS.LTS' -DisplayName 'Node.js LTS' | Out-Null
  $nodeCommand = Get-Command 'node.exe' -ErrorAction SilentlyContinue
  $npmCommand = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
  if (-not $nodeCommand -or -not $npmCommand) {
    throw '未检测到 Node.js/npm，且自动安装未成功。请手动安装 Node.js LTS，再重新双击本脚本。'
  }
  return [PSCustomObject]@{ Node = $nodeCommand; Npm = $npmCommand }
}

function Ensure-OllamaBinary {
  $existing = Find-OllamaRuntime
  if ($existing) {
    return $existing
  }
  if ($DryRun) {
    Write-Host '[dry-run] 将自动安装 Ollama' -ForegroundColor Yellow
    return $null
  }
  Install-WithWinget -Id 'Ollama.Ollama' -DisplayName 'Ollama' | Out-Null
  return Find-OllamaRuntime
}

# 模型的补齐交给 bench 自己（bench-machine.ts → bench:llm:fetch），这里只负责把
# Ollama 拉起来。以前 PS1 在这里自己 pull 一个默认模型，有两个问题：
#   1. 只拉 1 个，而跨机器对比需要固定的一整套；
#   2. 只在「一个模型都没有」时才拉，机器上恰好有别的模型就整个跳过。
# 实测后果就是各机器测到的模型集合互不相同，对比图缺格。

# STT 依赖（ffmpeg + whisper.cpp 运行时 + 基准模型集合）同样交给 bench 自己
# （bench-machine.ts → bench:stt:fetch）。以前 PS1 在这里自己装，问题和 LLM 那边一样：
#   1. 只装 whisper-small 一个，而跨机器对比需要目录里全部 16 个 whisper 模型；
#   2. 只在「一个 .bin 都没有」时才装，机器上恰好有别的模型就整个跳过。
# 放在一处还能少起一次 electron —— 那个安装脚本要在 ELECTRON_RUN_AS_NODE 下跑。

function Invoke-Npm {
  param([string[]]$Arguments)

  $display = 'npm ' + ($Arguments -join ' ')
  if ($DryRun) {
    Write-Host "[dry-run] $display" -ForegroundColor Yellow
    return
  }

  if (-not $script:NpmCommand) {
    throw '没有找到可用的 npm，请先安装 Node.js LTS 再重新运行本脚本。'
  }
  $npmPath = Get-PropertyValue $script:NpmCommand 'Source' $script:NpmCommand
  & $npmPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "命令执行失败（退出码 $LASTEXITCODE）：$display"
  }
}

function Get-OllamaStatus {
  param([string]$HostUrl)

  try {
    $request = @{
      Uri = "$($HostUrl.TrimEnd('/'))/api/tags"
      Method = 'Get'
      TimeoutSec = 3
    }
    $response = Invoke-RestMethod @request
    return [PSCustomObject]@{
      Reachable = $true
      ModelCount = @($response.models).Count
    }
  } catch {
    return [PSCustomObject]@{
      Reachable = $false
      ModelCount = 0
    }
  }
}

function Find-OllamaRuntime {
  $appData = [Environment]::GetFolderPath('ApplicationData')
  $appNames = @(
    'SpeakSpace Local',
    'SpeakSpace',
    'speakspace',
    'electron-react-boilerplate'
  )
  foreach ($appName in $appNames) {
    $dataRoot = Join-Path $appData $appName
    $binary = Join-Path $dataRoot 'runtimes\llm\bin\ollama.exe'
    if (Test-Path -LiteralPath $binary) {
      return [PSCustomObject]@{
        Binary = $binary
        ModelsRoot = Join-Path $dataRoot 'models\llm'
        Portable = $true
      }
    }
  }

  $systemOllama = Get-Command 'ollama.exe' -ErrorAction SilentlyContinue
  if ($systemOllama) {
    return [PSCustomObject]@{
      Binary = $systemOllama.Source
      ModelsRoot = $null
      Portable = $false
    }
  }
  return $null
}

function Ensure-Ollama {
  $hostUrl = 'http://127.0.0.1:11434'
  if ($env:OLLAMA_HOST) {
    $hostUrl = $env:OLLAMA_HOST.TrimEnd('/')
    if ($hostUrl -notmatch '^https?://') {
      $hostUrl = "http://$hostUrl"
    }
  }
  $env:OLLAMA_HOST = $hostUrl

  $status = Get-OllamaStatus -HostUrl $hostUrl
  if ($status.Reachable) {
    Write-Host "Ollama 已运行，检测到 $($status.ModelCount) 个模型。"
    return $status
  }

  $runtime = Find-OllamaRuntime
  if (-not $runtime) {
    Write-Warning '没有找到 Ollama。LLM 测速会跳过，其他硬件测速仍会继续。'
    return $status
  }
  if ($DryRun) {
    Write-Host "[dry-run] 将自动启动：$($runtime.Binary) serve" -ForegroundColor Yellow
    return [PSCustomObject]@{ Reachable = $true; ModelCount = 0 }
  }

  Write-Host "正在启动 Ollama：$($runtime.Binary)"
  $serverHost = '127.0.0.1:11434'
  $env:OLLAMA_HOST = $serverHost
  if ($runtime.Portable) {
    New-Item -ItemType Directory -Path $runtime.ModelsRoot -Force | Out-Null
    $env:OLLAMA_MODELS = $runtime.ModelsRoot
  }
  $startOptions = @{
    FilePath = $runtime.Binary
    ArgumentList = 'serve'
    WorkingDirectory = Split-Path -Parent $runtime.Binary
    WindowStyle = 'Hidden'
    PassThru = $true
  }
  $script:OwnedOllamaProcess = Start-Process @startOptions
  $env:OLLAMA_HOST = 'http://127.0.0.1:11434'

  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    $status = Get-OllamaStatus -HostUrl $env:OLLAMA_HOST
    if ($status.Reachable) {
      Write-Host "Ollama 启动完成，检测到 $($status.ModelCount) 个模型。"
      return $status
    }
    if ($script:OwnedOllamaProcess.HasExited) {
      break
    }
  }

  Write-Warning 'Ollama 启动失败或超时。LLM 测速会跳过，其他硬件测速仍会继续。'
  return [PSCustomObject]@{ Reachable = $false; ModelCount = 0 }
}

function Get-BenchmarkResultsRoot {
  return Join-Path $projectRoot 'docs\testing\results'
}

function Get-BenchmarkBundleRoot {
  $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
  return Join-Path $localAppData 'SpeakSpace-TTS-Benchmark\bundles'
}

function New-ResultBundle {
  param([string]$MachineLabel)

  $resultsRoot = Get-BenchmarkResultsRoot
  $machineDirectory = Join-Path (Join-Path $resultsRoot 'machines') $MachineLabel
  if (-not (Test-Path -LiteralPath $machineDirectory)) {
    Write-Warning "没有找到本机结果目录：$machineDirectory"
    return $null
  }

  $bundleDirectory = Get-BenchmarkBundleRoot
  New-Item -ItemType Directory -Path $bundleDirectory -Force | Out-Null
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $bundlePath = Join-Path $bundleDirectory "speakspace-hardware-$MachineLabel-$timestamp.zip"
  $archiveOptions = @{
    LiteralPath = $machineDirectory
    DestinationPath = $bundlePath
    CompressionLevel = 'Optimal'
  }
  Compress-Archive @archiveOptions
  return $bundlePath
}

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$exitCode = 0

try {
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  Set-Location -LiteralPath $projectRoot
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'package.json'))) {
    throw "没有找到 SpeakSpace Local 工程：$projectRoot"
  }

  Write-Section 'SpeakSpace Local · 跨机器硬件测速'
  Write-Host '只测速度、延迟、内存、显存和 GPU 卸载；默认不跑准确率评测。'
  Write-Host '测速期间请关闭 SpeakSpace Local 和其他高负载程序。'

  if (-not $NonInteractive -and -not $PSBoundParameters.ContainsKey('Machine')) {
    $defaultMachine = Resolve-MachineLabel -RequestedLabel $null
    $answer = Read-Host "机器标签（直接回车使用 $defaultMachine）"
    if ([string]::IsNullOrWhiteSpace($answer)) {
      $Machine = $defaultMachine
    } else {
      $Machine = $answer
    }
  }
  $Machine = Resolve-MachineLabel -RequestedLabel $Machine

  if (-not $NonInteractive -and -not $PSBoundParameters.ContainsKey('Mode')) {
    Write-Host ''
    Write-Host '[1] 完整硬件测速：TTS + LLM + STT（约 6–8 小时，推荐；STT 全量占大头）'
    Write-Host '[2] 快速测速：只测 LLM（5 个模型约 10 分钟，首次另需下载约 10 GiB）'
    Write-Host '[3] 只测 TTS（约 1–1.5 小时）'
    Write-Host '[4] 只测 STT（16 个模型约 5 小时，首次另需下载约 18 GiB）'
    Write-Host '[5] 补 LLM + STT，跳过 TTS（TTS 数据已经齐了就选这个）'
    $choice = Read-Host '请选择（直接回车选 1）'
    switch ($choice) {
      '2' { $Mode = 'llm' }
      '3' { $Mode = 'tts' }
      '4' { $Mode = 'stt' }
      '5' { $Mode = 'llm-stt' }
      default { $Mode = 'full' }
    }
  }

  $nodeTools = Ensure-NodeJs
  $nodeCommand = Get-PropertyValue $nodeTools 'Node'
  $script:NpmCommand = Get-PropertyValue $nodeTools 'Npm'

  Write-Section '环境准备'
  Write-Host "机器标签：$Machine"
  Write-Host "测速模式：$Mode"
  if ($nodeCommand) {
    Write-Host "Node.js：$(& $nodeCommand.Source --version)"
  }

  # 每个模式实际要跑哪几步，以及因此需要装什么依赖。
  $needsTts = $Mode -in @('full', 'tts')
  $needsLlm = $Mode -in @('full', 'llm', 'llm-stt')
  $needsStt = $Mode -in @('full', 'stt', 'llm-stt')

  $tsNodeEntry = Join-Path $projectRoot 'node_modules\ts-node\register\transpile-only.js'
  $dependenciesReady = Test-Path -LiteralPath $tsNodeEntry
  if ($needsTts) {
    # sherpa-onnx / onnxruntime 只有 TTS 用得到；STT 走的是 whisper.cpp。
    $ttsRuntime = Join-Path $projectRoot 'release\app\node_modules\sherpa-onnx-node'
    $onnxRuntime = Join-Path $projectRoot 'release\app\node_modules\onnxruntime-node'
    $dependenciesReady = $dependenciesReady -and
      (Test-Path -LiteralPath $ttsRuntime) -and
      (Test-Path -LiteralPath $onnxRuntime)
  }
  if ($needsStt) {
    # STT 的安装脚本要在 ELECTRON_RUN_AS_NODE 下跑，所以 electron 必须真的装上，
    # 不能用 --ignore-scripts 糊过去。
    $dependenciesReady = $dependenciesReady -and
      (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\electron\dist'))
  }
  if (-not $dependenciesReady) {
    Write-Host '首次运行：正在自动安装项目依赖。'
    $installCommand = if (Test-Path -LiteralPath (Join-Path $projectRoot 'package-lock.json')) {
      @('ci')
    } else {
      @('install')
    }
    if ($Mode -eq 'llm') {
      $installCommand += '--ignore-scripts'
    }
    Invoke-Npm -Arguments $installCommand
  } else {
    Write-Host '项目依赖已就绪。'
  }

  if ($needsLlm) {
    Ensure-OllamaBinary | Out-Null
    $ollamaStatus = Ensure-Ollama
    if ($ollamaStatus.Reachable) {
      Write-Host '基准 LLM 模型集合会在测速开始前自动补齐（只下缺的，首次约 10 GiB）。'
    }
  }

  if ($needsStt) {
    Write-Host 'STT 依赖（ffmpeg + whisper 运行时 + 全部 16 个模型）会在测速开始前自动补齐（首次约 18 GiB）。'
    Write-Host 'STT 这一步本身也慢：16 个模型全跑完，较快的机器约 5 小时。' -ForegroundColor Yellow
  }

  Write-Section '开始测速'
  $benchmarkArguments = @('run', 'bench', '--', '--machine', $Machine)
  switch ($Mode) {
    'llm' { $benchmarkArguments += @('--only', 'llm') }
    'tts' { $benchmarkArguments += @('--only', 'tts,tts-memory,tts-length') }
    'stt' { $benchmarkArguments += @('--only', 'stt') }
    'llm-stt' { $benchmarkArguments += @('--only', 'llm,stt') }
  }
  Invoke-Npm -Arguments $benchmarkArguments

  if ($DryRun) {
    Write-Host ''
    Write-Host 'dry-run 完成：没有安装依赖、启动服务或执行基准。' -ForegroundColor Green
  } else {
    $bundlePath = New-ResultBundle -MachineLabel $Machine
    Write-Section '测速完成'
    Write-Host "本机结果：$(Join-Path (Join-Path (Get-BenchmarkResultsRoot) 'machines') $Machine)"
    if ($bundlePath) {
      Write-Host "可拷走的结果包：$bundlePath" -ForegroundColor Green
    }
    Write-Host '结果已经位于仓库 docs\testing\results\machines，可直接提交或拷回主控机汇总。'
  }
} catch {
  $exitCode = 1
  Write-Host ''
  Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
} finally {
  if ($script:OwnedOllamaProcess -and -not $script:OwnedOllamaProcess.HasExited) {
    Stop-Process -Id $script:OwnedOllamaProcess.Id -ErrorAction SilentlyContinue
  }
}

exit $exitCode
