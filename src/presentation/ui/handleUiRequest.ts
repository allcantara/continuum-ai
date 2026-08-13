import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Container } from '../../container.js';
import { sendJson, sendText } from './httpJson.js';
import { handleUiApi } from './uiApi.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), 'public');
const STATIC_FILES: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.css': { file: 'app.css', type: 'text/css; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
};

export async function handleUiRequest(
  container: Container,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    var pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    var method = req.method ?? 'GET';

    if (!pathname.startsWith('/api/')) {
      serveStatic(method, pathname, res);
      return;
    }

    await handleUiApi(container, method, pathname, req, res);
  } catch (error) {
    var message = (error as Error).message;
    if (message === 'Invalid JSON body' || message === 'Request body too large') {
      sendJson(res, 400, { error: message });
      return;
    }
    sendJson(res, 500, { error: message });
  }
}

function serveStatic(method: string, pathname: string, res: ServerResponse): void {
  if (method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  var asset = STATIC_FILES[pathname];
  if (!asset) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  sendText(res, 200, readFileSync(join(PUBLIC_DIR, asset.file), 'utf8'), asset.type);
}
