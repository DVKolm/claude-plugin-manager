import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IncomingMessage, ServerResponse } from 'http';
import { ServerInfo } from './types';

const SERVER_INFO_PATH = path.join(os.homedir(), '.claude', 'plugins', 'plugin-manager.json');

let sessionToken: string = '';
let sessionCookieValue: string = '';
let tokenUsed = false;

export function generateToken(): string {
  sessionToken = crypto.randomBytes(32).toString('hex');
  sessionCookieValue = crypto.randomBytes(32).toString('hex');
  tokenUsed = false;
  return sessionToken;
}

export function getTokenHash(): string {
  return crypto.createHash('sha256').update(sessionToken).digest('hex');
}

export function writeServerInfo(port: number): void {
  const info: ServerInfo = {
    port,
    pid: process.pid,
    tokenHash: getTokenHash(),
    startedAt: new Date().toISOString(),
  };
  const dir = path.dirname(SERVER_INFO_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SERVER_INFO_PATH, JSON.stringify(info, null, 2), { mode: 0o600 });
}

export function cleanupServerInfo(): void {
  try { fs.unlinkSync(SERVER_INFO_PATH); } catch { /* ignore */ }
}

export function readExistingServerInfo(): ServerInfo | null {
  try {
    const raw = fs.readFileSync(SERVER_INFO_PATH, 'utf-8');
    return JSON.parse(raw) as ServerInfo;
  } catch {
    return null;
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getCookieName(port: number): string {
  return `pm-${port}`;
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie || '';
  const cookies: Record<string, string> = {};
  header.split(';').forEach(pair => {
    const [k, ...v] = pair.split('=');
    if (k) cookies[k.trim()] = v.join('=').trim();
  });
  return cookies;
}

export function validateHost(req: IncomingMessage, port: number): boolean {
  const host = req.headers.host || '';
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function handleAuth(
  req: IncomingMessage,
  res: ServerResponse,
  port: number
): 'authenticated' | 'redirected' | 'forbidden' {
  if (!validateHost(req, port)) {
    return 'forbidden';
  }

  const cookies = parseCookies(req);
  const cookieName = getCookieName(port);
  if (cookies[cookieName] === sessionCookieValue && sessionCookieValue) {
    return 'authenticated';
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const urlToken = url.searchParams.get('token');

  if (urlToken && urlToken === sessionToken && !tokenUsed) {
    tokenUsed = true;
    res.writeHead(302, {
      'Set-Cookie': `${cookieName}=${sessionCookieValue}; HttpOnly; SameSite=Strict; Path=/`,
      'Location': '/',
    });
    res.end();
    return 'redirected';
  }

  return 'forbidden';
}
