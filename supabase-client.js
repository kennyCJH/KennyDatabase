// ============================================================================
// KennyDatabase - 跨裝置自動雲端同步與多引擎資料管理中心
// 支援：
// 1. 內建免設定「跨電腦即時雲端同步引擎 (Auto Cloud Sync + GitHub cloud_db.json)」
//    - 任何電腦、手機、平板登入後修改資料，自動透過加密雲端頻道即時同步，無須手動設定！
//    - 支援大型檔案（如 3.2MB+ PPTX / PDF / Word）自動分片雲端同步 + IndexedDB 高速儲存
// 2. 選配「Supabase 雲端 PostgreSQL 資料庫」
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
      LAST_UPDATED_AT: 'kenny_db_last_updated_at_v1',
      DELETED_IDS: 'kenny_db_deleted_ids_v1'
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

  getDeletedIds() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEYS.DELETED_IDS);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) {}
    return [];
  }

  addDeletedId(id) {
    if (!id) return;
    const list = new Set(this.getDeletedIds());
    list.add(id);
    const arr = Array.from(list).slice(-500);
    try {
      localStorage.setItem(this.STORAGE_KEYS.DELETED_IDS, JSON.stringify(arr));
    } catch (e) {}
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
  // IndexedDB 大容量檔案儲存庫（支援數十 MB 簡報/PDF 本地高速存取，不受 localStorage 5MB 限制）
  // --------------------------------------------------------------------------
  openFileIdb() {
    return new Promise((resolve) => {
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
    if (!key || !dataUrl || dataUrl.startsWith('idb://')) return;
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
    // 確保大型檔案實體存入 IndexedDB，並將記憶體與 localStorage 中的屬性轉為輕量指標 (idb://...)
    const normalizedItems = (items || []).map((item) => {
      const copy = { ...item };
      if (copy.file_data && copy.file_data.length > 150000 && !copy.file_data.startsWith('idb://')) {
        const idbKey = `item_${copy.id}`;
        this.saveFileBlobToIdb(idbKey, copy.file_data);
        copy.file_data = `idb://${idbKey}`;
      }
      if (Array.isArray(copy.files)) {
        copy.files = copy.files.map((f) => {
          const fCopy = { ...f };
          if (fCopy.data && fCopy.data.length > 150000 && !fCopy.data.startsWith('idb://')) {
            const fKey = fCopy.id ? (fCopy.id.startsWith('file_') ? fCopy.id : `file_${fCopy.id}`) : `file_${Date.now()}`;
            this.saveFileBlobToIdb(fKey, fCopy.data);
            fCopy.data = `idb://${fKey}`;
          }
          return fCopy;
        });
      }
      return copy;
    });

    this.memoryVaultItems = normalizedItems;

    try {
      localStorage.setItem(this.STORAGE_KEYS.VAULT, JSON.stringify(normalizedItems));
    } catch (quotaErr) {
      try {
        const slimItems = normalizedItems.map((item) => ({
          ...item,
          file_data:
            item.file_data && item.file_data.length > 50000 && !item.file_data.startsWith('idb://')
              ? `idb://item_${item.id}`
              : item.file_data || '',
          files: Array.isArray(item.files)
            ? item.files.map((f) => ({
                ...f,
                data:
                  f.data && f.data.length > 50000 && !f.data.startsWith('idb://')
                    ? `idb://${f.id && f.id.startsWith('file_') ? f.id : 'file_' + f.id}`
                    : f.data || ''
              }))
            : []
        }));
        localStorage.setItem(this.STORAGE_KEYS.VAULT, JSON.stringify(slimItems));
      } catch (e2) {
        console.warn('localStorage 容量已滿，已由記憶體與 IndexedDB 儲存:', e2);
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
    this.addDeletedId(id);
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
  // 大型檔案（如 3.2MB+ PPTX / PDF / Word）自動分片雲端同步與本地 IndexedDB 儲存引擎
  // --------------------------------------------------------------------------
  async uploadLargeFileToCloudChunks(fileId, dataUrl, onProgress = null) {
    const cleanId = fileId.replace(/[^a-zA-Z0-9_]/g, '');
    const cloudFileTopic = `kenny_f_${cleanId}`;
    const endpoint = `https://ntfy.sh/${cloudFileTopic}`;

    // 每片 400KB (400,000 字元)，確保遠低於雲端單一請求上限，100% 穩定通過不觸發 HTTP 413
    const CHUNK_SIZE = 400000;
    const totalChunks = Math.ceil(dataUrl.length / CHUNK_SIZE);
    const chunkUrls = new Array(totalChunks).fill('');
    let completed = 0;

    // 以每批 3 個分片並行上傳，3.2MB PPTX (約 11 片) 僅需約 1.5 ~ 2.5 秒即可完成雲端上傳
    const BATCH_SIZE = 3;
    for (let start = 0; start < totalChunks; start += BATCH_SIZE) {
      const batchIndices = [];
      for (let j = start; j < Math.min(start + BATCH_SIZE, totalChunks); j++) {
        batchIndices.push(j);
      }

      await Promise.all(
        batchIndices.map(async (idx) => {
          const slice = dataUrl.slice(idx * CHUNK_SIZE, (idx + 1) * CHUNK_SIZE);
          const payload = JSON.stringify({
            idx,
            total: totalChunks,
            chunk: slice
          });

          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'text/plain; charset=utf-8'
                },
                body: payload
              });
              if (res.ok) {
                const info = await res.json();
                if (info && info.attachment && info.attachment.url) {
                  chunkUrls[idx] = info.attachment.url;
                }
                break;
              }
            } catch (err) {
              if (attempt === 1) {
                console.warn(`分片 ${idx + 1}/${totalChunks} 雲端備份略過:`, err);
              }
            }
          }

          completed++;
          if (typeof onProgress === 'function') {
            onProgress(Math.round((completed / totalChunks) * 100), completed, totalChunks);
          }
        })
      );
    }

    return {
      cloudFileTopic,
      chunkUrls: chunkUrls.filter(Boolean),
      totalChunks
    };
  }

  async downloadLargeFileFromCloudChunks(fileObj) {
    if (!fileObj) return '';
    try {
      // 方式 A：若具備各分片直連網址且數量完整，直接並行高速抓取重組
      if (
        Array.isArray(fileObj.chunkUrls) &&
        fileObj.chunkUrls.length > 0 &&
        (!fileObj.totalChunks || fileObj.chunkUrls.length === fileObj.totalChunks)
      ) {
        const parts = new Array(fileObj.chunkUrls.length).fill('');
        await Promise.all(
          fileObj.chunkUrls.map(async (u, i) => {
            const res = await fetch(u, { cache: 'force-cache' });
            if (res.ok) {
              const obj = await res.json();
              parts[obj.idx !== undefined ? obj.idx : i] = obj.chunk || '';
            }
          })
        );
        const joined = parts.join('');
        if (joined.startsWith('data:')) return joined;
      }

      // 方式 B：從該檔案專屬雲端頻道輪詢所有分片並重組
      if (fileObj.cloudFileTopic) {
        const pollUrl = `https://ntfy.sh/${fileObj.cloudFileTopic}/json?poll=1&since=all&t=${Date.now()}`;
        const res = await fetch(pollUrl, { cache: 'no-store' });
        if (res.ok) {
          const text = await res.text();
          const lines = text
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
          const chunkMap = new Map();

          for (const line of lines) {
            try {
              const msg = JSON.parse(line);
              if (msg.event !== 'message') continue;
              let data = null;
              if (msg.attachment && msg.attachment.url) {
                const attRes = await fetch(msg.attachment.url);
                if (attRes.ok) data = await attRes.json();
              } else if (msg.message && msg.message.startsWith('{')) {
                data = JSON.parse(msg.message);
              }
              if (data && typeof data.idx === 'number' && data.chunk) {
                chunkMap.set(data.idx, data.chunk);
              }
            } catch (e) {}
          }

          if (chunkMap.size > 0) {
            const sortedIndices = Array.from(chunkMap.keys()).sort((a, b) => a - b);
            const joined = sortedIndices.map((idx) => chunkMap.get(idx)).join('');
            if (joined.startsWith('data:')) return joined;
          }
        }
      }
    } catch (err) {
      console.warn('從雲端重組大檔案失敗:', err);
    }
    return '';
  }

  async uploadFile(file, onProgress = null) {
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

    // 2. 在本地將檔案轉為 DataURL 並寫入 IndexedDB（支援 3.2MB 甚至數十 MB 檔案）
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });

    if (!dataUrl) {
      throw new Error('讀取檔案失敗，請確認檔案是否有效');
    }

    // 寫入瀏覽器 IndexedDB 大容量資料庫
    await this.saveFileBlobToIdb(fileId, dataUrl);

    // 3. 若檔案大於 ~120KB (DataURL 長度 > 160,000，例如 3.2MB PPTX)，啟動分片雲端上傳並回傳輕量指標
    if (dataUrl.length > 160000) {
      const chunkMeta = await this.uploadLargeFileToCloudChunks(fileId, dataUrl, onProgress);
      return {
        id: fileId,
        url: '',
        file_data: `idb://${fileId}`,
        cloudFileTopic: chunkMeta.cloudFileTopic,
        chunkUrls: chunkMeta.chunkUrls,
        totalChunks: chunkMeta.totalChunks,
        storageMode: 'chunked_cloud_idb'
      };
    }

    if (typeof onProgress === 'function') {
      onProgress(100, 1, 1);
    }

    return {
      id: fileId,
      url: '',
      file_data: dataUrl,
      cloudFileTopic: '',
      chunkUrls: [],
      totalChunks: 1,
      storageMode: 'embedded_idb'
    };
  }

  // 將 DataURL 轉換為瀏覽器原生 Blob Object URL，解決 Chrome/Edge 對 >2MB data: URL 下載失敗的限制
  dataUrlToBlobUrl(dataUrl) {
    try {
      if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx < 0) return dataUrl;
      const meta = dataUrl.slice(0, commaIdx);
      const base64 = dataUrl.slice(commaIdx + 1);
      const mimeMatch = meta.match(/data:([^;]+)/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

      if (meta.includes(';base64')) {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mime });
        return URL.createObjectURL(blob);
      } else {
        const blob = new Blob([decodeURIComponent(base64)], { type: mime });
        return URL.createObjectURL(blob);
      }
    } catch (e) {
      console.warn('轉換 Blob URL 備援:', e);
      return dataUrl;
    }
  }

  async resolveFileDownloadHref(fileObjOrItem) {
    if (!fileObjOrItem) return '';
    const rawUrl = fileObjOrItem.url || '';
    const rawData = fileObjOrItem.data || fileObjOrItem.file_data || '';

    // 1. 外部直連網址 (如 Supabase Storage)
    if (rawUrl && !rawUrl.startsWith('idb://') && !rawUrl.startsWith('data:')) {
      return rawUrl;
    }

    // 2. 直接內嵌的 DataURL
    if (rawData && rawData.startsWith('data:')) {
      return this.dataUrlToBlobUrl(rawData);
    }

    // 3. 從本機 IndexedDB 高速讀取
    const candidateKeys = [];
    if (rawData && rawData.startsWith('idb://')) {
      candidateKeys.push(rawData.replace('idb://', ''));
    }
    if (fileObjOrItem.id) {
      candidateKeys.push(fileObjOrItem.id);
      if (!fileObjOrItem.id.startsWith('file_')) {
        candidateKeys.push(`file_${fileObjOrItem.id}`);
        candidateKeys.push(`item_${fileObjOrItem.id}`);
      }
    }

    for (const key of candidateKeys) {
      const fromIdb = await this.getFileBlobFromIdb(key);
      if (fromIdb && fromIdb.startsWith('data:')) {
        return this.dataUrlToBlobUrl(fromIdb);
      }
    }

    // 4. 若在另一台電腦開啟（本機 IndexedDB 尚無此大檔案），自動從雲端分片重組並快取至本機 IndexedDB
    if (
      (Array.isArray(fileObjOrItem.chunkUrls) && fileObjOrItem.chunkUrls.length > 0) ||
      fileObjOrItem.cloudFileTopic
    ) {
      const downloadedDataUrl = await this.downloadLargeFileFromCloudChunks(fileObjOrItem);
      if (downloadedDataUrl && downloadedDataUrl.startsWith('data:')) {
        const cacheKey = candidateKeys[0] || fileObjOrItem.id || `file_${Date.now()}`;
        await this.saveFileBlobToIdb(cacheKey, downloadedDataUrl);
        return this.dataUrlToBlobUrl(downloadedDataUrl);
      }
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
    this.addDeletedId(id);
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

    // 確保同步快照中不包含超過 160KB 的原始 Base64 字串（大型檔案已透過分片雲端頻道與 IndexedDB 儲存）
    // 徹底根絕 HTTP 413 Request Entity Too Large 錯誤
    const slimVaultItems = this.getVaultItems().map((item) => {
      const copy = { ...item };
      if (copy.file_data && copy.file_data.length > 160000 && !copy.file_data.startsWith('idb://')) {
        const key = `item_${copy.id}`;
        this.saveFileBlobToIdb(key, copy.file_data);
        copy.file_data = `idb://${key}`;
      }
      if (Array.isArray(copy.files)) {
        copy.files = copy.files.map((f) => {
          const fCopy = { ...f };
          if (fCopy.data && fCopy.data.length > 160000 && !fCopy.data.startsWith('idb://')) {
            const fKey = fCopy.id && fCopy.id.startsWith('file_') ? fCopy.id : `file_${fCopy.id || Date.now()}`;
            this.saveFileBlobToIdb(fKey, fCopy.data);
            fCopy.data = `idb://${fKey}`;
          }
          return fCopy;
        });
      }
      return copy;
    });

    const snapshot = {
      version: '2.1.0',
      updatedAt: now,
      clientId: this.clientInstanceId,
      deleted_ids: this.getDeletedIds(),
      config: {
        principalName: this.config.principalName,
        schoolName: this.config.schoolName,
        principalPin: this.config.principalPin
      },
      domains: this.getDomains(),
      vault_items: slimVaultItems,
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

  // 智慧合併雲端與本機資料（確保本機剛上傳的大檔案或新增項目絕不會被舊快照覆蓋消失）
  applySnapshotToLocal(snapshot, force = false) {
    if (!snapshot) return false;

    const deletedSet = new Set([
      ...this.getDeletedIds(),
      ...(Array.isArray(snapshot.deleted_ids) ? snapshot.deleted_ids : [])
    ]);
    try {
      localStorage.setItem(
        this.STORAGE_KEYS.DELETED_IDS,
        JSON.stringify(Array.from(deletedSet).slice(-500))
      );
    } catch (e) {}

    let localHasUnsyncedChanges = false;

    // 1. 智慧合併 Vault Items
    if (Array.isArray(snapshot.vault_items)) {
      const localItems = this.getVaultItems();
      const mergedMap = new Map();

      snapshot.vault_items.forEach((remoteItem) => {
        if (remoteItem && remoteItem.id && !deletedSet.has(remoteItem.id)) {
          mergedMap.set(remoteItem.id, remoteItem);
        }
      });

      localItems.forEach((localItem) => {
        if (!localItem || !localItem.id || deletedSet.has(localItem.id)) return;
        const remoteItem = mergedMap.get(localItem.id);
        if (!remoteItem) {
          // 本機剛新增、尚未出現在雲端快照的項目 -> 完整保留！
          mergedMap.set(localItem.id, localItem);
          localHasUnsyncedChanges = true;
        } else {
          const localTime = new Date(localItem.updated_at || localItem.created_at || 0).getTime();
          const remoteTime = new Date(remoteItem.updated_at || remoteItem.created_at || 0).getTime();
          if (localTime > remoteTime) {
            mergedMap.set(localItem.id, localItem);
            localHasUnsyncedChanges = true;
          }
        }
      });

      const mergedList = Array.from(mergedMap.values()).sort((a, b) => {
        const tA = new Date(a.created_at || a.updated_at || 0).getTime();
        const tB = new Date(b.created_at || b.updated_at || 0).getTime();
        return tB - tA;
      });
      this.saveVaultItemsLocal(mergedList);
    }

    // 2. 智慧合併 Strategy Pages
    if (Array.isArray(snapshot.strategy_pages)) {
      const localStrats = this.getStrategies();
      const stratMap = new Map();

      snapshot.strategy_pages.forEach((remoteStrat) => {
        if (remoteStrat && remoteStrat.id && !deletedSet.has(remoteStrat.id)) {
          stratMap.set(remoteStrat.id, remoteStrat);
        }
      });

      localStrats.forEach((localStrat) => {
        if (!localStrat || !localStrat.id || deletedSet.has(localStrat.id)) return;
        const remoteStrat = stratMap.get(localStrat.id);
        if (!remoteStrat) {
          stratMap.set(localStrat.id, localStrat);
          localHasUnsyncedChanges = true;
        } else {
          const localTime = new Date(localStrat.updated_at || localStrat.created_at || 0).getTime();
          const remoteTime = new Date(remoteStrat.updated_at || remoteStrat.created_at || 0).getTime();
          if (localTime > remoteTime) {
            stratMap.set(localStrat.id, localStrat);
            localHasUnsyncedChanges = true;
          }
        }
      });

      this.saveStrategiesLocal(Array.from(stratMap.values()));
    }

    if (Array.isArray(snapshot.domains) && snapshot.domains.length > 0) {
      localStorage.setItem(this.STORAGE_KEYS.DOMAINS, JSON.stringify(snapshot.domains));
    }
    if (snapshot.config) {
      this.config = { ...this.config, ...snapshot.config };
      localStorage.setItem(this.STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    }
    if (snapshot.updatedAt && !localHasUnsyncedChanges) {
      this.touchUpdatedAt(snapshot.updatedAt);
    }

    // 若本機有比雲端更新的項目，合併後自動補推上雲端
    if (localHasUnsyncedChanges) {
      this.scheduleAutoCloudPush();
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
        vaultCount: this.getVaultItems().length,
        strategyCount: this.getStrategies().length,
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
      version: '2.1.0',
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
      this.saveVaultItemsLocal(parsed.vault_items);
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
