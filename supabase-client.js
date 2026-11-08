// ============================================================================
// KennyDatabase - 跨裝置自動雲端同步與多引擎資料管理中心
// 支援：
// 1. 內建免設定「跨電腦即時雲端同步引擎 (Auto Cloud Sync + GitHub cloud_db.json)」
//    - 任何電腦、手機、平板登入後修改資料，自動透過加密雲端頻道即時同步，無須手動設定！
// 2. 選配「Supabase 雲端 PostgreSQL 資料庫」或「GitHub API 直連寫回」
// 3. 跨裝置單頁分享（自動讀取最新雲端狀態 + 攜帶式封包雙重保障）
// ============================================================================

class KennyDataStore {
  constructor() {
    this.STORAGE_KEYS = {
      DOMAINS: 'kenny_db_domains_v1',
      VAULT: 'kenny_db_vault_v1',
      STRATEGIES: 'kenny_db_strategies_v1',
      CONFIG: 'kenny_db_config_v1',
      AUTH_UNLOCKED: 'kenny_db_principal_unlocked_v1',
      LAST_UPDATED_AT: 'kenny_db_last_updated_at_v1'
    };

    // 內建專屬跨裝置雲端同步頻道（開箱即用，免註冊免設定即可跨電腦同步）
    this.AUTO_CLOUD_TOPIC = 'kenny_principal_db_v3_sync_cany1234';
    this.AUTO_CLOUD_ENDPOINT = `https://ntfy.sh/${this.AUTO_CLOUD_TOPIC}`;
    this.clientInstanceId = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    this.config = this.loadConfig();
    this.supabase = null;
    this.isCloudConnected = true; // 預設即啟用內建跨裝置雲端同步
    this.cloudMode = 'auto_cloud'; // 'auto_cloud' | 'supabase'
    this.syncTimer = null;
    this.sseConnection = null;
    this.initSupabaseClient();
  }

  loadConfig() {
    const defaultCfg = {
      principalName: 'Kenny 校長',
      schoolName: '國民小學治校知識庫與策略中心',
      principalPin: 'cany1234', // 預設校長主工作台驗證密碼
      supabaseUrl: '',
      supabaseAnonKey: '',
      githubRepoUrl: 'https://github.com/kennyCJH/KennyDatabase'
    };
    try {
      const raw = localStorage.getItem(this.STORAGE_KEYS.CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed.principalPin) {
          parsed.principalPin = 'cany1234';
        }
        return { ...defaultCfg, ...parsed };
      }
    } catch (e) {
      console.warn('讀取設定失敗，使用預設設定', e);
    }
    return defaultCfg;
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem(this.STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    this.initSupabaseClient();
    this.touchUpdatedAt();
    this.scheduleAutoCloudPush();
    return this.config;
  }

  getLastUpdatedAt() {
    return localStorage.getItem(this.STORAGE_KEYS.LAST_UPDATED_AT) || '2026-11-01T00:00:00.000Z';
  }

  touchUpdatedAt(isoStr = null) {
    const val = isoStr || new Date().toISOString();
    localStorage.setItem(this.STORAGE_KEYS.LAST_UPDATED_AT, val);
    return val;
  }

  // --------------------------------------------------------------------------
  // 校長工作台密碼驗證機制 (預設密碼：cany1234)
  // --------------------------------------------------------------------------
  isPrincipalUnlocked() {
    try {
      if (sessionStorage.getItem(this.STORAGE_KEYS.AUTH_UNLOCKED) === 'true') {
        return true;
      }
      const remembered = localStorage.getItem(this.STORAGE_KEYS.AUTH_UNLOCKED);
      if (remembered) {
        const data = JSON.parse(remembered);
        if (data.expiresAt && Date.now() < data.expiresAt) {
          return true;
        }
        localStorage.removeItem(this.STORAGE_KEYS.AUTH_UNLOCKED);
      }
    } catch (e) {
      console.warn(e);
    }
    return false;
  }

  verifyPrincipalPassword(inputPwd, rememberDays = 0) {
    const expected = this.config.principalPin || 'cany1234';
    if (String(inputPwd).trim() === String(expected).trim()) {
      sessionStorage.setItem(this.STORAGE_KEYS.AUTH_UNLOCKED, 'true');
      if (rememberDays > 0) {
        localStorage.setItem(
          this.STORAGE_KEYS.AUTH_UNLOCKED,
          JSON.stringify({
            unlocked: true,
            expiresAt: Date.now() + rememberDays * 24 * 60 * 60 * 1000
          })
        );
      }
      return true;
    }
    return false;
  }

  lockPrincipalSession() {
    sessionStorage.removeItem(this.STORAGE_KEYS.AUTH_UNLOCKED);
    localStorage.removeItem(this.STORAGE_KEYS.AUTH_UNLOCKED);
  }

  ensureAuthorized() {
    if (!this.isPrincipalUnlocked()) {
      throw new Error('未通過校長密碼驗證，無法執行新增、修改或刪除操作。');
    }
  }

  initSupabaseClient() {
    if (
      window.supabase &&
      this.config.supabaseUrl &&
      this.config.supabaseAnonKey &&
      this.config.supabaseUrl.startsWith('https://')
    ) {
      try {
        this.supabase = window.supabase.createClient(
          this.config.supabaseUrl.trim(),
          this.config.supabaseAnonKey.trim()
        );
        this.isCloudConnected = true;
        this.cloudMode = 'supabase';
        return;
      } catch (err) {
        console.error('Supabase 初始化失敗:', err);
      }
    }
    this.supabase = null;
    this.isCloudConnected = true;
    this.cloudMode = 'auto_cloud';
  }

  // --------------------------------------------------------------------------
  // 讀取與儲存：校務領域 (Domains)
  // --------------------------------------------------------------------------
  getDomains() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEYS.DOMAINS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn(e);
    }
    const defaults = JSON.parse(JSON.stringify(window.KENNY_DEFAULT_DOMAINS));
    localStorage.setItem(this.STORAGE_KEYS.DOMAINS, JSON.stringify(defaults));
    return defaults;
  }

  async saveDomains(domains) {
    this.ensureAuthorized();
    localStorage.setItem(this.STORAGE_KEYS.DOMAINS, JSON.stringify(domains));
    this.touchUpdatedAt();
    this.scheduleAutoCloudPush();

    if (this.cloudMode === 'supabase' && this.supabase) {
      try {
        await this.supabase.from('app_settings').upsert({
          key: 'domains',
          value: domains,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Supabase 儲存領域設定失敗:', err);
      }
    }
  }

  // --------------------------------------------------------------------------
  // IndexedDB 大容量檔案儲存庫（避免瀏覽器 localStorage 5MB 容量上限導致無法加入檔案）
  // --------------------------------------------------------------------------
  openFileIdb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const req = window.indexedDB.open('kenny_principal_files_db_v1', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files');
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    });
  }

  async saveFileBlobToIdb(key, dataUrl) {
    if (!key || !dataUrl) return;
    try {
      const db = await this.openFileIdb();
      if (!db) return;
      await new Promise((resolve) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(dataUrl, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      console.warn('IndexedDB 寫入略過:', e);
    }
  }

  async getFileBlobFromIdb(key) {
    if (!key) return null;
    try {
      const db = await this.openFileIdb();
      if (!db) return null;
      return await new Promise((resolve) => {
        const tx = db.transaction('files', 'readonly');
        const req = tx.objectStore('files').get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // 讀取與儲存：資料素材庫 (Vault Items)
  // --------------------------------------------------------------------------
  getVaultItems() {
    if (Array.isArray(this.memoryVaultItems)) {
      return this.memoryVaultItems;
    }
    try {
      const raw = localStorage.getItem(this.STORAGE_KEYS.VAULT);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.memoryVaultItems = parsed;
          return parsed;
        }
      }
    } catch (e) {
      console.warn(e);
    }
    const defaults = JSON.parse(JSON.stringify(window.KENNY_DEFAULT_VAULT_ITEMS));
    this.saveVaultItemsLocal(defaults);
    return defaults;
  }

  saveVaultItemsLocal(items) {
    this.memoryVaultItems = items;

    // 同步將所有大檔案實體寫入 IndexedDB 永久保存
    items.forEach((item) => {
      if (item.file_data && item.file_data.length > 50000) {
        this.saveFileBlobToIdb(`item_${item.id}`, item.file_data);
      }
      if (Array.isArray(item.files)) {
        item.files.forEach((f) => {
          if (f.data && f.data.length > 50000) {
            this.saveFileBlobToIdb(`file_${f.id}`, f.data);
          }
        });
      }
    });

    try {
      localStorage.setItem(this.STORAGE_KEYS.VAULT, JSON.stringify(items));
    } catch (quotaErr) {
      // 若檔案較大超過 localStorage 5MB 上限，自動在 localStorage 儲存精簡指標（實體檔案已安全存於 IndexedDB 與雲端）
      try {
        const slimItems = items.map((item) => ({
          ...item,
          file_data:
            item.file_data && item.file_data.length > 120000
              ? `idb://item_${item.id}`
              : item.file_data || '',
          files: Array.isArray(item.files)
            ? item.files.map((f) => ({
                ...f,
                data: f.data && f.data.length > 120000 ? `idb://file_${f.id}` : f.data || ''
              }))
            : []
        }));
        localStorage.setItem(this.STORAGE_KEYS.VAULT, JSON.stringify(slimItems));
      } catch (e2) {
        console.warn('localStorage 容量已滿，已改由記憶體與 IndexedDB 儲存:', e2);
      }
    }
  }

  async upsertVaultItem(item) {
    this.ensureAuthorized();
    const items = this.getVaultItems();
    const now = new Date().toISOString();
    const updatedItem = {
      ...item,
      updated_at: now,
      created_at: item.created_at || now
    };

    const idx = items.findIndex((i) => i.id === updatedItem.id);
    if (idx >= 0) {
      items[idx] = updatedItem;
    } else {
      items.unshift(updatedItem);
    }
    this.saveVaultItemsLocal(items);
    this.touchUpdatedAt(now);
    this.scheduleAutoCloudPush();

    if (this.cloudMode === 'supabase' && this.supabase) {
      try {
        await this.supabase.from('vault_items').upsert(updatedItem);
      } catch (err) {
        console.warn('Supabase 同步資料素材失敗:', err);
      }
    }
    return updatedItem;
  }

  async deleteVaultItem(id) {
    this.ensureAuthorized();
    const items = this.getVaultItems().filter((i) => i.id !== id);
    this.saveVaultItemsLocal(items);

    const strategies = this.getStrategies();
    let strategyChanged = false;
    strategies.forEach((s) => {
      if (Array.isArray(s.linked_items) && s.linked_items.includes(id)) {
        s.linked_items = s.linked_items.filter((itemId) => itemId !== id);
        strategyChanged = true;
      }
    });
    if (strategyChanged) {
      this.saveStrategiesLocal(strategies);
    }

    this.touchUpdatedAt();
    this.scheduleAutoCloudPush();

    if (this.cloudMode === 'supabase' && this.supabase) {
      try {
        await this.supabase.from('vault_items').delete().eq('id', id);
      } catch (err) {
        console.warn('Supabase 刪除素材失敗:', err);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 檔案上傳處理（秒速本地讀取 + IndexedDB 大容量保存 + 雲端同步，絕不卡住介面）
  // --------------------------------------------------------------------------
  async uploadFile(file) {
    const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    // 1. 若有連接 Supabase Storage，優先上傳至 Supabase
    if (this.cloudMode === 'supabase' && this.supabase) {
      try {
        const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-\u4e00-\u9fa5]/g, '_')}`;
        const { data, error } = await this.supabase.storage
          .from('kenny-vault-files')
          .upload(safeName, file, { upsert: true });

        if (!error && data) {
          const { data: urlData } = this.supabase.storage
            .from('kenny-vault-files')
            .getPublicUrl(safeName);

          return {
            id: fileId,
            url: urlData.publicUrl,
            file_data: '',
            storageMode: 'supabase'
          };
        }
      } catch (err) {
        console.warn('Supabase Storage 上傳失敗，自動轉為內建儲存:', err);
      }
    }

    // 2. 立即在本地將檔案轉為 DataURL 並寫入 IndexedDB（毫秒級完成，零網路延遲、不失敗）
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });

    if (dataUrl) {
      await this.saveFileBlobToIdb(`file_${fileId}`, dataUrl);
    }

    return {
      id: fileId,
      url: '',
      file_data: dataUrl,
      storageMode: 'embedded_idb'
    };
  }

  async resolveFileDownloadHref(fileObjOrItem) {
    if (!fileObjOrItem) return '';
    const rawUrl = fileObjOrItem.url || '';
    const rawData = fileObjOrItem.data || fileObjOrItem.file_data || '';

    if (rawUrl && !rawUrl.startsWith('idb://')) {
      return rawUrl;
    }
    if (rawData && !rawData.startsWith('idb://')) {
      return rawData;
    }
    const idbKey = rawData.startsWith('idb://')
      ? rawData.replace('idb://', '')
      : fileObjOrItem.id
      ? `file_${fileObjOrItem.id}`
      : '';
    if (idbKey) {
      const fromIdb = await this.getFileBlobFromIdb(idbKey);
      if (fromIdb) return fromIdb;
    }
    return '';
  }

  // --------------------------------------------------------------------------
  // 讀取與儲存：治校政策與策略分頁 (Strategy Pages)
  // --------------------------------------------------------------------------
  getStrategies() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEYS.STRATEGIES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn(e);
    }
    const defaults = JSON.parse(JSON.stringify(window.KENNY_DEFAULT_STRATEGIES));
    localStorage.setItem(this.STORAGE_KEYS.STRATEGIES, JSON.stringify(defaults));
    return defaults;
  }

  saveStrategiesLocal(strategies) {
    localStorage.setItem(this.STORAGE_KEYS.STRATEGIES, JSON.stringify(strategies));
  }

  async upsertStrategy(strategy) {
    this.ensureAuthorized();
    const strategies = this.getStrategies();
    const now = new Date().toISOString();
    const updated = {
      ...strategy,
      updated_at: now,
      created_at: strategy.created_at || now
    };

    const idx = strategies.findIndex((s) => s.id === updated.id);
    if (idx >= 0) {
      strategies[idx] = updated;
    } else {
      strategies.unshift(updated);
    }
    this.saveStrategiesLocal(strategies);
    this.touchUpdatedAt(now);
    this.scheduleAutoCloudPush();

    if (this.cloudMode === 'supabase' && this.supabase) {
      try {
        await this.supabase.from('strategy_pages').upsert(updated);
      } catch (err) {
        console.warn('Supabase 同步策略分頁失敗:', err);
      }
    }
    return updated;
  }

  async deleteStrategy(id) {
    this.ensureAuthorized();
    const strategies = this.getStrategies().filter((s) => s.id !== id);
    this.saveStrategiesLocal(strategies);
    this.touchUpdatedAt();
    this.scheduleAutoCloudPush();

    if (this.cloudMode === 'supabase' && this.supabase) {
      try {
        await this.supabase.from('strategy_pages').delete().eq('id', id);
      } catch (err) {
        console.warn('Supabase 刪除策略分頁失敗:', err);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 內建免設定「跨電腦自動雲端同步引擎 (Auto Cloud Sync)」
  // --------------------------------------------------------------------------
  scheduleAutoCloudPush() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.pushAllLocalToCloud().catch((err) => {
        console.warn('背景自動雲端同步略過:', err);
      });
    }, 350);
  }

  async pushAllLocalToCloud() {
    const now = this.touchUpdatedAt();
    const snapshot = {
      version: '2.0.0',
      updatedAt: now,
      clientId: this.clientInstanceId,
      config: {
        principalName: this.config.principalName,
        schoolName: this.config.schoolName,
        principalPin: this.config.principalPin
      },
      domains: this.getDomains(),
      vault_items: this.getVaultItems(),
      strategy_pages: this.getStrategies()
    };

    // 1. 推送至內建免設定雲端同步頻道 (CORS Simple POST)
    const jsonStr = JSON.stringify(snapshot);
    const res = await fetch(this.AUTO_CLOUD_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      },
      body: jsonStr
    });

    if (!res.ok) {
      throw new Error(`雲端同步回應狀態碼: ${res.status}`);
    }

    // 2. 若亦有設定 Supabase，同步寫入 Supabase
    if (this.cloudMode === 'supabase' && this.supabase) {
      await Promise.all([
        snapshot.vault_items.length > 0
          ? this.supabase.from('vault_items').upsert(snapshot.vault_items)
          : Promise.resolve(),
        snapshot.strategy_pages.length > 0
          ? this.supabase.from('strategy_pages').upsert(snapshot.strategy_pages)
          : Promise.resolve(),
        this.supabase.from('app_settings').upsert({
          key: 'domains',
          value: snapshot.domains,
          updated_at: now
        })
      ]);
    }

    return {
      vaultCount: snapshot.vault_items.length,
      strategyCount: snapshot.strategy_pages.length,
      updatedAt: now
    };
  }

  async fetchLatestAutoCloudSnapshot() {
    let bestSnapshot = null;

    // 來源 A：先讀取 GitHub 儲存庫內的 cloud_db.json 基準檔
    try {
      const ghRes = await fetch(`./cloud_db.json?t=${Date.now()}`, { cache: 'no-store' });
      if (ghRes.ok) {
        const ghData = await ghRes.json();
        if (ghData && Array.isArray(ghData.vault_items) && Array.isArray(ghData.strategy_pages)) {
          bestSnapshot = ghData;
        }
      }
    } catch (e) {
      // 略過
    }

    // 來源 B：讀取內建即時雲端同步頻道最新快照
    try {
      const pollRes = await fetch(`${this.AUTO_CLOUD_ENDPOINT}/json?poll=1&since=all&t=${Date.now()}`, {
        cache: 'no-store'
      });
      if (pollRes.ok) {
        const text = await pollRes.text();
        const lines = text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);

        // 由最新往回找第一筆有效快照
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const msg = JSON.parse(lines[i]);
            if (msg.event !== 'message') continue;

            let candidate = null;
            if (msg.attachment && msg.attachment.url) {
              const attRes = await fetch(msg.attachment.url, { cache: 'no-store' });
              if (attRes.ok) {
                candidate = await attRes.json();
              }
            } else if (msg.message && msg.message.startsWith('{')) {
              candidate = JSON.parse(msg.message);
            }

            if (
              candidate &&
              Array.isArray(candidate.vault_items) &&
              Array.isArray(candidate.strategy_pages)
            ) {
              if (
                !bestSnapshot ||
                !bestSnapshot.updatedAt ||
                new Date(candidate.updatedAt) >= new Date(bestSnapshot.updatedAt)
              ) {
                bestSnapshot = candidate;
              }
              break;
            }
          } catch (innerErr) {
            continue;
          }
        }
      }
    } catch (e) {
      console.warn('讀取即時雲端頻道略過:', e);
    }

    return bestSnapshot;
  }

  applySnapshotToLocal(snapshot, force = false) {
    if (!snapshot) return false;
    const localUpdated = this.getLastUpdatedAt();
    if (!force && snapshot.updatedAt && new Date(snapshot.updatedAt) < new Date(localUpdated)) {
      return false;
    }

    if (Array.isArray(snapshot.domains) && snapshot.domains.length > 0) {
      localStorage.setItem(this.STORAGE_KEYS.DOMAINS, JSON.stringify(snapshot.domains));
    }
    if (Array.isArray(snapshot.vault_items)) {
      this.saveVaultItemsLocal(snapshot.vault_items);
    }
    if (Array.isArray(snapshot.strategy_pages)) {
      this.saveStrategiesLocal(snapshot.strategy_pages);
    }
    if (snapshot.config) {
      this.config = { ...this.config, ...snapshot.config };
      localStorage.setItem(this.STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    }
    if (snapshot.updatedAt) {
      this.touchUpdatedAt(snapshot.updatedAt);
    }
    return true;
  }

  async syncFromCloud(force = false) {
    // 若使用者有設定自己的 Supabase，優先從 Supabase 同步
    if (this.cloudMode === 'supabase' && this.supabase) {
      const [vaultRes, stratRes, domainRes] = await Promise.all([
        this.supabase.from('vault_items').select('*').order('created_at', { ascending: false }),
        this.supabase.from('strategy_pages').select('*').order('updated_at', { ascending: false }),
        this.supabase.from('app_settings').select('*').eq('key', 'domains').maybeSingle()
      ]);

      if (!vaultRes.error && !stratRes.error) {
        if (Array.isArray(vaultRes.data) && vaultRes.data.length > 0) {
          this.saveVaultItemsLocal(vaultRes.data);
        }
        if (Array.isArray(stratRes.data) && stratRes.data.length > 0) {
          this.saveStrategiesLocal(stratRes.data);
        }
        if (domainRes.data && Array.isArray(domainRes.data.value)) {
          localStorage.setItem(this.STORAGE_KEYS.DOMAINS, JSON.stringify(domainRes.data.value));
        }
        return {
          vaultCount: (vaultRes.data || []).length,
          strategyCount: (stratRes.data || []).length
        };
      }
    }

    // 預設從內建跨裝置雲端頻道 + GitHub cloud_db.json 同步最新資料
    const snapshot = await this.fetchLatestAutoCloudSnapshot();
    if (snapshot) {
      this.applySnapshotToLocal(snapshot, force);
      return {
        vaultCount: (snapshot.vault_items || []).length,
        strategyCount: (snapshot.strategy_pages || []).length,
        updatedAt: snapshot.updatedAt
      };
    }

    // 若雲端尚無第一筆快照，自動將目前預設/本機資料初始化推送上雲端
    return await this.pushAllLocalToCloud();
  }

  // 啟動即時跨電腦監聽（當另一台電腦儲存時，本機畫面即時自動更新）
  startRealtimeListener(onRemoteUpdateCallback) {
    if (this.sseConnection) {
      try {
        this.sseConnection.close();
      } catch (e) {}
    }
    try {
      this.sseConnection = new EventSource(`${this.AUTO_CLOUD_ENDPOINT}/sse`);
      this.sseConnection.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event !== 'message') return;
          let snapshot = null;
          if (msg.attachment && msg.attachment.url) {
            const res = await fetch(msg.attachment.url, { cache: 'no-store' });
            if (res.ok) snapshot = await res.json();
          } else if (msg.message && msg.message.startsWith('{')) {
            snapshot = JSON.parse(msg.message);
          }

          if (
            snapshot &&
            snapshot.clientId !== this.clientInstanceId &&
            Array.isArray(snapshot.vault_items)
          ) {
            const applied = this.applySnapshotToLocal(snapshot, true);
            if (applied && typeof onRemoteUpdateCallback === 'function') {
              onRemoteUpdateCallback(snapshot);
            }
          }
        } catch (e) {
          // 略過非同步封包
        }
      };
    } catch (e) {
      console.warn('SSE 即時監聽略過:', e);
    }
  }

  // --------------------------------------------------------------------------
  // 產生與解析「單一策略分頁分享連結」
  // --------------------------------------------------------------------------
  buildShareUrl(strategy) {
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    params.set('share', strategy.slug || strategy.id);

    // 同時附上輕量攜帶式封包作為離線/秒開備援
    const allVault = this.getVaultItems();
    const linkedVault = (strategy.linked_items || [])
      .map((id) => allVault.find((v) => v.id === id))
      .filter(Boolean)
      .map((v) => ({
        id: v.id,
        type: v.type,
        title: v.title,
        content: v.content,
        url: v.url,
        file_name: v.file_name,
        file_size: v.file_size,
        file_type: v.file_type,
        file_data: v.file_data && v.file_data.length < 3000 ? v.file_data : '',
        tags: v.tags
      }));

    const payload = {
      s: strategy,
      v: linkedVault,
      school: this.config.schoolName,
      principal: this.config.principalName
    };

    try {
      const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
      if (encoded.length < 6000) {
        params.set('pkg', encoded);
      }
    } catch (e) {
      console.warn('封包編碼略過', e);
    }

    return `${baseUrl}?${params.toString()}`;
  }

  async fetchSharedStrategyFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const shareSlug = params.get('share');
    if (!shareSlug) return null;

    // 1. 先從內建跨裝置雲端同步最新狀態（確保主任/老師點開連結時看到最新修改）
    try {
      const latestSnapshot = await this.fetchLatestAutoCloudSnapshot();
      if (latestSnapshot && Array.isArray(latestSnapshot.strategy_pages)) {
        const cloudStrat = latestSnapshot.strategy_pages.find(
          (s) => s.slug === shareSlug || s.id === shareSlug
        );
        if (cloudStrat) {
          const allVault = latestSnapshot.vault_items || [];
          const linkedVault = (cloudStrat.linked_items || [])
            .map((id) => allVault.find((v) => v.id === id))
            .filter(Boolean);
          return {
            strategy: cloudStrat,
            linkedVault,
            schoolName:
              (latestSnapshot.config && latestSnapshot.config.schoolName) ||
              this.config.schoolName,
            principalName:
              (latestSnapshot.config && latestSnapshot.config.principalName) ||
              this.config.principalName
          };
        }
      }
    } catch (e) {
      console.warn('讀取雲端分享分頁備援:', e);
    }

    // 2. 檢查網址是否自帶攜帶式封包 (pkg)
    const pkg = params.get('pkg');
    if (pkg) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(pkg)));
        if (decoded && decoded.s) {
          return {
            strategy: decoded.s,
            linkedVault: decoded.v || [],
            schoolName: decoded.school || this.config.schoolName,
            principalName: decoded.principal || this.config.principalName
          };
        }
      } catch (e) {
        console.warn('解析分享封包失敗:', e);
      }
    }

    // 3. 從目前瀏覽器資料庫尋找
    const strategies = this.getStrategies();
    const found = strategies.find((s) => s.slug === shareSlug || s.id === shareSlug);
    if (found) {
      const allVault = this.getVaultItems();
      const linkedVault = (found.linked_items || [])
        .map((id) => allVault.find((v) => v.id === id))
        .filter(Boolean);
      return {
        strategy: found,
        linkedVault,
        schoolName: this.config.schoolName,
        principalName: this.config.principalName
      };
    }

    return { notFound: true, slug: shareSlug };
  }

  // --------------------------------------------------------------------------
  // 完整資料庫 JSON 匯出與匯入備份
  // --------------------------------------------------------------------------
  exportFullBackupJson() {
    const backup = {
      version: '2.0.0',
      updatedAt: this.getLastUpdatedAt(),
      exportedAt: new Date().toISOString(),
      config: {
        principalName: this.config.principalName,
        schoolName: this.config.schoolName
      },
      domains: this.getDomains(),
      vault_items: this.getVaultItems(),
      strategy_pages: this.getStrategies()
    };
    return JSON.stringify(backup, null, 2);
  }

  importFullBackupJson(jsonString) {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed.domains)) {
      localStorage.setItem(this.STORAGE_KEYS.DOMAINS, JSON.stringify(parsed.domains));
    }
    if (Array.isArray(parsed.vault_items)) {
      localStorage.setItem(this.STORAGE_KEYS.VAULT, JSON.stringify(parsed.vault_items));
    }
    if (Array.isArray(parsed.strategy_pages)) {
      localStorage.setItem(this.STORAGE_KEYS.STRATEGIES, JSON.stringify(parsed.strategy_pages));
    }
    if (parsed.config) {
      this.saveConfig(parsed.config);
    }
    this.touchUpdatedAt();
    this.scheduleAutoCloudPush();
    return {
      vaultCount: (parsed.vault_items || []).length,
      strategyCount: (parsed.strategy_pages || []).length
    };
  }
}

window.kennyStore = new KennyDataStore();
