#!/bin/bash

set -u

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MACHINE=""
MODE=""
NON_INTERACTIVE=0
DRY_RUN=0
OWNED_OLLAMA_PID=""
OLLAMA_LOG=""

section() {
  printf '\n====================================================================\n'
  printf '%s\n' "$1"
  printf '====================================================================\n'
}

fail() {
  printf '\n启动失败：%s\n' "$1" >&2
  exit 1
}

cleanup() {
  if [[ -n "$OWNED_OLLAMA_PID" ]] && kill -0 "$OWNED_OLLAMA_PID" 2>/dev/null; then
    kill "$OWNED_OLLAMA_PID" 2>/dev/null || true
    wait "$OWNED_OLLAMA_PID" 2>/dev/null || true
  fi
  if [[ -n "$OLLAMA_LOG" && -f "$OLLAMA_LOG" ]]; then
    rm -f "$OLLAMA_LOG"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Finder 启动 .command 时不会加载用户的交互式 shell 配置，先补 Homebrew 常用路径；
# Node 只装在 nvm 里时再加载 nvm，避免明明安装过却被误报为缺失。
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1 && [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  set +u
  . "$HOME/.nvm/nvm.sh"
  nvm use --silent default >/dev/null 2>&1 || true
  set -u
fi

configure_node_proxy() {
  local proxy_output enabled host port proxy_url bypass
  proxy_url="${HTTPS_PROXY:-${https_proxy:-}}"
  if [[ -z "$proxy_url" ]]; then
    proxy_output="$(scutil --proxy 2>/dev/null || true)"
    enabled="$(printf '%s\n' "$proxy_output" | awk '/HTTPSEnable/ { print $3; exit }')"
    host="$(printf '%s\n' "$proxy_output" | awk '/HTTPSProxy/ { print $3; exit }')"
    port="$(printf '%s\n' "$proxy_output" | awk '/HTTPSPort/ { print $3; exit }')"
    if [[ "$enabled" == '1' && -n "$host" && -n "$port" ]]; then
      proxy_url="http://$host:$port"
    fi
  fi
  if [[ -z "$proxy_url" ]]; then
    return 0
  fi

  export HTTPS_PROXY="$proxy_url"
  export HTTP_PROXY="${HTTP_PROXY:-${http_proxy:-$proxy_url}}"
  export https_proxy="$HTTPS_PROXY"
  export http_proxy="$HTTP_PROXY"
  export NODE_USE_ENV_PROXY=1
  bypass="${NO_PROXY:-${no_proxy:-}}"
  case ",$bypass," in
    *,127.0.0.1,*) ;;
    *) bypass="${bypass:+$bypass,}127.0.0.1,localhost" ;;
  esac
  export NO_PROXY="$bypass"
  export no_proxy="$bypass"
  printf 'Node 下载代理：%s\n' "$HTTPS_PROXY"
}

configure_node_proxy

usage() {
  cat <<'EOF'
用法：一键跨机硬件测速-Mac.command [选项]

  --machine <标签>          指定机器标签
  --mode <full|llm|tts>    指定测速模式
  --non-interactive        不询问，未指定时使用默认值
  --dry-run                只打印将执行的命令
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --machine)
      [[ $# -ge 2 ]] || fail '--machine 缺少标签'
      MACHINE="$2"
      shift 2
      ;;
    --mode)
      [[ $# -ge 2 ]] || fail '--mode 缺少模式'
      MODE="$2"
      shift 2
      ;;
    --non-interactive)
      NON_INTERACTIVE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "未知参数：$1"
      ;;
  esac
done

if [[ "$(uname -s)" != 'Darwin' && "$DRY_RUN" -ne 1 ]]; then
  fail '这个入口只用于 macOS；Windows 请双击一键跨机硬件测速.cmd。'
fi

cd "$PROJECT_ROOT" || fail "无法进入工程目录：$PROJECT_ROOT"
[[ -f "$PROJECT_ROOT/package.json" ]] || fail "没有找到 SpeakSpace Local 工程：$PROJECT_ROOT"
command -v node >/dev/null 2>&1 || fail '未检测到 Node.js。请先安装 Node.js LTS，再重新双击。'
command -v npm >/dev/null 2>&1 || fail '未检测到 npm。请先安装 Node.js LTS，再重新双击。'

section 'SpeakSpace Local · macOS 跨机器硬件测速'
printf '%s\n' '只测速度、延迟、内存、统一内存占用和 GPU 卸载；默认不跑准确率评测。'
printf '%s\n' '测速期间请关闭 SpeakSpace Local 和其他高负载程序。'

default_machine="$(scutil --get ComputerName 2>/dev/null || hostname -s 2>/dev/null || hostname 2>/dev/null || printf 'mac')"
if [[ -z "$MACHINE" && "$NON_INTERACTIVE" -ne 1 ]]; then
  printf '\n机器标签（直接回车使用 %s）：' "$default_machine"
  IFS= read -r MACHINE
fi
[[ -n "$MACHINE" ]] || MACHINE="$default_machine"

MACHINE="$(node -e '
  const value = process.argv[1].trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  process.stdout.write(value);
' "$MACHINE")"
[[ -n "$MACHINE" ]] || fail '机器标签不能为空；请使用字母、数字、中文、点、下划线或短横线。'

if [[ -z "$MODE" && "$NON_INTERACTIVE" -ne 1 ]]; then
  printf '\n%s\n' '[1] 完整硬件测速：TTS + LLM + STT（约 1–2 小时，推荐）'
  printf '%s\n' '[2] 快速测速：只测 LLM（约 2 分钟/模型）'
  printf '%s\n' '[3] 只测 TTS（约 1–1.5 小时）'
  printf '%s' '请选择（直接回车选 1）：'
  IFS= read -r choice
  case "$choice" in
    2) MODE='llm' ;;
    3) MODE='tts' ;;
    *) MODE='full' ;;
  esac
fi
[[ -n "$MODE" ]] || MODE='full'
case "$MODE" in
  full|llm|tts) ;;
  *) fail "不支持的测速模式：$MODE" ;;
esac

run_npm() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] npm'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  npm "$@" || fail "npm 命令执行失败：npm $*"
}

section '环境准备'
printf '机器标签：%s\n' "$MACHINE"
printf '测速模式：%s\n' "$MODE"
printf 'Node.js：%s\n' "$(node --version)"

dependencies_ready=1
[[ -f "$PROJECT_ROOT/node_modules/ts-node/register/transpile-only.js" ]] || dependencies_ready=0
if [[ "$MODE" != 'llm' ]]; then
  [[ -d "$PROJECT_ROOT/release/app/node_modules/sherpa-onnx-node" ]] || dependencies_ready=0
  [[ -d "$PROJECT_ROOT/release/app/node_modules/onnxruntime-node" ]] || dependencies_ready=0
fi

if [[ "$dependencies_ready" -eq 0 ]]; then
  printf '%s\n' '首次运行：正在自动安装项目依赖。'
  if [[ -f "$PROJECT_ROOT/package-lock.json" ]]; then
    install_args=(ci)
  else
    install_args=(install)
  fi
  if [[ "$MODE" == 'llm' ]]; then
    install_args+=(--ignore-scripts)
  fi
  run_npm "${install_args[@]}"
else
  printf '%s\n' '项目依赖已就绪。'
fi

normalise_ollama_host() {
  local host="${OLLAMA_HOST:-http://127.0.0.1:11434}"
  if [[ "$host" != http://* && "$host" != https://* ]]; then
    host="http://$host"
  fi
  printf '%s' "${host%/}"
}

ollama_model_count() {
  local response
  response="$(curl --fail --silent --max-time 3 "$OLLAMA_HOST/api/tags" 2>/dev/null)" || return 1
  node -e '
    try {
      const parsed = JSON.parse(process.argv[1]);
      process.stdout.write(String(Array.isArray(parsed.models) ? parsed.models.length : 0));
    } catch {
      process.exit(1);
    }
  ' "$response"
}

find_ollama() {
  OLLAMA_BINARY=''
  OLLAMA_MODELS_ROOT=''
  OLLAMA_PORTABLE=0
  local app_name data_root candidate
  for app_name in 'SpeakSpace Local' 'SpeakSpace' 'speakspace' 'electron-react-boilerplate'; do
    data_root="$HOME/Library/Application Support/$app_name"
    candidate="$data_root/runtimes/llm/bin/ollama"
    if [[ -x "$candidate" ]]; then
      OLLAMA_BINARY="$candidate"
      OLLAMA_MODELS_ROOT="$data_root/models/llm"
      OLLAMA_PORTABLE=1
      return 0
    fi
  done
  if command -v ollama >/dev/null 2>&1; then
    OLLAMA_BINARY="$(command -v ollama)"
    return 0
  fi
  for candidate in \
    '/Applications/Ollama.app/Contents/Resources/ollama' \
    "$HOME/Applications/Ollama.app/Contents/Resources/ollama"; do
    if [[ -x "$candidate" ]]; then
      OLLAMA_BINARY="$candidate"
      return 0
    fi
  done
  return 1
}

ensure_ollama() {
  export OLLAMA_HOST="$(normalise_ollama_host)"
  local count
  if count="$(ollama_model_count)"; then
    printf 'Ollama 已运行，检测到 %s 个模型。\n' "$count"
    [[ "$count" -gt 0 ]] || printf '%s\n' '警告：没有已安装的生成模型，LLM 测速会跳过。'
    return 0
  fi

  if ! find_ollama; then
    printf '%s\n' '警告：没有找到 Ollama，LLM 测速会跳过，其他硬件测速仍会继续。'
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] 将自动启动：%s serve\n' "$OLLAMA_BINARY"
    return 0
  fi

  printf '正在启动 Ollama：%s\n' "$OLLAMA_BINARY"
  OLLAMA_LOG="${TMPDIR:-/tmp}/speakspace-ollama-benchmark-$$.log"
  if [[ "$OLLAMA_PORTABLE" -eq 1 ]]; then
    mkdir -p "$OLLAMA_MODELS_ROOT"
    OLLAMA_HOST='127.0.0.1:11434' OLLAMA_MODELS="$OLLAMA_MODELS_ROOT" \
      "$OLLAMA_BINARY" serve >"$OLLAMA_LOG" 2>&1 &
  else
    OLLAMA_HOST='127.0.0.1:11434' \
      "$OLLAMA_BINARY" serve >"$OLLAMA_LOG" 2>&1 &
  fi
  OWNED_OLLAMA_PID=$!
  export OLLAMA_HOST='http://127.0.0.1:11434'

  local attempt=1
  while [[ "$attempt" -le 30 ]]; do
    sleep 0.5
    if count="$(ollama_model_count)"; then
      printf 'Ollama 启动完成，检测到 %s 个模型。\n' "$count"
      [[ "$count" -gt 0 ]] || printf '%s\n' '警告：没有已安装的生成模型，LLM 测速会跳过。'
      return 0
    fi
    kill -0 "$OWNED_OLLAMA_PID" 2>/dev/null || break
    attempt=$((attempt + 1))
  done
  printf '%s\n' '警告：Ollama 启动失败或超时，LLM 测速会跳过。'
  if [[ -f "$OLLAMA_LOG" ]]; then
    tail -n 5 "$OLLAMA_LOG" >&2
  fi
}

if [[ "$MODE" != 'tts' ]]; then
  ensure_ollama
fi

section '开始测速'
benchmark_args=(run bench -- --machine "$MACHINE" --strict)
case "$MODE" in
  llm) benchmark_args+=(--only llm) ;;
  tts) benchmark_args+=(--only tts,tts-memory,tts-length) ;;
esac
run_npm "${benchmark_args[@]}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '\ndry-run 完成：没有安装依赖、启动服务或执行基准。\n'
  exit 0
fi

results_root="$PROJECT_ROOT/docs/testing/results"
machine_directory="$results_root/machines/$MACHINE"
[[ -d "$machine_directory" ]] || fail "没有找到本机结果目录：$machine_directory"

bundle_directory="$HOME/Library/Caches/SpeakSpace-TTS-Benchmark/bundles"
mkdir -p "$bundle_directory"
timestamp="$(date '+%Y%m%d-%H%M%S')"
bundle_path="$bundle_directory/speakspace-hardware-$MACHINE-$timestamp.zip"
ditto -c -k --keepParent "$machine_directory" "$bundle_path" || fail '结果 ZIP 打包失败'

section '测速完成'
printf '本机结果：%s\n' "$machine_directory"
printf '可拷走的结果包：%s\n' "$bundle_path"
printf '%s\n' '结果目录已经位于仓库 docs/testing/results/machines，可直接提交或拷回主控机汇总。'
if [[ "$NON_INTERACTIVE" -ne 1 ]]; then
  open -R "$bundle_path" 2>/dev/null || true
fi
