import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IncomingMessage } from 'http';
import { Router, sendJson, sendError, readBody } from './router';
import {
  generateToken, writeServerInfo, cleanupServerInfo,
  readExistingServerInfo, isProcessAlive, handleAuth
} from './auth';
import { scanAllPlugins, getPluginById, searchPlugins, invalidatePluginCache } from './plugin-scanner';
import { togglePlugin, getSettings, updateSettings } from './plugin-config';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const UI_DIR = path.join(__dirname, 'ui');
const PLUGIN_ID_REGEX = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+$/;

let idleTimer: NodeJS.Timeout;

function resetIdleTimer(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.error('Idle timeout reached. Shutting down.');
    cleanupServerInfo();
    process.exit(0);
  }, IDLE_TIMEOUT_MS);
}

function serveStatic(res: http.ServerResponse, filePath: string, contentType: string): void {
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function sendForbiddenPage(res: http.ServerResponse): void {
  res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end([
    '<!DOCTYPE html><html><head><title>Session Expired</title>',
    '<style>',
    'body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#F5EEE6;color:#191919;}',
    '.box{text-align:center;max-width:400px;}',
    '.code{font-family:monospace;background:#E6DDD1;padding:4px 8px;border-radius:4px;}',
    '</style></head>',
    '<body><div class="box">',
    '<h2>Session Expired</h2>',
    '<p>Reopen from Claude Code using <span class="code">/plugin-manager:open</span></p>',
    '</div></body></html>',
  ].join(''));
}

function requireJson(req: IncomingMessage): boolean {
  const ct = req.headers['content-type'] || '';
  return ct.includes('application/json');
}

function registerApiRoutes(router: Router): void {
  router.get('/api/health', (_req, res) => {
    sendJson(res, { status: 'ok', uptime: process.uptime() });
  });

  router.get('/api/plugins', (_req, res, _params, query) => {
    const all = scanAllPlugins();
    const filtered = searchPlugins(all, query.q || '', query.filter, query.source);
    const summary = filtered.map(p => ({
      id: p.id,
      name: p.name,
      source: p.source,
      isOfficial: p.isOfficial,
      enabled: p.enabled,
      description: p.description,
      author: p.author,
      version: p.installations[0]?.version,
      skillCount: p.skills.length,
      agentCount: p.agents.length,
      commandCount: p.commands.length,
      hookCount: p.hooks.length,
      mcpServerCount: p.mcpServers.length,
      modeCount: p.modes.length,
      error: p.error,
    }));
    sendJson(res, { plugins: summary, total: all.length, filtered: summary.length });
  });

  router.get('/api/plugins/:id', (_req, res, params) => {
    const id = params.id;
    if (!PLUGIN_ID_REGEX.test(id)) {
      return sendError(res, 400, 'Invalid plugin ID format', 'INVALID_ID');
    }
    const plugin = getPluginById(id);
    if (!plugin) {
      return sendError(res, 404, 'Plugin not found', 'PLUGIN_NOT_FOUND');
    }
    sendJson(res, plugin);
  });

  router.post('/api/plugins/:id/toggle', async (req, res, params) => {
    const id = params.id;
    if (!PLUGIN_ID_REGEX.test(id)) {
      return sendError(res, 400, 'Invalid plugin ID format', 'INVALID_ID');
    }
    if (!requireJson(req)) {
      return sendError(res, 415, 'Content-Type must be application/json', 'UNSUPPORTED_MEDIA_TYPE');
    }
    let body: unknown;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendError(res, 400, 'Invalid JSON body', 'INVALID_JSON');
    }
    if (typeof body !== 'object' || body === null || typeof (body as Record<string, unknown>)['enabled'] !== 'boolean') {
      return sendError(res, 400, 'Body must include { enabled: boolean }', 'INVALID_BODY');
    }
    const enabled = (body as Record<string, unknown>)['enabled'] as boolean;
    try {
      await togglePlugin(id, enabled);
      sendJson(res, { success: true, pluginId: id, enabled });
    } catch {
      return sendError(res, 500, 'Failed to toggle plugin', 'INTERNAL_ERROR');
    }
  });

  router.get('/api/settings', async (_req, res) => {
    const settings = await getSettings();
    sendJson(res, settings);
  });

  router.patch('/api/settings', async (req, res) => {
    if (!requireJson(req)) {
      return sendError(res, 415, 'Content-Type must be application/json', 'UNSUPPORTED_MEDIA_TYPE');
    }
    let body: unknown;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendError(res, 400, 'Invalid JSON body', 'INVALID_JSON');
    }
    if (
      typeof body !== 'object' || body === null ||
      typeof (body as Record<string, unknown>)['path'] !== 'string'
    ) {
      return sendError(res, 400, 'Body must include { path: string, value: unknown }', 'INVALID_BODY');
    }
    const { path: settingsPath, value } = body as Record<string, unknown>;
    try {
      await updateSettings(settingsPath as string, value);
      sendJson(res, { success: true });
    } catch (err) {
      if (err instanceof TypeError) {
        return sendError(res, 400, (err as TypeError).message, 'VALIDATION_ERROR');
      }
      return sendError(res, 500, 'Failed to update settings', 'INTERNAL_ERROR');
    }
  });

  router.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    res.write('data: {"type":"connected"}\n\n');

    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const localSettingsPath = path.join(os.homedir(), '.claude', 'settings.local.json');

    const watchers: fs.FSWatcher[] = [];

    function onFileChange(file: string) {
      invalidatePluginCache();
      res.write(`data: {"type":"settings-changed","file":"${file}"}\n\n`);
    }

    try {
      watchers.push(fs.watch(settingsPath, () => onFileChange('settings.json')));
    } catch {}
    try {
      watchers.push(fs.watch(localSettingsPath, () => onFileChange('settings.local.json')));
    } catch {}

    req.on('close', () => {
      watchers.forEach(w => w.close());
    });
  });
}

function registerStaticRoutes(router: Router): void {
  router.get('/', (_req, res) => {
    serveStatic(res, path.join(UI_DIR, 'index.html'), 'text/html; charset=utf-8');
  });
  router.get('/styles.css', (_req, res) => {
    serveStatic(res, path.join(UI_DIR, 'styles.css'), 'text/css; charset=utf-8');
  });
  router.get('/app.js', (_req, res) => {
    serveStatic(res, path.join(UI_DIR, 'app.js'), 'application/javascript; charset=utf-8');
  });
}

function main(): void {
  const existing = readExistingServerInfo();
  if (existing && isProcessAlive(existing.pid)) {
    console.log(JSON.stringify({
      url: `http://localhost:${existing.port}`,
      port: existing.port,
      alreadyRunning: true,
    }));
    process.exit(0);
  }

  const token = generateToken();
  const router = new Router();
  registerApiRoutes(router);
  registerStaticRoutes(router);

  const server = http.createServer(async (req, res) => {
    resetIdleTimer();

    const authResult = handleAuth(req, res, (server.address() as any)?.port || 0);
    if (authResult === 'redirected') return;
    if (authResult === 'forbidden') {
      const accept = req.headers.accept || '';
      if (accept.includes('text/html')) {
        sendForbiddenPage(res);
      } else {
        sendError(res, 403, 'Forbidden', 'AUTH_REQUIRED');
      }
      return;
    }

    const handled = await router.handle(req, res);
    if (!handled) {
      sendError(res, 404, 'Not found', 'NOT_FOUND');
    }
  });

  server.listen(0, '127.0.0.1', () => {
    const addr = server.address() as { port: number };
    writeServerInfo(addr.port);
    resetIdleTimer();

    console.log(JSON.stringify({
      url: `http://localhost:${addr.port}?token=${token}`,
      port: addr.port,
    }));
  });

  process.on('SIGINT', () => { cleanupServerInfo(); process.exit(0); });
  process.on('SIGTERM', () => { cleanupServerInfo(); process.exit(0); });
  process.on('exit', () => { cleanupServerInfo(); });
}

main();
