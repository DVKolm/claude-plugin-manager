"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Router = void 0;
exports.sendJson = sendJson;
exports.sendError = sendError;
exports.readBody = readBody;
const url_1 = require("url");
class Router {
    constructor() {
        this.routes = [];
    }
    compilePattern(path) {
        const paramNames = [];
        const regexStr = path.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
            paramNames.push(name);
            return '([^/]+)';
        });
        return { pattern: new RegExp(`^${regexStr}$`), paramNames };
    }
    get(path, handler) {
        const { pattern, paramNames } = this.compilePattern(path);
        this.routes.push({ method: 'GET', pattern, paramNames, handler });
    }
    post(path, handler) {
        const { pattern, paramNames } = this.compilePattern(path);
        this.routes.push({ method: 'POST', pattern, paramNames, handler });
    }
    patch(path, handler) {
        const { pattern, paramNames } = this.compilePattern(path);
        this.routes.push({ method: 'PATCH', pattern, paramNames, handler });
    }
    async handle(req, res) {
        const method = req.method || 'GET';
        const urlObj = new url_1.URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = urlObj.pathname;
        const query = {};
        urlObj.searchParams.forEach((v, k) => { query[k] = v; });
        for (const route of this.routes) {
            if (route.method !== method)
                continue;
            const match = pathname.match(route.pattern);
            if (!match)
                continue;
            const params = {};
            for (let i = 0; i < route.paramNames.length; i++) {
                params[route.paramNames[i]] = decodeURIComponent(match[i + 1]);
            }
            await route.handler(req, res, params, query);
            return true;
        }
        return false;
    }
}
exports.Router = Router;
function sendJson(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}
function sendError(res, status, error, code) {
    sendJson(res, { error, code }, status);
}
async function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
    });
}
