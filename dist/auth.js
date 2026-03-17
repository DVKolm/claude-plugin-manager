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
exports.generateToken = generateToken;
exports.getTokenHash = getTokenHash;
exports.writeServerInfo = writeServerInfo;
exports.cleanupServerInfo = cleanupServerInfo;
exports.readExistingServerInfo = readExistingServerInfo;
exports.isProcessAlive = isProcessAlive;
exports.getCookieName = getCookieName;
exports.validateHost = validateHost;
exports.handleAuth = handleAuth;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const SERVER_INFO_PATH = path.join(os.homedir(), '.claude', 'plugins', 'plugin-manager.json');
let sessionToken = '';
let sessionCookieValue = '';
let tokenUsed = false;
function generateToken() {
    sessionToken = crypto.randomBytes(32).toString('hex');
    sessionCookieValue = crypto.randomBytes(32).toString('hex');
    tokenUsed = false;
    return sessionToken;
}
function getTokenHash() {
    return crypto.createHash('sha256').update(sessionToken).digest('hex');
}
function writeServerInfo(port) {
    const info = {
        port,
        pid: process.pid,
        tokenHash: getTokenHash(),
        startedAt: new Date().toISOString(),
    };
    const dir = path.dirname(SERVER_INFO_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SERVER_INFO_PATH, JSON.stringify(info, null, 2), { mode: 0o600 });
}
function cleanupServerInfo() {
    try {
        fs.unlinkSync(SERVER_INFO_PATH);
    }
    catch { /* ignore */ }
}
function readExistingServerInfo() {
    try {
        const raw = fs.readFileSync(SERVER_INFO_PATH, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function getCookieName(port) {
    return `pm-${port}`;
}
function parseCookies(req) {
    const header = req.headers.cookie || '';
    const cookies = {};
    header.split(';').forEach(pair => {
        const [k, ...v] = pair.split('=');
        if (k)
            cookies[k.trim()] = v.join('=').trim();
    });
    return cookies;
}
function validateHost(req, port) {
    const host = req.headers.host || '';
    return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}
function handleAuth(req, res, port) {
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
