import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const publicHost = 'deepseek-harness-herb.zo.computer';
const prefix = '/superagent';

function piCredential(provider) {
  try {
    const auth = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.pi', 'agent', 'auth.json'), 'utf8'));
    return auth?.[provider]?.key;
  } catch {
    return undefined;
  }
}

function modalLlmKey() {
  try {
    return fs.readFileSync('/root/.config/modal-llm/endpoint_key', 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

function leafEnv(name) {
  const env = { ...process.env };
  if (name !== 'superagent') return env;
  const ollama = piCredential('ollama-cloud');
  if (ollama) env.OLLAMA_CLOUD_API_KEY = ollama;
  const modal = modalLlmKey();
  if (modal) env.MODAL_LLM_KEY = modal;
  return env;
}

function leaf(name, command, args, cwd, upstreamPort, publicUrl) {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: leafEnv(name),
  });
  const leafState = { name, port: upstreamPort, publicUrl, child, token: undefined, cookie: undefined, pending: '', assets: new Map() };
  child.stdout.on('data', chunk => {
    leafState.pending += chunk.toString();
    let end;
    while ((end = leafState.pending.indexOf('\n')) >= 0) {
      const line = leafState.pending.slice(0, end);
      const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(line);
      if (match) {
        leafState.token = match[1];
        establish(leafState);
      }
      console.log(`[${name}] ${match ? 'Harness login ready behind the private Zo gateway.' : line}`);
      leafState.pending = leafState.pending.slice(end + 1);
    }
  });
  child.on('exit', code => console.error(`[${name}] exited with code ${code}`));
  return leafState;
}

function establish(leafState) {
  return new Promise(resolve => {
    const login = http.get(
      { hostname: '127.0.0.1', port: leafState.port, headers: { host: publicHost }, path: `/?token=${encodeURIComponent(leafState.token)}` },
      response => {
        const cookies = response.headers['set-cookie'];
        response.resume();
        if ((response.statusCode === 303 || response.statusCode === 302) && cookies?.length) {
          leafState.cookie = cookies.map(cookie => cookie.split(';')[0]).join('; ');
          console.log(`[${leafState.name}] Private Zo gateway session ready.`);
        } else console.error(`[${leafState.name}] Harness session initialization failed:`, response.statusCode);
        resolve();
      },
    );
    login.on('error', error => {
      console.error(`[${leafState.name}] Harness session initialization failed:`, error.code);
      resolve();
    });
    login.setTimeout(15000, () => {
      login.destroy();
      resolve();
    });
  });
}

function sessionHeaders(leafState, headers, pathname = '/') {
  if (!leafState.cookie) return headers;
  const cookies = (headers.cookie ?? '')
    .split(';')
    .map(cookie => cookie.trim())
    .filter(cookie => cookie && !cookie.startsWith('dsh-auth-'));
  const api = pathname.startsWith('/orchestrator/api/');
  const host = api ? `127.0.0.1:${leafState.port}` : publicHost;
  const forwarded = { ...headers, host, cookie: [...cookies, leafState.cookie].join('; ') };
  if (headers.origin === 'http://127.0.0.1:3080' || headers.origin === 'http://localhost:3080') forwarded.origin = `https://${publicHost}`;
  if (api) forwarded.origin = `http://${host}`;
  return forwarded;
}

const web = leaf(
  'web',
  '/usr/bin/dsh',
  ['web', '--patch', '/home/workspace/rea-test/harness.patch.yml', '--host', '127.0.0.1', '--port', '3082', '--no-open', '--public-url', `https://${publicHost}/`, '--trusted-host', publicHost],
  '/home/workspace/rea-test',
  3082,
  `https://${publicHost}/`,
);
const superagent = leaf(
  'superagent',
  '/usr/bin/dsh',
  ['--profile', 'superagent', '--host', '127.0.0.1', '--port', '3084', '--no-open', '--public-url', `https://${publicHost}${prefix}/`, '--trusted-host', publicHost],
  '/home/workspace/Projects/dsh-superagent-prototype',
  3084,
  `https://${publicHost}${prefix}/`,
);

function rewriteHtml(leafState, html) {
  if (leafState !== web) return html;
  return html.replace(/plugins\/\?\?[^\"'<>\s]+/g, original => {
    const target = '/' + original.replaceAll('&amp;', '&');
    const alias = '/dsh-assets/' + createHash('sha256').update(target).digest('hex').slice(0, 16) + '.js';
    leafState.assets.set(alias, target);
    return alias;
  });
}

const server = http.createServer((req, res) => {
  const raw = req.url ?? '/';
  const prefixed = raw === prefix || raw.startsWith(prefix + '/');
  const ownsRequest = prefixed || raw === '/orchestrator' || raw.startsWith('/orchestrator/');
  const leafState = ownsRequest ? superagent : web;
  const stripped = prefixed ? raw.slice(prefix.length) || '/' : raw;
  const url = new URL(web.assets.get(stripped) ?? stripped, 'http://localhost');
  const pathLogin = /^\/dsh-login-([A-Za-z0-9_-]+)$/.exec(url.pathname);
  if (pathLogin && req.method === 'GET') {
    url.pathname = '/';
    url.search = '';
    url.searchParams.set('token', pathLogin[1]);
  }
  if (url.pathname === '/' && url.searchParams.has('dsh_launch')) {
    if (url.searchParams.getAll('dsh_launch').length !== 1 || url.searchParams.has('token')) {
      res.writeHead(400).end('Invalid launch parameters');
      return;
    }
    url.searchParams.set('token', url.searchParams.get('dsh_launch'));
    url.searchParams.delete('dsh_launch');
  }
  if (url.pathname === '/login' && (req.method === 'GET' || req.method === 'HEAD')) {
    establish(leafState).then(() => {
      if (!leafState.cookie) {
        res.writeHead(503, { 'retry-after': '3', 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' });
        res.end('The harness did not issue a fresh session. It may still be starting; retry in a few seconds.');
        return;
      }
      res.writeHead(302, { location: prefixed ? prefix + '/' : '/', 'cache-control': 'no-store' });
      res.end();
    });
    return;
  }
  forward(leafState, url, req, res, prefixed, false);
});

function forward(leafState, url, req, res, prefixed, retried) {
  if (!leafState.cookie) {
    if (leafState.token && !retried) {
      establish(leafState).then(() => forward(leafState, url, req, res, prefixed, true));
      return;
    }
    res.writeHead(503, { 'retry-after': '2', 'cache-control': 'no-store' });
    res.end('Harness session is starting. Refresh in a moment.');
    return;
  }
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: leafState.port,
      method: req.method,
      path: url.pathname + url.search,
      headers: sessionHeaders(leafState, { ...req.headers, 'accept-encoding': 'identity' }, url.pathname),
    },
    response => {
      if (response.statusCode >= 400) console.error(JSON.stringify({ event: 'upstream-error', leaf: leafState.name, path: url.pathname, status: response.statusCode }));
      if (response.statusCode === 200 && response.headers['content-type']?.includes('text/html')) {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const html = rewriteHtml(leafState, Buffer.concat(chunks).toString());
          const headers = { ...response.headers, 'cache-control': 'no-store' };
          delete headers['content-length'];
          delete headers['transfer-encoding'];
          res.writeHead(200, headers);
          res.end(html);
        });
        return;
      }
      if (response.statusCode === 401 && !retried && (req.method === 'GET' || req.method === 'HEAD')) {
        response.resume();
        establish(leafState).then(() => forward(leafState, url, req, res, prefixed, true));
        return;
      }
      if (response.statusCode === 401 && req.method === 'GET' && url.pathname === '/' && !url.searchParams.has('token') && leafState.token) {
        response.resume();
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        });
        res.end(
          `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DeepSeek Harness</title><body style="font:18px system-ui;max-width:640px;margin:12vh auto;padding:24px"><h1>DeepSeek Harness</h1><p>Open your private agent workspace.</p><a href="${prefixed ? prefix : ''}/dsh-login-${leafState.token}">Open workspace</a></body></html>`,
        );
        return;
      }
      if (url.pathname === '/')
        console.log(
          JSON.stringify({
            event: 'browser-entry',
            leaf: leafState.name,
            at: new Date().toISOString(),
            method: req.method,
            host: req.headers.host,
            launchPresent: url.searchParams.has('token'),
            sessionCookiePresent: /(?:^|;\s*)dsh-auth-/.test(req.headers.cookie ?? ''),
            status: response.statusCode,
            setsSessionCookie: Boolean(response.headers['set-cookie']),
          }),
        );
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('Harness is starting; retry shortly.');
  });
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}

server.on('upgrade', (req, socket, head) => {
  const raw = req.url ?? '/';
  const prefixed = raw === prefix || raw.startsWith(prefix + '/');
  const leafState = prefixed ? superagent : web;
  const target = prefixed ? raw.slice(prefix.length) || '/' : raw;
  if (!leafState.cookie) {
    socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
    return;
  }
  const upstream = net.connect(leafState.port, '127.0.0.1', () => {
    upstream.write(`${req.method} ${target} HTTP/${req.httpVersion}\r\n`);
    for (const [name, value] of Object.entries(sessionHeaders(leafState, req.headers))) {
      if (Array.isArray(value)) for (const item of value) upstream.write(`${name}: ${item}\r\n`);
      else if (value !== undefined) upstream.write(`${name}: ${value}\r\n`);
    }
    upstream.write('\r\n');
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
  socket.on('close', () => upstream.destroy());
});

server.listen(3080, '127.0.0.1');
server.on('error', () => {
  web.child.kill('SIGTERM');
  superagent.child.kill('SIGTERM');
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    server.close();
    web.child.kill(signal);
    superagent.child.kill(signal);
  });
for (const leafState of [web, superagent]) leafState.child.on('exit', code => console.log(`[${leafState.name}] child exit ${code}`));
