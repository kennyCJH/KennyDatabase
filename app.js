// ============================================================================
// KennyDatabase - 主應用程式邏輯 (Notion / Linear 極簡科技風校長工作台)
// ============================================================================

class KennyApp {
  constructor() {
    this.store = window.kennyStore;
    this.currentNav = 'all'; // 'inbox' | 'all' | 'starred' | 'domain:<id>' | 'strategy:<id>'
    this.viewMode = 'table'; // 'table' | 'gallery'
    this.typeFilter = 'all'; // 'all' | 'snippet' | 'link' | 'file'
    this.searchQuery = '';
    this.modalCurrentType = 'snippet';
    this.pendingFileUpload = null;
    this.editingDomains = [];
    this.unlockedShareSlugs = new Set();
  }

  async init() {
    // 檢查是否為「單頁分享獨立檢視模式 (?share=...)」——維持單頁分享原先的權限設定
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('share')) {
      await this.renderStandaloneShareMode();
      return;
    }

    // 主工作台進入前，檢查是否已通過校長主密碼驗證 (預設密碼: cany1234)
    if (!this.store.isPrincipalUnlocked()) {
      this.showPrincipalAuthGate();
      return;
    }

    await this.enterPrincipalWorkspace();
  }

  showPrincipalAuthGate() {
    document.getElementById('appRoot').style.display = 'none';
    document.getElementById('shareStandaloneRoot').style.display = 'none';
    const gate = document.getElementById('principalAuthGate');
    gate.style.display = 'block';
    const input = document.getElementById('principalMasterPwdInput');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 50);
    }
  }

  async handlePrincipalLogin() {
    const input = document.getElementById('principalMasterPwdInput');
    const remember = document.getElementById('rememberPrincipalDevice');
    const errEl = document.getElementById('principalAuthError');
    const pwd = input ? input.value : '';
    const rememberDays = remember && remember.checked ? 7 : 0;

    if (this.store.verifyPrincipalPassword(pwd, rememberDays)) {
      if (errEl) errEl.style.display = 'none';
      document.getElementById('principalAuthGate').style.display = 'none';
      await this.enterPrincipalWorkspace();
      this.showToast('🔓 校長身分驗證通過，歡迎進入知識庫工作台');
    } else {
      if (errEl) errEl.style.display = 'block';
      if (input) input.select();
    }
  }

  handlePrincipalLock() {
    this.store.lockPrincipalSession();
    this.showPrincipalAuthGate();
    this.showToast('🔒 工作台已鎖定');
  }

  async enterPrincipalWorkspace() {
    document.getElementById('principalAuthGate').style.display = 'none';
    document.getElementById('appRoot').style.display = 'flex';

    // 初始化雲端自動同步（若已設定 Supabase）
    this.refreshHeaderAndCloudBadge();
    if (this.store.isCloudConnected) {
      try {
        await this.store.syncFromCloud();
        this.showToast('☁️ 已自動從 Supabase 雲端同步最新資料');
      } catch (e) {
        console.warn('初次雲端同步略過:', e);
      }
    }

    this.bindKeyboardShortcuts();
    this.renderAll();
  }

  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('globalSearchInput');
        if (searchInput) searchInput.focus();
      }
    });
  }

  refreshHeaderAndCloudBadge() {
    const cfg = this.store.config;
    document.getElementById('brandPrincipalName').textContent = cfg.principalName || 'Kenny 校長知識庫';
    document.getElementById('brandSchoolName').textContent = cfg.schoolName || '治校政策與策略決策中心';

    const dot = document.getElementById('cloudStatusDot');
    const txt = document.getElementById('cloudStatusText');
    if (this.store.isCloudConnected) {
      dot.className = 'status-indicator online';
      txt.textContent = 'Supabase 雲端同步已連線';
    } else {
      dot.className = 'status-indicator local';
      txt.textContent = '本地儲存模式 (點擊設雲端)';
    }
  }

  renderAll() {
    this.renderSidebar();
    this.renderWorkspace();
  }

  // --------------------------------------------------------------------------
  // 左側導覽欄渲染
  // --------------------------------------------------------------------------
  renderSidebar() {
    const vaultItems = this.store.getVaultItems();
    const domains = this.store.getDomains();
    const strategies = this.store.getStrategies();

    // 計算數量徽章
    const inboxCount = vaultItems.filter((i) => i.is_inbox).length;
    const starredCount = vaultItems.filter((i) => i.is_starred).length;
    document.getElementById('badgeInbox').textContent = inboxCount;
    document.getElementById('badgeAllVault').textContent = vaultItems.length;
    document.getElementById('badgeStarred').textContent = starredCount;

    // 啟用狀態切換
    document.getElementById('navInbox').classList.toggle('active', this.currentNav === 'inbox');
    document.getElementById('navAllVault').classList.toggle('active', this.currentNav === 'all');
    document.getElementById('navStarred').classList.toggle('active', this.currentNav === 'starred');

    // 渲染第二層：校務六大核心領域
    const domainListEl = document.getElementById('domainNavList');
    domainListEl.innerHTML = domains
      .map((d) => {
        const count = vaultItems.filter((i) => i.domain === d.id).length;
        const navKey = `domain:${d.id}`;
        const activeClass = this.currentNav === navKey ? 'active' : '';
        return `
          <div class="nav-item ${activeClass}" onclick="app.setNavigation('${navKey}')">
            <div class="nav-item-left">
              <span class="domain-dot" style="background-color: ${d.color || '#2563eb'};"></span>
              <span class="nav-item-label">${this.escapeHtml(d.name)}</span>
            </div>
            <span class="nav-badge">${count}</span>
          </div>
        `;
      })
      .join('');

    // 渲染第三層：治校政策與策略分頁
    const stratListEl = document.getElementById('strategyNavList');
    stratListEl.innerHTML = strategies
      .map((s) => {
        const navKey = `strategy:${s.id}`;
        const activeClass = this.currentNav === navKey ? 'active' : '';
        const modeIcon =
          s.share_mode === 'public' ? '🌐' : s.share_mode === 'passcode' ? '🔑' : '🔒';
        return `
          <div class="nav-item ${activeClass}" onclick="app.setNavigation('${navKey}')">
            <div class="nav-item-left">
              <span title="分享狀態：${s.share_mode}">${modeIcon}</span>
              <span class="nav-item-label">${this.escapeHtml(s.title)}</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  setNavigation(navKey) {
    this.currentNav = navKey;
    document.getElementById('sidebar').classList.remove('open');
    this.renderAll();
  }

  handleSearch(query) {
    this.searchQuery = (query || '').trim().toLowerCase();
    if (this.currentNav.startsWith('strategy:')) {
      this.currentNav = 'all';
      this.renderSidebar();
    }
    this.renderWorkspace();
  }

  // --------------------------------------------------------------------------
  // 中央主工作區渲染（依導覽切換 Vault 檢視 或 策略分頁編輯器）
  // --------------------------------------------------------------------------
  renderWorkspace() {
    if (this.currentNav.startsWith('strategy:')) {
      const stratId = this.currentNav.replace('strategy:', '');
      this.renderStrategyWorkspace(stratId);
    } else {
      this.renderVaultWorkspace();
    }
  }

  // --------------------------------------------------------------------------
  // 第一、二層：資料素材庫檢視 (Vault Workspace)
  // --------------------------------------------------------------------------
  renderVaultWorkspace() {
    const domains = this.store.getDomains();
    const allItems = this.store.getVaultItems();
    let title = '全部資料庫總覽';
    let subtitle = '涵蓋所有複製文字、網頁連結與上傳檔案';
    let defaultDomainForCapture = 'vision';

    let filtered = allItems.filter((item) => {
      if (this.currentNav === 'inbox') return item.is_inbox;
      if (this.currentNav === 'starred') return item.is_starred;
      if (this.currentNav.startsWith('domain:')) {
        const domId = this.currentNav.replace('domain:', '');
        return item.domain === domId;
      }
      return true;
    });

    if (this.currentNav === 'inbox') {
      title = '⚡ 快速收件匣 (Inbox)';
      subtitle = '隨手存入、尚未歸類的靈感、連結與檔案';
    } else if (this.currentNav === 'starred') {
      title = '⭐ 星號重點標記';
      subtitle = '優先關注的高價值校務參考資料';
    } else if (this.currentNav.startsWith('domain:')) {
      const domId = this.currentNav.replace('domain:', '');
      defaultDomainForCapture = domId;
      const domObj = domains.find((d) => d.id === domId);
      if (domObj) {
        title = `${domObj.name}`;
        subtitle = `${domObj.office} ｜ ${domObj.description || ''}`;
      }
    }

    if (this.typeFilter !== 'all') {
      filtered = filtered.filter((i) => i.type === this.typeFilter);
    }

    if (this.searchQuery) {
      filtered = filtered.filter((i) => {
        const hay = [
          i.title,
          i.content,
          i.url,
          i.file_name,
          ...(i.tags || [])
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(this.searchQuery);
      });
    }

    this.currentFilteredVaultItems = filtered;
    this.currentVaultPageTitle = title;

    document.getElementById('workspaceTitle').textContent = title;
    document.getElementById('workspaceSubtitle').textContent = subtitle;

    const bodyEl = document.getElementById('workspaceBody');
    const domainOptionsHtml = domains
      .map(
        (d) =>
          `<option value="${d.id}" ${d.id === defaultDomainForCapture ? 'selected' : ''}>${this.escapeHtml(d.name)}</option>`
      )
      .join('');

    bodyEl.innerHTML = `
      <!-- 頂部 3 秒快速收集列 (Quick Capture) -->
      <div class="quick-capture-card">
        <div class="quick-capture-top">
          <span style="font-size: 16px;">⚡</span>
          <input
            type="text"
            id="quickCaptureText"
            class="quick-capture-input"
            placeholder="在此直接貼上複製的文字、網頁連結 (https://...)，按下 Enter 即可存入資料庫..."
            onkeydown="if(event.key==='Enter') app.handleQuickCaptureSubmit()"
          />
          <select id="quickCaptureDomain" class="form-select" style="width: 190px;">
            ${domainOptionsHtml}
          </select>
          <button class="btn btn-primary" onclick="app.handleQuickCaptureSubmit()">快速存入</button>
        </div>
        <div class="quick-capture-actions">
          <div style="font-size: 12px; color: var(--text-muted);">
            💡 提示：若貼上網址會自動識別為「🔗 網頁連結」；您也可以直接上傳 PDF / Word / 簡報檔案：
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm" onclick="document.getElementById('quickFileUpload').click()">📎 直接上傳檔案存入</button>
            <input type="file" id="quickFileUpload" style="display: none;" onchange="app.handleQuickFileUpload(event)" />
            <button class="btn btn-sm" onclick="app.openVaultModal()">📝 開啟完整編輯視窗</button>
          </div>
        </div>
      </div>

      <!-- 篩選與檢視切換工具列 -->
      <div class="toolbar-row">
        <div class="filter-pills">
          <button class="filter-pill ${this.typeFilter === 'all' ? 'active' : ''}" onclick="app.setTypeFilter('all')">
            全部 (${filtered.length})
          </button>
          <button class="filter-pill ${this.typeFilter === 'snippet' ? 'active' : ''}" onclick="app.setTypeFilter('snippet')">
            📝 複製文字 / 筆記
          </button>
          <button class="filter-pill ${this.typeFilter === 'link' ? 'active' : ''}" onclick="app.setTypeFilter('link')">
            🔗 網頁連結
          </button>
          <button class="filter-pill ${this.typeFilter === 'file' ? 'active' : ''}" onclick="app.setTypeFilter('file')">
            📎 檔案附件
          </button>
        </div>

        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <button class="btn btn-gemini-red btn-sm" onclick="app.openGeminiFromCurrentVaultView()">
            ✨ 連結 Gemini 討論本頁資料
          </button>
          <button class="btn btn-sm ${this.viewMode === 'table' ? 'btn-primary' : ''}" onclick="app.setViewMode('table')">
            ☰ 緊湊列表 (Linear)
          </button>
          <button class="btn btn-sm ${this.viewMode === 'gallery' ? 'btn-primary' : ''}" onclick="app.setViewMode('gallery')">
            ⊞ 卡片牆 (Notion)
          </button>
        </div>
      </div>

      <!-- 資料列表內容 -->
      ${
        filtered.length === 0
          ? `<div style="text-align: center; padding: 60px 20px; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
               <div style="font-size: 28px; margin-bottom: 8px;">📭</div>
               <div style="font-weight: 600; color: var(--text-secondary);">目前此分類尚無符合的資料</div>
               <div style="font-size: 12.5px; margin-top: 4px;">可在上方快速貼上文字、網址或點擊「+ 新增資料」開始累積您的校長智庫。</div>
             </div>`
          : this.viewMode === 'table'
          ? this.renderVaultTableView(filtered, domains)
          : this.renderVaultGalleryView(filtered, domains)
      }
    `;
  }

  renderVaultTableView(items, domains) {
    const rowsHtml = items
      .map((item) => {
        const dom = domains.find((d) => d.id === item.domain) || {
          shortName: '未分類',
          color: '#71717a'
        };
        const typeBadge = this.getTypeBadgeHtml(item.type);
        const tagsHtml = (item.tags || [])
          .slice(0, 3)
          .map((t) => `<span class="tag-chip">#${this.escapeHtml(t)}</span>`)
          .join(' ');
        const dateStr = (item.created_at || '').slice(0, 10);

        return `
          <tr onclick="app.openVaultModal('${item.id}')">
            <td style="width: 34px; text-align: center;" onclick="event.stopPropagation(); app.toggleItemStar('${item.id}')">
              <span style="cursor: pointer; font-size: 14px;">${item.is_starred ? '⭐' : '☆'}</span>
            </td>
            <td style="width: 96px;">${typeBadge}</td>
            <td>
              <div style="font-weight: 600; color: var(--text-primary);">${this.escapeHtml(item.title)}</div>
              <div style="font-size: 12px; color: var(--text-secondary); max-width: 520px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${this.escapeHtml(item.content || item.url || item.file_name || '')}
              </div>
            </td>
            <td style="width: 130px;">
              <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px;">
                <span class="domain-dot" style="background-color: ${dom.color};"></span>
                ${this.escapeHtml(dom.shortName || dom.name)}
              </span>
            </td>
            <td style="width: 190px;">${tagsHtml}</td>
            <td style="width: 95px; font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted);">${dateStr}</td>
            <td style="width: 110px; text-align: right;" onclick="event.stopPropagation();">
              ${
                item.type === 'link' && item.url
                  ? `<a href="${this.escapeHtml(item.url)}" target="_blank" class="btn btn-sm" title="開啟連結">↗</a>`
                  : ''
              }
              ${
                item.type === 'file'
                  ? `<button class="btn btn-sm" onclick="app.downloadVaultFile('${item.id}')" title="下載檔案">⬇️</button>`
                  : ''
              }
              <button class="btn btn-ghost btn-sm" onclick="app.deleteVaultItemConfirm('${item.id}')" title="刪除">🗑️</button>
            </td>
          </tr>
        `;
      })
      .join('');

    return `
      <table class="linear-table">
        <thead>
          <tr>
            <th>★</th>
            <th>類型</th>
            <th>標題與內容摘要</th>
            <th>校務領域</th>
            <th>標籤</th>
            <th>建立日期</th>
            <th style="text-align: right;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }

  renderVaultGalleryView(items, domains) {
    const cardsHtml = items
      .map((item) => {
        const dom = domains.find((d) => d.id === item.domain) || {
          shortName: '未分類',
          color: '#71717a'
        };
        const typeBadge = this.getTypeBadgeHtml(item.type);
        const tagsHtml = (item.tags || [])
          .map((t) => `<span class="tag-chip">#${this.escapeHtml(t)}</span>`)
          .join('');

        return `
          <div class="vault-card" onclick="app.openVaultModal('${item.id}')">
            <div>
              <div class="vault-card-header">
                <div style="display: flex; align-items: center; gap: 6px;">
                  ${typeBadge}
                  <span style="font-size: 11.5px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px;">
                    <span class="domain-dot" style="background-color: ${dom.color};"></span>
                    ${this.escapeHtml(dom.shortName || dom.name)}
                  </span>
                </div>
                <span onclick="event.stopPropagation(); app.toggleItemStar('${item.id}')" style="cursor: pointer;">
                  ${item.is_starred ? '⭐' : '☆'}
                </span>
              </div>
              <div class="vault-card-title">${this.escapeHtml(item.title)}</div>
              <div class="vault-card-excerpt" style="margin-top: 6px;">
                ${this.escapeHtml(item.content || item.url || item.file_name || '')}
              </div>
            </div>
            <div>
              <div class="tag-list" style="margin-bottom: 8px;">${tagsHtml}</div>
              <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 8px; font-size: 11.5px; color: var(--text-muted);" onclick="event.stopPropagation();">
                <span>${(item.created_at || '').slice(0, 10)}</span>
                <div style="display: flex; gap: 4px;">
                  ${
                    item.type === 'link' && item.url
                      ? `<a href="${this.escapeHtml(item.url)}" target="_blank" class="btn btn-sm">開啟網頁 ↗</a>`
                      : ''
                  }
                  ${
                    item.type === 'file'
                      ? `<button class="btn btn-sm" onclick="app.downloadVaultFile('${item.id}')">⬇️ 下載 (${this.escapeHtml(item.file_name || '附件')})</button>`
                      : ''
                  }
                  <button class="btn btn-ghost btn-sm" onclick="app.deleteVaultItemConfirm('${item.id}')">🗑️</button>
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    return `<div class="gallery-grid">${cardsHtml}</div>`;
  }

  getTypeBadgeHtml(type) {
    if (type === 'link') return `<span class="type-badge type-link">🔗 網頁連結</span>`;
    if (type === 'file') return `<span class="type-badge type-file">📎 檔案附件</span>`;
    return `<span class="type-badge type-snippet">📝 文字筆記</span>`;
  }

  setTypeFilter(type) {
    this.typeFilter = type;
    this.renderWorkspace();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.renderWorkspace();
  }

  // --------------------------------------------------------------------------
  // 快速收集列動作 (Quick Capture)
  // --------------------------------------------------------------------------
  async handleQuickCaptureSubmit() {
    const input = document.getElementById('quickCaptureText');
    const domainSelect = document.getElementById('quickCaptureDomain');
    const raw = (input.value || '').trim();
    if (!raw) return;

    const isUrl = /^https?:\/\/\S+$/i.test(raw);
    const newItem = {
      id: 'item_' + Date.now(),
      type: isUrl ? 'link' : 'snippet',
      title: isUrl ? `網頁書籤：${raw.slice(0, 48)}` : raw.slice(0, 42) + (raw.length > 42 ? '...' : ''),
      content: isUrl ? '從快速收集列存入之外部網站連結' : raw,
      url: isUrl ? raw : '',
      file_name: '',
      file_size: 0,
      file_type: '',
      file_data: '',
      domain: domainSelect ? domainSelect.value : 'vision',
      tags: ['快速收集'],
      is_starred: false,
      is_inbox: this.currentNav === 'inbox'
    };

    await this.store.upsertVaultItem(newItem);
    input.value = '';
    this.showToast(isUrl ? '🔗 已快速存入網頁連結！' : '📝 已快速存入複製文字！');
    this.renderAll();
  }

  async handleQuickFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const domainSelect = document.getElementById('quickCaptureDomain');

    this.showToast(`⏳ 正在處理檔案：${file.name}...`);
    const uploaded = await this.store.uploadFile(file);

    const newItem = {
      id: 'item_' + Date.now(),
      type: 'file',
      title: file.name,
      content: `檔案大小：${(file.size / 1024).toFixed(1)} KB`,
      url: uploaded.url || '',
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || 'application/octet-stream',
      file_data: uploaded.file_data || '',
      domain: domainSelect ? domainSelect.value : 'vision',
      tags: ['檔案附件'],
      is_starred: false,
      is_inbox: this.currentNav === 'inbox'
    };

    await this.store.upsertVaultItem(newItem);
    event.target.value = '';
    this.showToast(`📎 檔案「${file.name}」已存入資料庫！`);
    this.renderAll();
  }

  async toggleItemStar(id) {
    const items = this.store.getVaultItems();
    const item = items.find((i) => i.id === id);
    if (!item) return;
    item.is_starred = !item.is_starred;
    await this.store.upsertVaultItem(item);
    this.renderAll();
  }

  async deleteVaultItemConfirm(id) {
    if (!confirm('確定要刪除這筆資料嗎？')) return;
    await this.store.deleteVaultItem(id);
    this.showToast('🗑️ 資料已刪除');
    this.renderAll();
  }

  downloadVaultFile(id) {
    const item = this.store.getVaultItems().find((i) => i.id === id);
    if (!item) return;
    const href = item.url || item.file_data;
    if (!href) {
      alert('此檔案尚無可下載的實體內容，請重新上傳檔案或設定雲端連結。');
      return;
    }
    const a = document.createElement('a');
    a.href = href;
    a.download = item.file_name || item.title || 'download';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // --------------------------------------------------------------------------
  // Modal 1: 新增 / 編輯 Vault 資料
  // --------------------------------------------------------------------------
  openVaultModal(itemId = null) {
    const domains = this.store.getDomains();
    const domSelect = document.getElementById('vaultItemDomain');
    domSelect.innerHTML = domains
      .map((d) => `<option value="${d.id}">${this.escapeHtml(d.name)}</option>`)
      .join('');

    this.pendingFileUpload = null;
    document.getElementById('vaultItemFileInput').value = '';
    document.getElementById('vaultFileCurrentInfo').textContent = '';

    if (itemId) {
      const item = this.store.getVaultItems().find((i) => i.id === itemId);
      if (!item) return;
      document.getElementById('vaultModalTitle').textContent = '編輯知識庫資料';
      document.getElementById('vaultItemId').value = item.id;
      this.selectVaultModalType(item.type);
      document.getElementById('vaultItemTitle').value = item.title || '';
      document.getElementById('vaultItemUrl').value = item.url || '';
      document.getElementById('vaultItemContent').value = item.content || '';
      domSelect.value = item.domain || domains[0].id;
      document.getElementById('vaultItemTags').value = (item.tags || []).join(', ');
      document.getElementById('vaultItemStarred').checked = !!item.is_starred;
      document.getElementById('vaultItemInbox').checked = !!item.is_inbox;
      if (item.file_name) {
        document.getElementById('vaultFileCurrentInfo').textContent = `目前已附加檔案：${item.file_name} (${((item.file_size || 0) / 1024).toFixed(1)} KB)`;
      }
    } else {
      document.getElementById('vaultModalTitle').textContent = '新增資料至校長知識庫';
      document.getElementById('vaultItemId').value = '';
      this.selectVaultModalType('snippet');
      document.getElementById('vaultItemTitle').value = '';
      document.getElementById('vaultItemUrl').value = '';
      document.getElementById('vaultItemContent').value = '';
      if (this.currentNav.startsWith('domain:')) {
        domSelect.value = this.currentNav.replace('domain:', '');
      }
      document.getElementById('vaultItemTags').value = '';
      document.getElementById('vaultItemStarred').checked = false;
      document.getElementById('vaultItemInbox').checked = this.currentNav === 'inbox';
    }

    document.getElementById('vaultModal').classList.add('open');
  }

  closeVaultModal() {
    document.getElementById('vaultModal').classList.remove('open');
  }

  selectVaultModalType(type) {
    this.modalCurrentType = type;
    ['snippet', 'link', 'file'].forEach((t) => {
      const btn = document.getElementById(`typeBtn_${t}`);
      if (btn) btn.classList.toggle('btn-primary', t === type);
    });
    document.getElementById('vaultUrlGroup').style.display = type === 'link' ? 'flex' : 'none';
    document.getElementById('vaultFileGroup').style.display = type === 'file' ? 'flex' : 'none';
  }

  handleModalFileSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    this.pendingFileUpload = file;
    const titleInput = document.getElementById('vaultItemTitle');
    if (!titleInput.value.trim()) {
      titleInput.value = file.name;
    }
    document.getElementById('vaultFileCurrentInfo').textContent = `待儲存檔案：${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  }

  async saveVaultModal() {
    const id = document.getElementById('vaultItemId').value || 'item_' + Date.now();
    const existing = this.store.getVaultItems().find((i) => i.id === id) || {};
    const title = document.getElementById('vaultItemTitle').value.trim();
    if (!title) {
      alert('請輸入標題');
      return;
    }

    let url = document.getElementById('vaultItemUrl').value.trim();
    let file_name = existing.file_name || '';
    let file_size = existing.file_size || 0;
    let file_type = existing.file_type || '';
    let file_data = existing.file_data || '';

    if (this.modalCurrentType === 'file' && this.pendingFileUpload) {
      const uploaded = await this.store.uploadFile(this.pendingFileUpload);
      url = uploaded.url || url;
      file_data = uploaded.file_data || '';
      file_name = this.pendingFileUpload.name;
      file_size = this.pendingFileUpload.size;
      file_type = this.pendingFileUpload.type || 'application/octet-stream';
    }

    const tags = document
      .getElementById('vaultItemTags')
      .value.split(/[,，]/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean);

    const item = {
      ...existing,
      id,
      type: this.modalCurrentType,
      title,
      content: document.getElementById('vaultItemContent').value,
      url,
      file_name,
      file_size,
      file_type,
      file_data,
      domain: document.getElementById('vaultItemDomain').value,
      tags,
      is_starred: document.getElementById('vaultItemStarred').checked,
      is_inbox: document.getElementById('vaultItemInbox').checked
    };

    await this.store.upsertVaultItem(item);
    this.closeVaultModal();
    this.showToast('💾 資料已儲存至知識庫');
    this.renderAll();
  }

  // --------------------------------------------------------------------------
  // 第三層：治校政策與策略分頁編輯器 (Strategy Page Workspace)
  // --------------------------------------------------------------------------
  renderStrategyWorkspace(stratId) {
    const strategies = this.store.getStrategies();
    const strategy = strategies.find((s) => s.id === stratId);
    if (!strategy) {
      this.currentNav = 'all';
      this.renderAll();
      return;
    }

    const domains = this.store.getDomains();
    const allVault = this.store.getVaultItems();

    document.getElementById('workspaceTitle').textContent = `🧭 治校策略分頁：${strategy.title}`;
    document.getElementById('workspaceSubtitle').textContent = `${strategy.office || ''} ｜ 狀態：${strategy.status}`;

    const shareBadgeHtml =
      strategy.share_mode === 'public'
        ? `<span class="share-pill public">🌐 完全公開連結</span>`
        : strategy.share_mode === 'passcode'
        ? `<span class="share-pill passcode">🔑 指定分享 (通行碼: ${this.escapeHtml(strategy.passcode || '未設')})</span>`
        : `<span class="share-pill private">🔒 私人隱藏草稿</span>`;

    const domainOptions = domains
      .map(
        (d) =>
          `<option value="${d.id}" ${d.id === strategy.domain ? 'selected' : ''}>${this.escapeHtml(d.name)}</option>`
      )
      .join('');

    const statusOptions = ['構想草稿', '處室共識中', '推動執行中', '已歸檔']
      .map(
        (st) => `<option value="${st}" ${st === strategy.status ? 'selected' : ''}>${st}</option>`
      )
      .join('');

    const blocksHtml = (strategy.blocks || [])
      .map(
        (b, idx) => `
        <div class="strategy-block-card">
          <div class="strategy-block-header">
            <input
              type="text"
              class="form-input"
              style="font-weight: 600; font-size: 14.5px; border-color: transparent; background: transparent; padding: 2px 6px; width: 75%;"
              value="${this.escapeHtml(b.title)}"
              onchange="app.updateStrategyBlock('${strategy.id}', ${idx}, 'title', this.value)"
            />
            <div class="no-print" style="display: flex; gap: 4px;">
              <button class="btn btn-ghost btn-sm" onclick="app.moveStrategyBlock('${strategy.id}', ${idx}, -1)" title="上移">↑</button>
              <button class="btn btn-ghost btn-sm" onclick="app.moveStrategyBlock('${strategy.id}', ${idx}, 1)" title="下移">↓</button>
              <button class="btn btn-ghost btn-sm" onclick="app.removeStrategyBlock('${strategy.id}', ${idx})" title="刪除此區塊">🗑️</button>
            </div>
          </div>
          <textarea
            class="form-textarea"
            style="border-color: var(--border-color); background: var(--bg-app); font-size: 13.5px; min-height: 95px;"
            onchange="app.updateStrategyBlock('${strategy.id}', ${idx}, 'content', this.value)"
          >${this.escapeHtml(b.content || '')}</textarea>
        </div>
      `
      )
      .join('');

    // 已掛載的參考資料素材
    const linkedIds = strategy.linked_items || [];
    const linkedVaultItems = linkedIds
      .map((id) => allVault.find((v) => v.id === id))
      .filter(Boolean);

    const linkedItemsHtml =
      linkedVaultItems.length === 0
        ? `<div style="font-size: 12.5px; color: var(--text-muted); padding: 12px 0;">目前尚未掛載參考資料。您可以從下方下拉選單將平常收集的「文字、連結、檔案」掛載到此策略分頁中。</div>`
        : linkedVaultItems
            .map(
              (item) => `
            <div class="vault-card" style="margin-bottom: 8px; padding: 12px 14px; cursor: default;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  ${this.getTypeBadgeHtml(item.type)}
                  <strong style="font-size: 13.5px;">${this.escapeHtml(item.title)}</strong>
                </div>
                <div style="display: flex; gap: 6px;" class="no-print">
                  ${
                    item.type === 'link' && item.url
                      ? `<a href="${this.escapeHtml(item.url)}" target="_blank" class="btn btn-sm">開啟連結 ↗</a>`
                      : ''
                  }
                  ${
                    item.type === 'file'
                      ? `<button class="btn btn-sm" onclick="app.downloadVaultFile('${item.id}')">⬇️ 下載檔案</button>`
                      : ''
                  }
                  <button class="btn btn-ghost btn-sm" onclick="app.detachVaultItemFromStrategy('${strategy.id}', '${item.id}')">移除掛載 ✕</button>
                </div>
              </div>
              ${
                item.content
                  ? `<div style="font-size: 12.5px; color: var(--text-secondary); white-space: pre-line; margin-top: 4px;">${this.escapeHtml(item.content)}</div>`
                  : ''
              }
            </div>
          `
            )
            .join('');

    // 尚未掛載的可選素材
    const unlinkedVaultItems = allVault.filter((v) => !linkedIds.includes(v.id));
    const attachSelectOptions = unlinkedVaultItems
      .map(
        (v) =>
          `<option value="${v.id}">[${v.type === 'file' ? '檔案' : v.type === 'link' ? '連結' : '文字'}] ${this.escapeHtml(v.title)}</option>`
      )
      .join('');

    const bodyEl = document.getElementById('workspaceBody');
    bodyEl.innerHTML = `
      <div class="strategy-container">
        <!-- 頂部政策控制與標題卡 -->
        <div class="strategy-header-card">
          <div class="strategy-meta-row">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              ${shareBadgeHtml}
              <select class="form-select" style="width: auto; padding: 3px 8px; font-size: 12px;" onchange="app.updateStrategyField('${strategy.id}', 'domain', this.value)">
                ${domainOptions}
              </select>
              <select class="form-select" style="width: auto; padding: 3px 8px; font-size: 12px;" onchange="app.updateStrategyField('${strategy.id}', 'status', this.value)">
                ${statusOptions}
              </select>
              <input
                type="text"
                class="form-input"
                style="width: 190px; padding: 3px 8px; font-size: 12px;"
                value="${this.escapeHtml(strategy.office || '')}"
                placeholder="主責處室（如：教務處）"
                onchange="app.updateStrategyField('${strategy.id}', 'office', this.value)"
              />
            </div>

            <div class="no-print" style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn btn-gemini-red btn-sm" onclick="app.openGeminiFromStrategyPage('${strategy.id}')">
                ✨ 連結 Gemini 討論本策略
              </button>
              <button class="btn btn-blue btn-sm" onclick="app.openShareModal('${strategy.id}')">
                🔗 分享與權限設定
              </button>
              <button class="btn btn-sm" onclick="app.previewSharedPage('${strategy.id}')">
                👁️ 預覽分享畫面
              </button>
              <button class="btn btn-sm" onclick="window.print()">
                🖨️ 列印 / 存為 PDF
              </button>
              <button class="btn btn-ghost btn-sm" onclick="app.deleteStrategyConfirm('${strategy.id}')">
                🗑️
              </button>
            </div>
          </div>

          <input
            type="text"
            class="strategy-title-input"
            value="${this.escapeHtml(strategy.title)}"
            onchange="app.updateStrategyField('${strategy.id}', 'title', this.value)"
          />

          <div class="strategy-summary-box">
            <div style="font-size: 11.5px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">
              🎯 政策核心願景與推動目標摘要 (Executive Summary)
            </div>
            <textarea
              class="form-textarea"
              style="min-height: 60px; border: none; background: transparent; padding: 0; font-size: 13.5px;"
              onchange="app.updateStrategyField('${strategy.id}', 'summary', this.value)"
            >${this.escapeHtml(strategy.summary || '')}</textarea>
          </div>
        </div>

        <!-- 策略方針與執行步驟區塊 -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <h3 style="font-size: 14px; font-weight: 600; color: var(--text-secondary);">📋 政策方針、處室分工與具體策略段落</h3>
          <button class="btn btn-sm no-print" onclick="app.addStrategyBlock('${strategy.id}')">+ 新增策略段落區塊</button>
        </div>

        ${blocksHtml}

        <!-- 掛載的知識庫參考素材與附件下載區 -->
        <div class="linked-resources-box">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
            <div>
              <h3 style="font-size: 14.5px; font-weight: 600;">📎 本策略掛載之參考依據、連結與檔案附件 (${linkedVaultItems.length})</h3>
              <div style="font-size: 12px; color: var(--text-muted);">
                掛載於此處的文字、網址與檔案，在您分享此分頁給主任或老師時將一併提供對方參閱與下載。
              </div>
            </div>
          </div>

          ${linkedItemsHtml}

          <div class="no-print" style="display: flex; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
            <select id="attachVaultSelect" class="form-select" style="flex: 1;">
              <option value="">-- 選擇知識庫中已收集的文字、連結或檔案掛載至本策略頁 --</option>
              ${attachSelectOptions}
            </select>
            <button class="btn btn-primary btn-sm" onclick="app.attachVaultItemToStrategy('${strategy.id}')">
              + 掛載至本策略分頁
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async createNewStrategyPage() {
    const newId = 'strat_' + Date.now();
    const newSlug = 'strategy-' + Date.now().toString().slice(-6);
    const defaultDomain = this.currentNav.startsWith('domain:')
      ? this.currentNav.replace('domain:', '')
      : 'vision';

    const newStrat = {
      id: newId,
      slug: newSlug,
      title: '新治校政策與策略推動方案（點擊修改標題）',
      domain: defaultDomain,
      office: '校長室 / 跨處室協作',
      status: '構想草稿',
      summary: '請在此輸入本項校務政策的核心願景、欲解決的痛點與預期達成的學校改變...',
      blocks: [
        {
          id: 'b_' + Date.now() + '_1',
          title: '一、 核心目標與背景說明（Why）',
          type: 'vision',
          content: '- 核心痛點：\n- 預期目標：'
        },
        {
          id: 'b_' + Date.now() + '_2',
          title: '二、 推動策略與處室分工（What & How）',
          type: 'action',
          content: '1. 教務處：\n2. 學務處：\n3. 總務處：\n4. 輔導室：'
        }
      ],
      linked_items: [],
      share_mode: 'private',
      passcode: ''
    };

    await this.store.upsertStrategy(newStrat);
    this.currentNav = `strategy:${newId}`;
    this.showToast('🧭 已建立新的治校策略分頁！');
    this.renderAll();
  }

  async updateStrategyField(stratId, field, value) {
    const strategies = this.store.getStrategies();
    const strat = strategies.find((s) => s.id === stratId);
    if (!strat) return;
    strat[field] = value;
    await this.store.upsertStrategy(strat);
    this.showToast('✓ 已自動儲存策略變更');
    this.renderAll();
  }

  async addStrategyBlock(stratId) {
    const strategies = this.store.getStrategies();
    const strat = strategies.find((s) => s.id === stratId);
    if (!strat) return;
    strat.blocks = strat.blocks || [];
    strat.blocks.push({
      id: 'b_' + Date.now(),
      title: `${strat.blocks.length + 1}、 新增策略行動段落`,
      type: 'action',
      content: '請輸入具體執行策略、里程碑或處室配合事項...'
    });
    await this.store.upsertStrategy(strat);
    this.renderWorkspace();
  }

  async updateStrategyBlock(stratId, blockIdx, key, value) {
    const strategies = this.store.getStrategies();
    const strat = strategies.find((s) => s.id === stratId);
    if (!strat || !strat.blocks[blockIdx]) return;
    strat.blocks[blockIdx][key] = value;
    await this.store.upsertStrategy(strat);
    this.showToast('✓ 段落已儲存');
  }

  async moveStrategyBlock(stratId, blockIdx, delta) {
    const strategies = this.store.getStrategies();
    const strat = strategies.find((s) => s.id === stratId);
    if (!strat) return;
    const targetIdx = blockIdx + delta;
    if (targetIdx < 0 || targetIdx >= strat.blocks.length) return;
    const temp = strat.blocks[blockIdx];
    strat.blocks[blockIdx] = strat.blocks[targetIdx];
    strat.blocks[targetIdx] = temp;
    await this.store.upsertStrategy(strat);
    this.renderWorkspace();
  }

  async removeStrategyBlock(stratId, blockIdx) {
    const strategies = this.store.getStrategies();
    const strat = strategies.find((s) => s.id === stratId);
    if (!strat) return;
    strat.blocks.splice(blockIdx, 1);
    await this.store.upsertStrategy(strat);
    this.renderWorkspace();
  }

  async attachVaultItemToStrategy(stratId) {
    const selectEl = document.getElementById('attachVaultSelect');
    const itemId = selectEl ? selectEl.value : '';
    if (!itemId) return;

    const strategies = this.store.getStrategies();
    const strat = strategies.find((s) => s.id === stratId);
    if (!strat) return;
    strat.linked_items = strat.linked_items || [];
    if (!strat.linked_items.includes(itemId)) {
      strat.linked_items.push(itemId);
      await this.store.upsertStrategy(strat);
      this.showToast('📎 已將參考資料掛載至本策略頁');
      this.renderWorkspace();
    }
  }

  async detachVaultItemFromStrategy(stratId, itemId) {
    const strategies = this.store.getStrategies();
    const strat = strategies.find((s) => s.id === stratId);
    if (!strat) return;
    strat.linked_items = (strat.linked_items || []).filter((id) => id !== itemId);
    await this.store.upsertStrategy(strat);
    this.renderWorkspace();
  }

  async deleteStrategyConfirm(stratId) {
    if (!confirm('確定要刪除這個治校策略分頁嗎？（掛載的原始素材仍會保留在資料庫中）')) return;
    await this.store.deleteStrategy(stratId);
    this.currentNav = 'all';
    this.showToast('🗑️ 策略分頁已刪除');
    this.renderAll();
  }

  // --------------------------------------------------------------------------
  // Modal 2: 單一策略分頁「分享與權限控管中心」
  // --------------------------------------------------------------------------
  openShareModal(stratId) {
    this.currentShareStratId = stratId;
    const strat = this.store.getStrategies().find((s) => s.id === stratId);
    if (!strat) return;

    const radios = document.getElementsByName('shareModeRadio');
    radios.forEach((r) => {
      r.checked = r.value === (strat.share_mode || 'private');
    });

    document.getElementById('sharePasscodeInput').value = strat.passcode || '';
    this.updateShareModalMode(strat.share_mode || 'private');
    document.getElementById('shareModal').classList.add('open');
  }

  closeShareModal() {
    document.getElementById('shareModal').classList.remove('open');
  }

  updateShareModalMode(mode) {
    this.tempShareMode = mode;
    document.getElementById('sharePasscodeBox').style.display = mode === 'passcode' ? 'flex' : 'none';
    document.getElementById('shareUrlBox').style.display = mode === 'private' ? 'none' : 'flex';
    this.refreshShareUrlPreview();
  }

  refreshShareUrlPreview() {
    const strat = this.store.getStrategies().find((s) => s.id === this.currentShareStratId);
    if (!strat) return;
    const previewStrat = {
      ...strat,
      share_mode: this.tempShareMode || strat.share_mode,
      passcode: document.getElementById('sharePasscodeInput').value.trim()
    };
    const shareUrl = this.store.buildShareUrl(previewStrat);
    document.getElementById('shareGeneratedUrl').value = shareUrl;
  }

  async saveShareModal() {
    const strat = this.store.getStrategies().find((s) => s.id === this.currentShareStratId);
    if (!strat) return;
    strat.share_mode = this.tempShareMode || 'private';
    strat.passcode = document.getElementById('sharePasscodeInput').value.trim();
    if (strat.share_mode === 'passcode' && !strat.passcode) {
      alert('請輸入指定分享的通行碼（例如：2026）');
      return;
    }
    await this.store.upsertStrategy(strat);
    this.closeShareModal();
    this.showToast('🔗 分頁分享權限已更新！');
    this.renderAll();
  }

  copyShareUrl() {
    const urlInput = document.getElementById('shareGeneratedUrl');
    urlInput.select();
    navigator.clipboard.writeText(urlInput.value);
    this.showToast('📋 已複製專屬分享連結！可直接貼給主任或老師');
  }

  previewSharedPage(stratId = null) {
    const targetId = stratId || this.currentShareStratId;
    const strat = this.store.getStrategies().find((s) => s.id === targetId);
    if (!strat) return;
    if (this.tempShareMode && targetId === this.currentShareStratId) {
      strat.share_mode = this.tempShareMode;
      strat.passcode = document.getElementById('sharePasscodeInput').value.trim();
      this.store.upsertStrategy(strat);
    }
    const shareUrl = this.store.buildShareUrl(strat);
    window.open(shareUrl, '_blank');
  }

  // --------------------------------------------------------------------------
  // 獨立「單頁分享檢視模式 (?share=...)」——主任/教師/外賓看到的畫面
  // --------------------------------------------------------------------------
  async renderStandaloneShareMode() {
    document.getElementById('appRoot').style.display = 'none';
    const root = document.getElementById('shareStandaloneRoot');
    root.style.display = 'block';

    const result = await this.store.fetchSharedStrategyFromUrl();
    if (!result || result.notFound || !result.strategy) {
      root.innerHTML = `
        <div class="share-standalone-wrapper">
          <div class="passcode-gate-card">
            <div style="font-size: 32px; margin-bottom: 10px;">⚠️</div>
            <h2 style="font-size: 18px; margin-bottom: 8px;">找不到此策略分頁或連結已失效</h2>
            <p style="font-size: 13px; color: var(--text-secondary);">請向校長確認最新的分頁分享連結。</p>
          </div>
        </div>
      `;
      return;
    }

    const { strategy, linkedVault, schoolName, principalName } = result;

    // 1. 若為私人模式 (private)
    if (strategy.share_mode === 'private') {
      root.innerHTML = `
        <div class="share-standalone-wrapper">
          <div class="passcode-gate-card">
            <div style="font-size: 32px; margin-bottom: 10px;">🔒</div>
            <h2 style="font-size: 18px; margin-bottom: 8px;">此分頁目前設定為「校長私人隱藏」</h2>
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 18px;">
              尚未開放外部閱覽權限。若您是校長本人，請返回主工作台變更分享設定。
            </p>
            <a href="${window.location.pathname}" class="btn btn-primary">返回校長工作台</a>
          </div>
        </div>
      `;
      return;
    }

    // 2. 若為「指定分享 + 通行碼保護 (passcode)」且尚未解鎖
    if (
      strategy.share_mode === 'passcode' &&
      strategy.passcode &&
      !this.unlockedShareSlugs.has(strategy.slug || strategy.id)
    ) {
      root.innerHTML = `
        <div class="share-standalone-wrapper">
          <div class="passcode-gate-card">
            <div style="width: 44px; height: 44px; border-radius: 10px; background: var(--accent); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 14px;">
              🔑
            </div>
            <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">
              ${this.escapeHtml(schoolName)} ｜ ${this.escapeHtml(principalName)}
            </div>
            <h2 style="font-size: 17px; font-weight: 700; margin-bottom: 8px;">
              ${this.escapeHtml(strategy.title)}
            </h2>
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 18px;">
              本治校策略分頁受通行碼保護，請輸入校長提供之授權通行碼以開啟內容：
            </p>
            <div style="display: flex; gap: 8px;">
              <input
                type="password"
                id="visitorPasscodeInput"
                class="form-input"
                placeholder="請輸入通行碼..."
                style="text-align: center; font-size: 15px; letter-spacing: 2px;"
                onkeydown="if(event.key==='Enter') app.verifyVisitorPasscode('${this.escapeHtml(strategy.passcode)}', '${this.escapeHtml(strategy.slug || strategy.id)}')"
              />
              <button
                class="btn btn-primary"
                onclick="app.verifyVisitorPasscode('${this.escapeHtml(strategy.passcode)}', '${this.escapeHtml(strategy.slug || strategy.id)}')"
              >
                驗證開啟
              </button>
            </div>
            <div id="passcodeErrorMsg" style="color: #dc2626; font-size: 12px; margin-top: 10px; display: none;">
              ❌ 通行碼不正確，請重新輸入。
            </div>
          </div>
        </div>
      `;
      return;
    }

    // 3. 驗證通過或公開模式：渲染專業一頁式政策藍圖報告
    const blocksHtml = (strategy.blocks || [])
      .map(
        (b) => `
        <div class="strategy-block-card" style="margin-bottom: 16px;">
          <div class="strategy-block-title" style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border-color);">
            ${this.escapeHtml(b.title)}
          </div>
          <div class="strategy-block-content">${this.escapeHtml(b.content)}</div>
        </div>
      `
      )
      .join('');

    const resourcesHtml =
      (linkedVault || []).length === 0
        ? ''
        : `
        <div class="linked-resources-box" style="margin-top: 28px;">
          <h3 style="font-size: 15px; font-weight: 700; margin-bottom: 12px;">
            📎 相關參考資料、外部連結與附件下載 (${linkedVault.length})
          </h3>
          ${linkedVault
            .map(
              (item) => `
              <div class="vault-card" style="margin-bottom: 10px; cursor: default;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    ${this.getTypeBadgeHtml(item.type)}
                    <strong style="font-size: 14px;">${this.escapeHtml(item.title)}</strong>
                  </div>
                  <div>
                    ${
                      item.type === 'link' && item.url
                        ? `<a href="${this.escapeHtml(item.url)}" target="_blank" class="btn btn-blue btn-sm">前往連結 ↗</a>`
                        : ''
                    }
                    ${
                      item.type === 'file' && (item.url || item.file_data)
                        ? `<a href="${item.url || item.file_data}" download="${this.escapeHtml(item.file_name || item.title)}" target="_blank" class="btn btn-primary btn-sm">⬇️ 下載檔案</a>`
                        : ''
                    }
                  </div>
                </div>
                ${
                  item.content
                    ? `<div style="font-size: 13px; color: var(--text-secondary); white-space: pre-line; margin-top: 6px;">${this.escapeHtml(item.content)}</div>`
                    : ''
                }
              </div>
            `
            )
            .join('')}
        </div>
      `;

    root.innerHTML = `
      <div class="share-standalone-wrapper">
        <div style="max-width: 860px; margin: 0 auto 14px; display: flex; align-items: center; justify-content: space-between;" class="no-print">
          <div style="font-size: 12.5px; color: var(--text-secondary);">
            🏫 <strong>${this.escapeHtml(schoolName)}</strong> ｜ ${this.escapeHtml(principalName)} 治校策略專頁分享
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm" onclick="window.print()">🖨️ 列印 / 儲存 PDF 講義</button>
            <a href="${window.location.pathname}" class="btn btn-ghost btn-sm">校長登入 ➔</a>
          </div>
        </div>

        <article class="share-paper">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
            <span class="share-pill ${strategy.share_mode}">
              ${strategy.share_mode === 'public' ? '🌐 公開校務方針' : '🔑 授權共識專頁'}
            </span>
            <span class="tag-chip" style="font-size: 12px; padding: 3px 8px;">主責／協作：${this.escapeHtml(strategy.office || '跨處室')}</span>
            <span class="tag-chip" style="font-size: 12px; padding: 3px 8px;">階段：${this.escapeHtml(strategy.status || '推動中')}</span>
            <span style="font-size: 12px; color: var(--text-muted); margin-left: auto;">
              更新日期：${(strategy.updated_at || '').slice(0, 10)}
            </span>
          </div>

          <h1 style="font-size: 26px; font-weight: 700; line-height: 1.35; margin-bottom: 16px;">
            ${this.escapeHtml(strategy.title)}
          </h1>

          <div class="strategy-summary-box" style="margin-bottom: 24px;">
            <div style="font-size: 11.5px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">
              🎯 政策核心願景與推動目標 (Vision & Goal)
            </div>
            <div style="font-size: 14.5px; color: var(--text-primary); white-space: pre-line;">
              ${this.escapeHtml(strategy.summary || '')}
            </div>
          </div>

          ${blocksHtml}
          ${resourcesHtml}

          <footer style="margin-top: 36px; padding-top: 16px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted);">
            <span>${this.escapeHtml(principalName)} 治校政策與策略系統 (KennyDatabase)</span>
            <span>文件代碼：${this.escapeHtml(strategy.slug || strategy.id)}</span>
          </footer>
        </article>
      </div>
    `;
  }

  verifyVisitorPasscode(expected, slug) {
    const input = document.getElementById('visitorPasscodeInput');
    const val = (input.value || '').trim();
    if (val === expected) {
      this.unlockedShareSlugs.add(slug);
      this.renderStandaloneShareMode();
    } else {
      document.getElementById('passcodeErrorMsg').style.display = 'block';
    }
  }

  // --------------------------------------------------------------------------
  // Modal 3: 雲端資料庫 (Supabase) 與系統設定
  // --------------------------------------------------------------------------
  openCloudSettingsModal() {
    const cfg = this.store.config;
    document.getElementById('cfgPrincipalName').value = cfg.principalName || '';
    document.getElementById('cfgSchoolName').value = cfg.schoolName || '';
    document.getElementById('cfgPrincipalPin').value = cfg.principalPin || 'cany1234';
    document.getElementById('cfgSupabaseUrl').value = cfg.supabaseUrl || '';
    document.getElementById('cfgSupabaseKey').value = cfg.supabaseAnonKey || '';
    document.getElementById('cloudModal').classList.add('open');
  }

  closeCloudSettingsModal() {
    document.getElementById('cloudModal').classList.remove('open');
  }

  saveBasicConfig() {
    this.store.saveConfig({
      principalName: document.getElementById('cfgPrincipalName').value.trim() || 'Kenny 校長知識庫',
      schoolName: document.getElementById('cfgSchoolName').value.trim() || '治校政策與策略決策中心',
      principalPin: document.getElementById('cfgPrincipalPin').value.trim() || 'cany1234',
      supabaseUrl: document.getElementById('cfgSupabaseUrl').value.trim(),
      supabaseAnonKey: document.getElementById('cfgSupabaseKey').value.trim()
    });
    this.refreshHeaderAndCloudBadge();
    this.closeCloudSettingsModal();
    this.showToast('⚙️ 設定已儲存');
  }

  async saveCloudConfigAndSync(direction) {
    this.store.saveConfig({
      principalName: document.getElementById('cfgPrincipalName').value.trim() || 'Kenny 校長知識庫',
      schoolName: document.getElementById('cfgSchoolName').value.trim() || '治校政策與策略決策中心',
      principalPin: document.getElementById('cfgPrincipalPin').value.trim() || 'cany1234',
      supabaseUrl: document.getElementById('cfgSupabaseUrl').value.trim(),
      supabaseAnonKey: document.getElementById('cfgSupabaseKey').value.trim()
    });
    this.refreshHeaderAndCloudBadge();

    if (!this.store.isCloudConnected) {
      alert('請先輸入有效的 Supabase Project URL (https://...) 與 Anon Key！');
      return;
    }

    try {
      if (direction === 'push') {
        const res = await this.store.pushAllLocalToCloud();
        this.showToast(`☁️ 已成功將 ${res.vaultCount} 筆資料與 ${res.strategyCount} 個策略頁上傳至 Supabase！`);
      } else {
        const res = await this.store.syncFromCloud();
        this.showToast(`☁️ 已從雲端同步 ${res.vaultCount} 筆資料與 ${res.strategyCount} 個策略頁！`);
      }
      this.renderAll();
    } catch (err) {
      alert(
        '雲端同步發生錯誤：' +
          (err.message || JSON.stringify(err)) +
          '\n\n請確認您是否已在 Supabase 的 SQL Editor 執行初始化 SQL 腳本（可點擊下方「複製 Supabase 資料表初始化 SQL」按鈕）。'
      );
    }
  }

  copySupabaseSql() {
    const sql = `-- KennyDatabase Supabase 初始化腳本
CREATE TABLE IF NOT EXISTS public.vault_items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    url TEXT DEFAULT '',
    file_name TEXT DEFAULT '',
    file_size BIGINT DEFAULT 0,
    file_type TEXT DEFAULT '',
    file_data TEXT DEFAULT '',
    domain TEXT NOT NULL DEFAULT 'inbox',
    tags JSONB DEFAULT '[]'::jsonb,
    is_starred BOOLEAN DEFAULT false,
    is_inbox BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.strategy_pages (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'vision',
    office TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT '構想草稿',
    summary TEXT DEFAULT '',
    blocks JSONB DEFAULT '[]'::jsonb,
    linked_items JSONB DEFAULT '[]'::jsonb,
    share_mode TEXT NOT NULL DEFAULT 'private',
    passcode TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access vault_items" ON public.vault_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access strategy_pages" ON public.strategy_pages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);
INSERT INTO storage.buckets (id, name, public) VALUES ('kenny-vault-files', 'kenny-vault-files', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Public Access kenny-vault-files" ON storage.objects FOR ALL USING (bucket_id = 'kenny-vault-files') WITH CHECK (bucket_id = 'kenny-vault-files');`;

    navigator.clipboard.writeText(sql);
    this.showToast('📜 已複製 SQL 腳本！請貼至 Supabase -> SQL Editor 並點擊 Run');
  }

  // --------------------------------------------------------------------------
  // Modal 4: 校務核心領域管理 (Domain Manager)
  // --------------------------------------------------------------------------
  openDomainManagerModal() {
    this.editingDomains = JSON.parse(JSON.stringify(this.store.getDomains()));
    this.renderDomainManagerRows();
    document.getElementById('domainModal').classList.add('open');
  }

  closeDomainManagerModal() {
    document.getElementById('domainModal').classList.remove('open');
  }

  renderDomainManagerRows() {
    const listEl = document.getElementById('domainManagerList');
    listEl.innerHTML = this.editingDomains
      .map(
        (d, idx) => `
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="color" value="${d.color || '#2563eb'}" onchange="app.editingDomains[${idx}].color = this.value" style="width: 32px; height: 32px; border: none; background: none; cursor: pointer;" />
          <input type="text" class="form-input" value="${this.escapeHtml(d.name)}" placeholder="領域名稱" onchange="app.editingDomains[${idx}].name = this.value; app.editingDomains[${idx}].shortName = this.value.slice(0,4);" style="flex: 2;" />
          <input type="text" class="form-input" value="${this.escapeHtml(d.office || '')}" placeholder="對應處室" onchange="app.editingDomains[${idx}].office = this.value" style="flex: 1;" />
          <button class="btn btn-ghost btn-sm" onclick="app.removeDomainRow(${idx})">🗑️</button>
        </div>
      `
      )
      .join('');
  }

  addDomainRow() {
    this.editingDomains.push({
      id: 'dom_' + Date.now(),
      name: '新校務專案領域',
      shortName: '新領域',
      office: '跨處室',
      color: '#0284c7',
      description: '自訂校務領域'
    });
    this.renderDomainManagerRows();
  }

  removeDomainRow(idx) {
    if (this.editingDomains.length <= 1) {
      alert('至少需保留一個校務領域分類');
      return;
    }
    this.editingDomains.splice(idx, 1);
    this.renderDomainManagerRows();
  }

  async saveDomainManager() {
    await this.store.saveDomains(this.editingDomains);
    this.closeDomainManagerModal();
    this.showToast('🏛️ 校務領域分類已更新');
    this.renderAll();
  }

  // --------------------------------------------------------------------------
  // 完整 JSON 備份匯出與匯入
  // --------------------------------------------------------------------------
  exportBackup() {
    const json = this.store.exportFullBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `KennyDatabase_校長知識庫備份_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast('⬇️ 已匯出完整知識庫 JSON 備份檔');
  }

  importBackup(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const res = this.store.importFullBackupJson(e.target.result);
        this.refreshHeaderAndCloudBadge();
        this.renderAll();
        this.showToast(`⬆️ 成功還原 ${res.vaultCount} 筆資料與 ${res.strategyCount} 個策略分頁！`);
      } catch (err) {
        alert('備份檔格式不正確：' + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  // --------------------------------------------------------------------------
  // Modal 5: 連結 Gemini 新對話 — 勾選本頁資料與討論中心
  // --------------------------------------------------------------------------

  // 1) 從「新增 / 編輯單筆資料視窗 (Modal 1)」啟動 Gemini 勾選
  openGeminiFromVaultModal() {
    const id = document.getElementById('vaultItemId').value;
    const existing = id ? this.store.getVaultItems().find((i) => i.id === id) || {} : {};
    const title = document.getElementById('vaultItemTitle').value.trim() || existing.title || '未命名資料';
    const content = document.getElementById('vaultItemContent').value.trim();
    const url = document.getElementById('vaultItemUrl').value.trim();
    const domainId = document.getElementById('vaultItemDomain').value;
    const domainObj = this.store.getDomains().find((d) => d.id === domainId);
    const domainName = domainObj ? domainObj.name : '校務資料';
    const tags = document.getElementById('vaultItemTags').value.trim();
    const fileName = this.pendingFileUpload
      ? this.pendingFileUpload.name
      : existing.file_name || '';

    const entries = [
      {
        id: 'vm_title',
        badge: '📌 標題與分類',
        label: `標題：${title}（領域：${domainName}${tags ? `｜標籤：${tags}` : ''}）`,
        text: `【資料標題】：${title}\n【所屬校務領域】：${domainName}${tags ? `\n【相關標籤】：${tags}` : ''}`,
        checked: true
      }
    ];

    if (content) {
      entries.push({
        id: 'vm_content',
        badge: '📝 內容摘錄',
        label: `內容摘錄／複製文字：${content.slice(0, 65)}${content.length > 65 ? '...' : ''}`,
        text: `【內容摘錄／校長筆記】：\n${content}`,
        checked: true
      });
    }

    if (url) {
      entries.push({
        id: 'vm_url',
        badge: '🔗 網頁連結',
        label: `網頁連結／書籤：${url}`,
        text: `【參考網頁連結】：${url}`,
        checked: true
      });
    }

    if (fileName || existing.type === 'file' || this.modalCurrentType === 'file') {
      const fileDecoded = this.extractDecodedFileText(existing);
      entries.push({
        id: 'vm_file',
        badge: '📎 檔案附件',
        label: `上傳檔案附件：${fileName || title}`,
        text: `【附加檔案資訊】：${fileName || title}${fileDecoded ? `\n【檔案文字內容摘錄】：\n${fileDecoded}` : ''}`,
        checked: true,
        vaultFileId: existing.id || null
      });
    }

    this.openGeminiModal(`單筆資料：${title}`, entries);
  }

  // 2) 從「目前資料庫分類列表頁 (收件匣 / 全部資料庫 / 校務六大領域)」啟動 Gemini 勾選
  openGeminiFromCurrentVaultView() {
    const items = this.currentFilteredVaultItems || this.store.getVaultItems();
    const pageTitle = this.currentVaultPageTitle || '知識庫分頁資料';

    if (items.length === 0) {
      alert('目前此分頁沒有可勾選的資料，請先新增資料或切換至其他分類。');
      return;
    }

    const entries = items.map((item) => this.buildGeminiEntryFromVaultItem(item, true));
    this.openGeminiModal(pageTitle, entries);
  }

  // 3) 從「治校政策與策略分頁編輯器」啟動 Gemini 勾選
  openGeminiFromStrategyPage(stratId) {
    const strat = this.store.getStrategies().find((s) => s.id === stratId);
    if (!strat) return;
    const allVault = this.store.getVaultItems();

    const entries = [
      {
        id: `strat_head_${strat.id}`,
        badge: '📌 分頁標題與願景',
        label: `策略標題：${strat.title}（主責：${strat.office || '跨處室'}｜階段：${strat.status}）`,
        text: `【治校策略分頁標題】：${strat.title}\n【主責／協作處室】：${strat.office || '跨處室'}\n【目前推動階段】：${strat.status}\n【核心願景與目標摘要】：\n${strat.summary || ''}`,
        checked: true
      }
    ];

    // 加入每一個策略行動段落
    (strat.blocks || []).forEach((b, idx) => {
      entries.push({
        id: `strat_block_${idx}`,
        badge: '📋 策略段落',
        label: `${b.title}：${(b.content || '').slice(0, 50)}...`,
        text: `### ${b.title}\n${b.content || ''}`,
        checked: true
      });
    });

    // 加入該策略分頁已掛載的複製文字、網頁連結、檔案附件
    const linkedIds = strat.linked_items || [];
    linkedIds.forEach((id) => {
      const item = allVault.find((v) => v.id === id);
      if (item) {
        entries.push(this.buildGeminiEntryFromVaultItem(item, true));
      }
    });

    this.openGeminiModal(`治校策略分頁：${strat.title}`, entries);
  }

  buildGeminiEntryFromVaultItem(item, defaultChecked = true) {
    const badge =
      item.type === 'link'
        ? '🔗 網頁連結'
        : item.type === 'file'
        ? '📎 檔案附件'
        : '📝 複製文字';

    const lines = [`#### [${badge}] ${item.title}`];
    if (item.url) lines.push(`- 網頁連結 URL：${item.url}`);
    if (item.file_name) lines.push(`- 檔案附件名稱：${item.file_name}`);
    if (item.content) lines.push(`- 內容摘錄：\n${item.content}`);
    if (item.type === 'file') {
      const fileDecoded = this.extractDecodedFileText(item);
      if (fileDecoded) {
        lines.push(`- 檔案內文全文摘錄：\n${fileDecoded}`);
      }
    }
    if (Array.isArray(item.tags) && item.tags.length > 0) {
      lines.push(`- 標籤：#${item.tags.join(' #')}`);
    }

    return {
      id: `vault_${item.id}`,
      badge,
      label: `${item.title}${item.url ? ` (${item.url.slice(0, 38)}...)` : item.file_name ? ` [檔案: ${item.file_name}]` : ''}`,
      sublabel: item.content ? item.content.slice(0, 75) + (item.content.length > 75 ? '...' : '') : '',
      text: lines.join('\n'),
      checked: defaultChecked,
      vaultFileId: item.type === 'file' ? item.id : null
    };
  }

  extractDecodedFileText(item) {
    if (!item || !item.file_data) return '';
    try {
      if (item.file_data.startsWith('data:text/')) {
        const commaIdx = item.file_data.indexOf(',');
        if (commaIdx > 0) {
          const meta = item.file_data.slice(0, commaIdx);
          const rawData = item.file_data.slice(commaIdx + 1);
          if (meta.includes(';base64')) {
            return decodeURIComponent(escape(atob(rawData)));
          }
          return decodeURIComponent(rawData);
        }
      }
    } catch (e) {
      console.warn('解析文字檔案內容略過', e);
    }
    return '';
  }

  openGeminiModal(pageTitle, entries) {
    this.geminiPageTitle = pageTitle;
    this.geminiEntries = entries;
    document.getElementById('geminiModalHeaderTitle').textContent = `連結 Gemini 新對話 — ${pageTitle}`;
    this.renderGeminiCheckList();
    this.rebuildGeminiPromptPreview();
    document.getElementById('geminiModal').classList.add('open');
  }

  closeGeminiModal() {
    document.getElementById('geminiModal').classList.remove('open');
  }

  renderGeminiCheckList() {
    const listEl = document.getElementById('geminiCheckList');
    listEl.innerHTML = (this.geminiEntries || [])
      .map(
        (entry, idx) => `
        <label class="gemini-check-item">
          <input
            type="checkbox"
            ${entry.checked ? 'checked' : ''}
            onchange="app.onGeminiCheckChange(${idx}, this.checked)"
          />
          <div style="flex: 1; overflow: hidden;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span class="tag-chip" style="font-weight: 600; color: #b91c1c; background: #fef2f2;">${this.escapeHtml(entry.badge)}</span>
              <span style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${this.escapeHtml(entry.label)}</span>
            </div>
            ${
              entry.sublabel
                ? `<div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${this.escapeHtml(entry.sublabel)}</div>`
                : ''
            }
          </div>
        </label>
      `
      )
      .join('');
  }

  onGeminiCheckChange(idx, isChecked) {
    if (this.geminiEntries && this.geminiEntries[idx]) {
      this.geminiEntries[idx].checked = isChecked;
      this.rebuildGeminiPromptPreview();
    }
  }

  toggleAllGeminiChecks(checked) {
    (this.geminiEntries || []).forEach((e) => {
      e.checked = checked;
    });
    this.renderGeminiCheckList();
    this.rebuildGeminiPromptPreview();
  }

  rebuildGeminiPromptPreview() {
    const checkedEntries = (this.geminiEntries || []).filter((e) => e.checked);
    const hasFileChecked = checkedEntries.some((e) => !!e.vaultFileId);
    const fileBar = document.getElementById('geminiFileAttachmentBar');
    if (fileBar) {
      fileBar.style.display = hasFileChecked ? 'flex' : 'none';
    }

    const roleMode = document.getElementById('geminiPromptRoleSelect').value;
    let roleHeader = '';
    let roleFooter = '';

    if (roleMode === 'policy') {
      roleHeader = `你好 Gemini！我是一位國民小學校長。以下是我從個人知識庫（${this.geminiPageTitle}）中精選整理的資料（包含標題、內容摘錄、參考網頁連結與檔案附件資訊）：\n\n`;
      roleFooter = `\n\n---\n【請協助我進行討論與規劃】：\n請根據以上我勾選的資料，幫我系統化提煉出「身為國小校長要帶領學校推動的具體政策與策略方向」（包含：1. 核心願景與痛點分析、2. 短中長期推動策略、3. 各處室與教師團隊的引導作法），並與我展開深度討論。`;
    } else if (roleMode === 'office') {
      roleHeader = `你好 Gemini！我是一位國民小學校長。以下是我整理的校務資料（來源：${this.geminiPageTitle}）：\n\n`;
      roleFooter = `\n\n---\n【請協助我進行處室分工規劃】：\n請根據以上資料，幫我轉化為國小「教務處、學務處、總務處、輔導室」四處室的協作分工表、學期重要里程碑與具體檢核指標。`;
    } else if (roleMode === 'speech') {
      roleHeader = `你好 Gemini！我是一位國民小學校長。以下是我準備推動的校務重點與參考素材（來源：${this.geminiPageTitle}）：\n\n`;
      roleFooter = `\n\n---\n【請協助我撰寫宣講致詞】：\n請根據以上資料，為我草擬一篇對全校教師晨會（或行政主管會報）約 3 分鐘、兼具教育溫度、同理心與清楚方向感的校長談話稿。`;
    } else if (roleMode === 'review') {
      roleHeader = `你好 Gemini！請擔任資深教育政策與校務經營顧問。以下是我身為國小校長目前規劃的資料與策略（來源：${this.geminiPageTitle}）：\n\n`;
      roleFooter = `\n\n---\n【請協助我進行策略盲點健檢】：\n請審視以上內容，指出在國小現場推動時可能遇到的潛在風險、老師或家長可能的疑慮，並提供具體的減壓與配套建議。`;
    } else {
      roleHeader = `【校長知識庫匯出資料：${this.geminiPageTitle}】\n\n`;
      roleFooter = `\n\n---\n請先閱讀以上我整理的資料，接下來我將針對這些內容與你進行討論。`;
    }

    const bodyText =
      checkedEntries.length === 0
        ? '（尚未勾選任何資料項目，請於上方勾選）'
        : checkedEntries.map((e) => e.text).join('\n\n---\n\n');

    document.getElementById('geminiPromptPreview').value = `${roleHeader}${bodyText}${roleFooter}`;
  }

  downloadCheckedGeminiFiles() {
    const checkedFileIds = (this.geminiEntries || [])
      .filter((e) => e.checked && e.vaultFileId)
      .map((e) => e.vaultFileId);
    if (checkedFileIds.length === 0) return;
    checkedFileIds.forEach((id) => this.downloadVaultFile(id));
    this.showToast(`📎 已觸發下載 ${checkedFileIds.length} 個附件檔，可拖曳至 Gemini 對話框上傳！`);
  }

  copyGeminiPromptOnly() {
    const promptText = document.getElementById('geminiPromptPreview').value;
    navigator.clipboard.writeText(promptText);
    this.showToast('📋 已將勾選的討論內容複製到剪貼簿！');
  }

  async launchGeminiWithPrompt() {
    const promptText = document.getElementById('geminiPromptPreview').value.trim();
    if (!promptText) {
      alert('請至少勾選一項要討論的資料內容！');
      return;
    }

    // 1. 先將完整無截斷的內容複製到剪貼簿
    try {
      await navigator.clipboard.writeText(promptText);
    } catch (e) {
      const textarea = document.getElementById('geminiPromptPreview');
      textarea.select();
      document.execCommand('copy');
    }

    // 2. 開啟 Gemini 新對話視窗（同時帶入 URL 參數與剪貼簿雙重保障）
    const encodedPrompt = encodeURIComponent(promptText.slice(0, 1800));
    const geminiUrl = `https://gemini.google.com/app?q=${encodedPrompt}`;
    window.open(geminiUrl, '_blank');

    this.closeGeminiModal();
    this.showToast('🚀 已複製勾選內容並開啟 Gemini 新對話！在 Gemini 按 Ctrl+V 貼上即可立即討論');
  }
  showToast(message) {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast-msg';
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3200);
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

window.app = new KennyApp();
window.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
