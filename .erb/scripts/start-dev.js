/* eslint-disable no-console */
import chalk from 'chalk';
import detectPort from 'detect-port';
import http from 'http';
import { execSync, spawn } from 'child_process';

/**
 * 智能开发启动器：保证「同一时刻只有一个开发服务器」，避免端口到处乱开。
 *
 * 策略：
 *  1. 默认端口（PORT 或 1212）空闲 → 直接用它。
 *  2. 被占用 → 先判断占用者是不是本程序自己的开发服务器：
 *     - 是自己 → 回收（结束旧进程）后在同一端口重启，始终保持单一实例。
 *     - 是别的程序 / 回收失败 → 才去寻找下一个空闲端口作为兜底。
 *  3. 选定端口后设置 PORT 环境变量并启动 start:renderer，
 *     该端口会被 renderer / preload / main / util.ts 逐级继承。
 */

const DEFAULT_PORT = Number(process.env.PORT) || 1212;
// 本程序开发服务器返回的 HTML / HMR 特征，用于识别「是不是自己」。
const APP_MARKER = /SpeakSpace|webpack-dev-server|__webpack_hmr/i;

function probeIsOurServer(port) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/',
        timeout: 1500,
        // dev-server 仅在带 Accept: text/html 时才把 / 回退到 index.html，
        // 否则拿不到含应用标识的 HTML，会误判为「别的程序」。
        headers: { Accept: 'text/html' },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 8192) res.destroy();
        });
        res.on('end', () => resolve(APP_MARKER.test(body)));
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function pidsOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
      const pids = new Set();
      out.split(/\r?\n/).forEach((line) => {
        const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
        if (m && Number(m[1]) === port) pids.add(m[2]);
      });
      return [...pids];
    }
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
    });
    return out.split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

function killPids(pids) {
  pids.forEach((pid) => {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
      } else {
        process.kill(Number(pid), 'SIGKILL');
      }
    } catch {
      /* 进程可能已退出，忽略 */
    }
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitPortFree(port, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const available = await detectPort(port);
    if (available === port) return true;
    // eslint-disable-next-line no-await-in-loop
    await delay(300);
  }
  return false;
}

async function resolvePort() {
  const available = await detectPort(DEFAULT_PORT);
  if (available === DEFAULT_PORT) {
    return DEFAULT_PORT;
  }

  const ours = await probeIsOurServer(DEFAULT_PORT);
  if (ours) {
    console.log(
      chalk.yellow(
        `检测到端口 ${DEFAULT_PORT} 上已有 SpeakSpace Local 开发服务器，正在回收旧实例以保持单一服务…`,
      ),
    );
    killPids(pidsOnPort(DEFAULT_PORT));
    if (await waitPortFree(DEFAULT_PORT)) {
      return DEFAULT_PORT;
    }
    console.log(
      chalk.yellow(`端口 ${DEFAULT_PORT} 未能及时释放，改用其他空闲端口。`),
    );
  } else {
    console.log(
      chalk.yellow(`端口 ${DEFAULT_PORT} 被其他程序占用，改用其他空闲端口。`),
    );
  }

  return detectPort(DEFAULT_PORT + 1);
}

resolvePort()
  .then((port) => {
    process.env.PORT = String(port);
    console.log(chalk.green.bold(`SpeakSpace Local 开发服务器端口：${port}`));
    const child = spawn('npm', ['run', 'start:renderer'], {
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, PORT: String(port) },
    });
    child.on('exit', (code) => process.exit(code ?? 0));
    return null;
  })
  .catch((error) => {
    console.error(chalk.red('启动失败：'), error);
    process.exit(1);
  });
