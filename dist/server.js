"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const router_1 = require("./router");
const auth_1 = require("./auth");
const plugin_scanner_1 = require("./plugin-scanner");
const marketplace_1 = require("./marketplace");
const plugin_config_1 = require("./plugin-config");
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const UI_DIR = path.join(__dirname, 'ui');
const PLUGIN_ID_REGEX = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+$/;
let idleTimer;
function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        console.error('Idle timeout reached. Shutting down.');
        (0, auth_1.cleanupServerInfo)();
        process.exit(0);
    }, IDLE_TIMEOUT_MS);
}
function serveStatic(res, filePath, contentType) {
    try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    }
    catch {
        res.writeHead(404);
        res.end('Not found');
    }
}
function sendForbiddenPage(res) {
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
function requireJson(req) {
    const ct = req.headers['content-type'] || '';
    return ct.includes('application/json');
}
function registerApiRoutes(router) {
    router.get('/api/health', (_req, res) => {
        (0, router_1.sendJson)(res, { status: 'ok', uptime: process.uptime() });
    });
    router.get('/api/plugins', (_req, res, _params, query) => {
        const all = (0, plugin_scanner_1.scanAllPlugins)();
        const filtered = (0, plugin_scanner_1.searchPlugins)(all, query.q || '', query.filter, query.source);
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
        (0, router_1.sendJson)(res, { plugins: summary, total: all.length, filtered: summary.length });
    });
    router.get('/api/plugins/:id', (_req, res, params) => {
        const id = params.id;
        if (!PLUGIN_ID_REGEX.test(id)) {
            return (0, router_1.sendError)(res, 400, 'Invalid plugin ID format', 'INVALID_ID');
        }
        const plugin = (0, plugin_scanner_1.getPluginById)(id);
        if (!plugin) {
            return (0, router_1.sendError)(res, 404, 'Plugin not found', 'PLUGIN_NOT_FOUND');
        }
        (0, router_1.sendJson)(res, plugin);
    });
    router.post('/api/plugins/:id/toggle', async (req, res, params) => {
        const id = params.id;
        if (!PLUGIN_ID_REGEX.test(id)) {
            return (0, router_1.sendError)(res, 400, 'Invalid plugin ID format', 'INVALID_ID');
        }
        if (!requireJson(req)) {
            return (0, router_1.sendError)(res, 415, 'Content-Type must be application/json', 'UNSUPPORTED_MEDIA_TYPE');
        }
        let body;
        try {
            body = JSON.parse(await (0, router_1.readBody)(req));
        }
        catch {
            return (0, router_1.sendError)(res, 400, 'Invalid JSON body', 'INVALID_JSON');
        }
        if (typeof body !== 'object' || body === null || typeof body['enabled'] !== 'boolean') {
            return (0, router_1.sendError)(res, 400, 'Body must include { enabled: boolean }', 'INVALID_BODY');
        }
        const enabled = body['enabled'];
        try {
            await (0, plugin_config_1.togglePlugin)(id, enabled);
            (0, router_1.sendJson)(res, { success: true, pluginId: id, enabled });
        }
        catch {
            return (0, router_1.sendError)(res, 500, 'Failed to toggle plugin', 'INTERNAL_ERROR');
        }
    });
    router.get('/api/settings', async (_req, res) => {
        const settings = await (0, plugin_config_1.getSettings)();
        (0, router_1.sendJson)(res, settings);
    });
    router.patch('/api/settings', async (req, res) => {
        if (!requireJson(req)) {
            return (0, router_1.sendError)(res, 415, 'Content-Type must be application/json', 'UNSUPPORTED_MEDIA_TYPE');
        }
        let body;
        try {
            body = JSON.parse(await (0, router_1.readBody)(req));
        }
        catch {
            return (0, router_1.sendError)(res, 400, 'Invalid JSON body', 'INVALID_JSON');
        }
        if (typeof body !== 'object' || body === null ||
            typeof body['path'] !== 'string') {
            return (0, router_1.sendError)(res, 400, 'Body must include { path: string, value: unknown }', 'INVALID_BODY');
        }
        const { path: settingsPath, value } = body;
        try {
            await (0, plugin_config_1.updateSettings)(settingsPath, value);
            (0, router_1.sendJson)(res, { success: true });
        }
        catch (err) {
            if (err instanceof TypeError) {
                return (0, router_1.sendError)(res, 400, err.message, 'VALIDATION_ERROR');
            }
            return (0, router_1.sendError)(res, 500, 'Failed to update settings', 'INTERNAL_ERROR');
        }
    });
    router.get('/api/marketplace', (_req, res) => {
        try {
            const plugins = (0, marketplace_1.scanMarketplace)();
            (0, router_1.sendJson)(res, { plugins, total: plugins.length });
        }
        catch (err) {
            (0, router_1.sendError)(res, 500, 'Failed to scan marketplace', 'MARKETPLACE_ERROR');
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
        const watchers = [];
        function onFileChange(file) {
            (0, plugin_scanner_1.invalidatePluginCache)();
            res.write(`data: {"type":"settings-changed","file":"${file}"}\n\n`);
        }
        try {
            watchers.push(fs.watch(settingsPath, () => onFileChange('settings.json')));
        }
        catch { }
        try {
            watchers.push(fs.watch(localSettingsPath, () => onFileChange('settings.local.json')));
        }
        catch { }
        req.on('close', () => {
            watchers.forEach(w => w.close());
        });
    });
}
function registerStaticRoutes(router) {
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
function main() {
    const existing = (0, auth_1.readExistingServerInfo)();
    if (existing && (0, auth_1.isProcessAlive)(existing.pid)) {
        console.log(JSON.stringify({
            url: `http://localhost:${existing.port}`,
            port: existing.port,
            alreadyRunning: true,
        }));
        process.exit(0);
    }
    const token = (0, auth_1.generateToken)();
    const router = new router_1.Router();
    registerApiRoutes(router);
    registerStaticRoutes(router);
    const server = http.createServer(async (req, res) => {
        resetIdleTimer();
        const authResult = (0, auth_1.handleAuth)(req, res, server.address()?.port || 0);
        if (authResult === 'redirected')
            return;
        if (authResult === 'forbidden') {
            const accept = req.headers.accept || '';
            if (accept.includes('text/html')) {
                sendForbiddenPage(res);
            }
            else {
                (0, router_1.sendError)(res, 403, 'Forbidden', 'AUTH_REQUIRED');
            }
            return;
        }
        const handled = await router.handle(req, res);
        if (!handled) {
            (0, router_1.sendError)(res, 404, 'Not found', 'NOT_FOUND');
        }
    });
    server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        (0, auth_1.writeServerInfo)(addr.port);
        resetIdleTimer();
        console.log(JSON.stringify({
            url: `http://localhost:${addr.port}?token=${token}`,
            port: addr.port,
        }));
    });
    process.on('SIGINT', () => { (0, auth_1.cleanupServerInfo)(); process.exit(0); });
    process.on('SIGTERM', () => { (0, auth_1.cleanupServerInfo)(); process.exit(0); });
    process.on('exit', () => { (0, auth_1.cleanupServerInfo)(); });
}
main();
