// ============================================================================
// KennyDatabase - 雲端 (Supabase) 與本地雙引擎資料管理中心
// 支援：1. 本地極速存取 + JSON 完整備份
//       2. Supabase 雲端 PostgreSQL 資料庫 + Storage 檔案上傳同步
//       3. 跨裝置單頁分享（支援雲端即時讀取 + 攜帶式加密封包雙模式）
// ============================================================================

class KennyDataStore {
  constructor() {
    this.STORAGE_KEYS = {
      DOMAINS: 'kenny_db_domains_v1',
      VAULT: 'kenny_db_vault_v1',
      STRATEGIES: 'kenny_db_strategies_v1',
      CONFIG: 'kenny_db_config_v1',
      AUTH_UNLOCKED: 'kenny_db_principal_unlocked_v1'
    };

    this.config = this.loadConfig();
    this.supabase = null;
    this.isCloudConnected = false;
    this.initSupabaseClient();
  }

  loadConfig() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEYS.CONFIG);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('讀取設定失敗，使用預設設定', e);
    }
    return {
      principalName: 'Kenny 校長',
      schoolName: '國民小學治校知識庫與策略中心',
      principalPin: '', // 若設定則進入後台需驗證校長 PIN 碼
      supabaseUrl: '',
      supabaseAnonKey: '',
      githubRepoUrl: ''
    };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem(this.STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    this.initSupabaseClient();
    return this.config;
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
      } catch (err) {
        console.error('Supabase 初始化失敗:', err);
        this.supabase = null;
        this.isCloudConnected = false;
      }
    } else {
      this.supabase = null;
      this.isCloudConnected = false;
    }
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
    localStorage.setItem(this.STORAGE_KEYS.DOMAINS, JSON.stringify(domains));
    if (this.isCloudConnected && this.supabase) {
      try {
        await this.supabase.from('app_settings').upsert({
          key: 'domains',
          value: domains,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn('雲端儲存領域設定失敗:', err);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 讀取與儲存：資料素材庫 (Vault Items)
  // --------------------------------------------------------------------------
  getVaultItems() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEYS.VAULT);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn(e);
    }
    const defaults = JSON.parse(JSON.stringify(window.KENNY_DEFAULT_VAULT_ITEMS));
    localStorage.setItem(this.STORAGE_KEYS.VAULT, JSON.stringify(defaults));
    return defaults;
  }

  saveVaultItemsLocal(items) {
    localStorage.setItem(this.STORAGE_KEYS.VAULT, JSON.stringify(items));
  }

  async upsertVaultItem(item) {
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

    if (this.isCloudConnected && this.supabase) {
      try {
        await this.supabase.from('vault_items').upsert(updatedItem);
      } catch (err) {
        console.warn('雲端同步資料素材失敗:', err);
      }
    }
    return updatedItem;
  }

  async deleteVaultItem(id) {
    const items = this.getVaultItems().filter((i) => i.id !== id);
    this.saveVaultItemsLocal(items);

    // 同步從策略分頁中移除已刪除的關聯 ID
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

    if (this.isCloudConnected && this.supabase) {
      try {
        await this.supabase.from('vault_items').delete().eq('id', id);
      } catch (err) {
        console.warn('雲端刪除素材失敗:', err);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 檔案上傳處理（支援雲端 Supabase Storage 或 本地 DataURL）
  // --------------------------------------------------------------------------
  async uploadFile(file) {
    if (this.isCloudConnected && this.supabase) {
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
            url: urlData.publicUrl,
            file_data: '',
            storageMode: 'supabase'
          };
        }
      } catch (err) {
        console.warn('Supabase Storage 上傳失敗，自動轉為內嵌儲存:', err);
      }
    }

    // 本地或備援：轉為 Base64 Data URL（若超過 3.5MB 則記錄檔案中繼資訊並提示搭配雲端）
    return new Promise((resolve) => {
      if (file.size > 3.5 * 1024 * 1024) {
        const objectUrl = URL.createObjectURL(file);
        resolve({
          url: objectUrl,
          file_data: '',
          storageMode: 'local_session',
          warning: '檔案大於 3.5MB，目前暫存於本次瀏覽階段；連接 Supabase 雲端後即可永久上傳大型檔案。'
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          url: '',
          file_data: e.target.result,
          storageMode: 'embedded'
        });
      };
      reader.readAsDataURL(file);
    });
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

    if (this.isCloudConnected && this.supabase) {
      try {
        await this.supabase.from('strategy_pages').upsert(updated);
      } catch (err) {
        console.warn('雲端同步策略分頁失敗:', err);
      }
    }
    return updated;
  }

  async deleteStrategy(id) {
    const strategies = this.getStrategies().filter((s) => s.id !== id);
    this.saveStrategiesLocal(strategies);
    if (this.isCloudConnected && this.supabase) {
      try {
        await this.supabase.from('strategy_pages').delete().eq('id', id);
      } catch (err) {
        console.warn('雲端刪除策略分頁失敗:', err);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 雙向雲端同步 (Sync Local <-> Supabase Cloud)
  // --------------------------------------------------------------------------
  async syncFromCloud() {
    if (!this.isCloudConnected || !this.supabase) {
      throw new Error('尚未設定 Supabase 雲端連線');
    }

    const [vaultRes, stratRes, domainRes] = await Promise.all([
      this.supabase.from('vault_items').select('*').order('created_at', { ascending: false }),
      this.supabase.from('strategy_pages').select('*').order('updated_at', { ascending: false }),
      this.supabase.from('app_settings').select('*').eq('key', 'domains').maybeSingle()
    ]);

    if (vaultRes.error) throw vaultRes.error;
    if (stratRes.error) throw stratRes.error;

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

  async pushAllLocalToCloud() {
    if (!this.isCloudConnected || !this.supabase) {
      throw new Error('尚未設定 Supabase 雲端連線');
    }

    const vaultItems = this.getVaultItems();
    const strategies = this.getStrategies();
    const domains = this.getDomains();

    if (vaultItems.length > 0) {
      const { error: vErr } = await this.supabase.from('vault_items').upsert(vaultItems);
      if (vErr) throw vErr;
    }

    if (strategies.length > 0) {
      const { error: sErr } = await this.supabase.from('strategy_pages').upsert(strategies);
      if (sErr) throw sErr;
    }

    const { error: dErr } = await this.supabase.from('app_settings').upsert({
      key: 'domains',
      value: domains,
      updated_at: new Date().toISOString()
    });
    if (dErr) throw dErr;

    return {
      vaultCount: vaultItems.length,
      strategyCount: strategies.length
    };
  }

  // --------------------------------------------------------------------------
  // 產生與解析「單一策略分頁分享連結」
  // --------------------------------------------------------------------------
  buildShareUrl(strategy) {
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    params.set('share', strategy.slug || strategy.id);

    // 若已連接 Supabase 雲端，附上公開讀取參數，讓外部裝置可即時向雲端拉取最新策略分頁
    if (this.isCloudConnected && this.config.supabaseUrl && this.config.supabaseAnonKey) {
      params.set('sb_url', btoa(this.config.supabaseUrl));
      params.set('sb_key', btoa(this.config.supabaseAnonKey));
    } else {
      // 若尚未設定雲端，自動打包該策略分頁與其掛載素材（不含超大 Base64 檔案以保持網址精簡）為壓縮封包
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
          // 僅保留小型文字檔於網址封包內
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
        params.set('pkg', encoded);
      } catch (e) {
        console.warn('封包編碼略過', e);
      }
    }

    return `${baseUrl}?${params.toString()}`;
  }

  async fetchSharedStrategyFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const shareSlug = params.get('share');
    if (!shareSlug) return null;

    // 1. 先檢查是否有雲端參數可即時讀取最新資料
    const sbUrlB64 = params.get('sb_url');
    const sbKeyB64 = params.get('sb_key');
    if (sbUrlB64 && sbKeyB64 && window.supabase) {
      try {
        const sbUrl = atob(sbUrlB64);
        const sbKey = atob(sbKeyB64);
        const tempClient = window.supabase.createClient(sbUrl, sbKey);
        const { data: stratData } = await tempClient
          .from('strategy_pages')
          .select('*')
          .or(`slug.eq.${shareSlug},id.eq.${shareSlug}`)
          .maybeSingle();

        if (stratData) {
          let linkedVault = [];
          if (Array.isArray(stratData.linked_items) && stratData.linked_items.length > 0) {
            const { data: vData } = await tempClient
              .from('vault_items')
              .select('*')
              .in('id', stratData.linked_items);
            linkedVault = vData || [];
          }
          return {
            strategy: stratData,
            linkedVault,
            schoolName: this.config.schoolName,
            principalName: this.config.principalName
          };
        }
      } catch (e) {
        console.warn('從雲端拉取分享分頁失敗，改用本地或封包資料:', e);
      }
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
      version: '1.0.0',
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
    return {
      vaultCount: (parsed.vault_items || []).length,
      strategyCount: (parsed.strategy_pages || []).length
    };
  }
}

window.kennyStore = new KennyDataStore();
