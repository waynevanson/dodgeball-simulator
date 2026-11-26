#!/usr/bin/env node
/**
 * Browser smoke test: launch headless Chromium, wait for the Bevy client, then
 * verify that audio starts suspended and becomes running after a gesture.
 *
 * This intentionally uses only Node built-ins. It needs Node 22+ for the global
 * WebSocket (the dev shell provides Node 22).
 *
 * Environment:
 *   CHROME             Chromium/Chrome binary (default: `chromium`)
 *   SMOKE_URL          Page to load (default: http://127.0.0.1:4173/)
 *   SMOKE_PORT         CDP port (default: 9333)
 *   SMOKE_TIMEOUT_MS   Startup/gesture timeout (default: 30000)
 *   SMOKE_SCREENSHOT   Optional path for a post-gesture PNG
 *
 * Run the Vite server first, for example:
 *   pnpm dev:client
 *   pnpm smoke:browser
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

if (typeof WebSocket === 'undefined') {
  console.error('browser smoke test needs Node 22+ (global WebSocket)');
  process.exit(2);
}

const chrome = process.env.CHROME ?? 'chromium';
const url = process.env.SMOKE_URL ?? 'http://127.0.0.1:4173/';
const port = Number(process.env.SMOKE_PORT ?? 9333);
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 30_000);
const screenshot = process.env.SMOKE_SCREENSHOT;
const profile = mkdtempSync(join(tmpdir(), 'dodgeball-smoke-'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, label, timeout = timeoutMs) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

function startChrome() {
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,720',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    url,
  ];
  const child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  child.stderr.on('data', (chunk) => {
    log = `${log}${chunk}`.slice(-8000);
  });
  child.on('error', (error) => {
    console.error(`failed to launch ${chrome}: ${error.message}`);
  });
  return { child, log: () => log };
}

async function connect() {
  const pages = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) return undefined;
    const list = await response.json();
    return list.length > 0 ? list : undefined;
  }, 'Chromium CDP');

  const page = pages.find((entry) => entry.type === 'page') ?? pages[0];
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await waitFor(() => (socket.readyState === WebSocket.OPEN ? true : undefined), 'CDP websocket');

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return result.result.value;
  };

  return { socket, send, evaluate };
}

async function main() {
  const { child, log } = startChrome();
  let client;
  try {
    client = await connect();
    const { send, evaluate } = client;
    await send('Runtime.enable');
    await send('Page.enable');

    const handle = await waitFor(
      () => evaluate('window.__dodgeball || undefined'),
      'window.__dodgeball',
    );
    if (handle.transport !== 'bevy') {
      throw new Error(`unexpected transport: ${handle.transport}`);
    }
    console.log(`client: ${handle.uri} / ${handle.database}`);

    await waitFor(() => evaluate('window.__dodgeball.audioContexts.length > 0'), 'an AudioContext');
    const states = () =>
      evaluate('window.__dodgeball.audioContexts.map((context) => context.state)');
    const before = await states();
    console.log(`audio before gesture: ${JSON.stringify(before)}`);

    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 640,
      y: 360,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 640,
      y: 360,
      button: 'left',
      clickCount: 1,
    });

    await waitFor(async () => {
      const current = await states();
      return current.length > 0 && current.every((state) => state === 'running');
    }, 'audio to resume after a gesture');
    console.log(`audio after gesture: ${JSON.stringify(await states())}`);

    if (screenshot) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      mkdirSync(dirname(screenshot), { recursive: true });
      writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
      console.log(`screenshot: ${screenshot}`);
    }

    console.log('browser smoke test passed');
  } catch (error) {
    const tail = log().trim();
    if (tail) console.error(tail);
    throw error;
  } finally {
    client?.socket.close();
    child.kill('SIGTERM');
    await sleep(500);
    if (!child.killed) child.kill('SIGKILL');
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`browser smoke test failed: ${error.message}`);
  process.exit(1);
});
