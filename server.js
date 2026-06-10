const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

function defaultStore() {
  return {
    chat: {
      messages: [],
      lastCleanupDate: ''
    },
    vps: []
  };
}

function getBogotaDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function normalizeStore(store) {
  const nextStore = store && typeof store === 'object' ? store : defaultStore();
  nextStore.chat = nextStore.chat && typeof nextStore.chat === 'object' ? nextStore.chat : { messages: [], lastCleanupDate: '' };
  nextStore.chat.messages = Array.isArray(nextStore.chat.messages) ? nextStore.chat.messages : [];
  nextStore.chat.lastCleanupDate = typeof nextStore.chat.lastCleanupDate === 'string' ? nextStore.chat.lastCleanupDate : '';
  nextStore.vps = Array.isArray(nextStore.vps) ? nextStore.vps : [];
  return nextStore;
}

async function ensureStoreFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });

  try {
    await fsp.access(STORE_FILE);
  } catch (error) {
    await fsp.writeFile(STORE_FILE, JSON.stringify(defaultStore(), null, 2), 'utf8');
  }
}

async function loadStore() {
  try {
    const raw = await fsp.readFile(STORE_FILE, 'utf8');
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    return defaultStore();
  }
}

async function saveStore(store) {
  await fsp.writeFile(STORE_FILE, JSON.stringify(normalizeStore(store), null, 2), 'utf8');
}

function cleanupStore(store) {
  const today = getBogotaDateString();
  let changed = false;

  if (store.chat.lastCleanupDate !== today) {
    store.chat.messages = [];
    store.chat.lastCleanupDate = today;
    changed = true;
  }

  const now = Date.now();
  const filteredVps = store.vps.filter((entry) => Number(entry.expira || 0) > now);

  if (filteredVps.length !== store.vps.length) {
    store.vps = filteredVps;
    changed = true;
  }

  return changed;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
  });
  res.end(text);
}

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function safeFilePath(requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const relative = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.normalize(path.join(ROOT, relative));

  if (!resolved.startsWith(ROOT)) {
    return null;
  }

  return resolved;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 1_000_000) {
        reject(new Error('Payload demasiado grande'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(new Error('JSON inválido'));
      }
    });

    req.on('error', reject);
  });
}

function createChatItem(body) {
  const name = String(body.name || 'Anon').trim().slice(0, 30);
  const text = String(body.text || '').trim().slice(0, 500);

  if (!text) {
    return null;
  }

  return {
    id: Date.now() + Math.random(),
    name,
    text,
    ts: Date.now()
  };
}

function createVpsItem(body) {
  const pais = String(body.pais || '').trim();
  const ip = String(body.ip || '').trim();
  const puerto = String(body.puerto || '').trim();
  const usuario = String(body.usuario || '').trim();
  const descripcion = String(body.descripcion || '').trim();

  if (!pais || !ip) {
    return null;
  }

  return {
    id: Date.now(),
    pais,
    ip,
    puerto,
    usuario,
    descripcion,
    creado: Date.now(),
    expira: Date.now() + 4 * 24 * 60 * 60 * 1000,
    ping: Math.floor(Math.random() * 230) + 20
  };
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendText(res, 204, '');
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, mode: 'shared', adminProtected: Boolean(ADMIN_TOKEN) });
    return;
  }

  if (url.pathname === '/api/chat' && req.method === 'GET') {
    const store = await loadStore();
    const changed = cleanupStore(store);

    if (changed) {
      await saveStore(store);
    }

    sendJson(res, 200, { items: store.chat.messages });
    return;
  }

  if (url.pathname === '/api/chat' && req.method === 'POST') {
    const store = await loadStore();
    const body = await readBody(req);
    const item = createChatItem(body);

    if (!item) {
      sendJson(res, 400, { error: 'Mensaje inválido' });
      return;
    }

    cleanupStore(store);
    store.chat.messages.push(item);
    await saveStore(store);
    sendJson(res, 201, { item });
    return;
  }

  if (url.pathname.startsWith('/api/chat/') && req.method === 'DELETE') {
    const id = decodeURIComponent(url.pathname.slice('/api/chat/'.length));
    const store = await loadStore();
    const before = store.chat.messages.length;
    store.chat.messages = store.chat.messages.filter((item) => String(item.id) !== id);

    if (store.chat.messages.length === before) {
      sendJson(res, 404, { error: 'Mensaje no encontrado' });
      return;
    }

    await saveStore(store);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/vps' && req.method === 'GET') {
    const store = await loadStore();
    const changed = cleanupStore(store);

    if (changed) {
      await saveStore(store);
    }

    sendJson(res, 200, { items: store.vps });
    return;
  }

  if (url.pathname === '/api/vps' && req.method === 'POST') {
    const store = await loadStore();
    const body = await readBody(req);
    const item = createVpsItem(body);

    if (!item) {
      sendJson(res, 400, { error: 'Datos VPS inválidos' });
      return;
    }

    cleanupStore(store);
    store.vps.push(item);
    await saveStore(store);
    sendJson(res, 201, { item });
    return;
  }

  if (url.pathname.startsWith('/api/vps/') && req.method === 'DELETE') {
    if (ADMIN_TOKEN) {
      const providedToken = String(req.headers['x-admin-token'] || '').trim();
      if (providedToken !== ADMIN_TOKEN) {
        sendJson(res, 403, { error: 'Token de administrador incorrecto' });
        return;
      }
    }

    const id = decodeURIComponent(url.pathname.slice('/api/vps/'.length));
    const store = await loadStore();
    const before = store.vps.length;
    store.vps = store.vps.filter((item) => String(item.id) !== id);

    if (store.vps.length === before) {
      sendJson(res, 404, { error: 'VPS no encontrado' });
      return;
    }

    await saveStore(store);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: 'Ruta API no encontrada' });
}

async function handleStatic(req, res, url) {
  const filePath = safeFilePath(url.pathname);

  if (!filePath) {
    sendJson(res, 400, { error: 'Ruta inválida' });
    return;
  }

  let finalPath = filePath;

  try {
    const stat = await fsp.stat(finalPath);
    if (stat.isDirectory()) {
      finalPath = path.join(finalPath, 'index.html');
    }
  } catch (error) {
    if (path.extname(finalPath) === '') {
      finalPath = path.join(ROOT, 'index.html');
    }
  }

  try {
    const content = await fsp.readFile(finalPath);
    sendText(res, 200, content, getContentType(finalPath));
  } catch (error) {
    sendText(res, 404, '404 - Archivo no encontrado');
  }
}

async function main() {
  await ensureStoreFile();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
        return;
      }

      await handleStatic(req, res, url);
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Error interno' });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`SocketDevz VPN shared server running at http://${HOST}:${PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});