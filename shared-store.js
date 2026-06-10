(function () {
  const LOCAL_CHAT_KEY = 'communityChat';
  const LOCAL_CHAT_CLEANUP_KEY = 'communityChatLastCleanup';
  const LOCAL_VPS_KEY = 'vpsList';
  const DEFAULT_API_BASE =
    window.SOCKETDEVZ_API_BASE ||
    (window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');

  let remoteStatus = null;

  function readLocalJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (error) {
      return fallback;
    }
  }

  function writeLocalJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function nowColombia() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${DEFAULT_API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = payload && payload.error ? payload.error : 'Error de conexión';
      throw new Error(message);
    }

    return payload;
  }

  async function detectRemote() {
    if (remoteStatus !== null) {
      return remoteStatus;
    }

    try {
      await requestJson('/health', { method: 'GET' });
      remoteStatus = true;
    } catch (error) {
      remoteStatus = false;
    }

    return remoteStatus;
  }

  async function getMode() {
    return (await detectRemote()) ? 'shared' : 'local';
  }

  async function cleanupLocalChatIfNeeded() {
    const today = nowColombia();
    const lastCleanup = localStorage.getItem(LOCAL_CHAT_CLEANUP_KEY);

    if (lastCleanup !== today) {
      localStorage.removeItem(LOCAL_CHAT_KEY);
      localStorage.setItem(LOCAL_CHAT_CLEANUP_KEY, today);
    }
  }

  async function getChatMessages() {
    if (await detectRemote()) {
      const payload = await requestJson('/chat', { method: 'GET' });
      return Array.isArray(payload.items) ? payload.items : [];
    }

    await cleanupLocalChatIfNeeded();
    return readLocalJson(LOCAL_CHAT_KEY, []);
  }

  async function addChatMessage(message) {
    const cleanMessage = {
      name: String(message.name || 'Anon').trim().slice(0, 30),
      text: String(message.text || '').trim().slice(0, 500)
    };

    if (!cleanMessage.text) {
      throw new Error('El mensaje está vacío');
    }

    if (await detectRemote()) {
      const payload = await requestJson('/chat', {
        method: 'POST',
        body: JSON.stringify(cleanMessage)
      });

      return payload.item;
    }

    await cleanupLocalChatIfNeeded();
    const messages = readLocalJson(LOCAL_CHAT_KEY, []);
    const item = {
      id: Date.now() + Math.random(),
      name: cleanMessage.name,
      text: cleanMessage.text,
      ts: Date.now()
    };

    messages.push(item);
    writeLocalJson(LOCAL_CHAT_KEY, messages);
    return item;
  }

  async function getVpsEntries() {
    if (await detectRemote()) {
      const payload = await requestJson('/vps', { method: 'GET' });
      return Array.isArray(payload.items) ? payload.items : [];
    }

    return readLocalJson(LOCAL_VPS_KEY, []);
  }

  async function addVpsEntry(entry) {
    const cleanEntry = {
      pais: String(entry.pais || '').trim(),
      ip: String(entry.ip || '').trim(),
      puerto: String(entry.puerto || '').trim(),
      usuario: String(entry.usuario || '').trim(),
      descripcion: String(entry.descripcion || '').trim()
    };

    if (await detectRemote()) {
      const payload = await requestJson('/vps', {
        method: 'POST',
        body: JSON.stringify(cleanEntry)
      });

      return payload.item;
    }

    const list = readLocalJson(LOCAL_VPS_KEY, []);
    const item = {
      id: Date.now(),
      pais: cleanEntry.pais,
      ip: cleanEntry.ip,
      puerto: cleanEntry.puerto,
      usuario: cleanEntry.usuario,
      descripcion: cleanEntry.descripcion,
      creado: Date.now(),
      expira: Date.now() + 4 * 24 * 60 * 60 * 1000,
      ping: Math.floor(Math.random() * 230) + 20
    };

    list.push(item);
    writeLocalJson(LOCAL_VPS_KEY, list);
    return item;
  }

  async function deleteVpsEntry(id, adminToken) {
    if (await detectRemote()) {
      return requestJson(`/vps/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: adminToken ? { 'x-admin-token': adminToken } : {}
      });
    }

    const list = readLocalJson(LOCAL_VPS_KEY, []);
    const nextList = list.filter((item) => String(item.id) !== String(id));
    writeLocalJson(LOCAL_VPS_KEY, nextList);
    return { ok: true };
  }

  async function getStatus() {
    return {
      mode: await getMode(),
      apiBase: DEFAULT_API_BASE
    };
  }

  window.SharedCommunityStore = {
    getMode,
    getStatus,
    getChatMessages,
    addChatMessage,
    getVpsEntries,
    addVpsEntry,
    deleteVpsEntry
  };
})();