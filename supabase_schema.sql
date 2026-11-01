-- ============================================================================
-- KennyDatabase 國小校長個人知識庫與治校策略系統 - Supabase 雲端資料表與權限設定腳本
-- 使用方式：登入 https://supabase.com -> 進入您的專案 -> 左側 SQL Editor -> 貼上本腳本並點擊 Run
-- ============================================================================

-- 1. 建立「資料素材表 (vault_items)」：儲存複製文字、網頁連結、上傳檔案資訊
CREATE TABLE IF NOT EXISTS public.vault_items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('snippet', 'link', 'file')),
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    url TEXT DEFAULT '',
    file_name TEXT DEFAULT '',
    file_size BIGINT DEFAULT 0,
    file_type TEXT DEFAULT '',
    file_data TEXT DEFAULT '', -- 小型檔案或離線備援 Base64 / Storage Path
    domain TEXT NOT NULL DEFAULT 'inbox',
    tags JSONB DEFAULT '[]'::jsonb,
    is_starred BOOLEAN DEFAULT false,
    is_inbox BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 建立「治校政策與策略分頁表 (strategy_pages)」：儲存校長政策藍圖與分享權限
CREATE TABLE IF NOT EXISTS public.strategy_pages (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'vision',
    office TEXT DEFAULT '校長室 / 跨處室',
    status TEXT NOT NULL DEFAULT '構想草稿',
    summary TEXT DEFAULT '',
    blocks JSONB DEFAULT '[]'::jsonb,
    linked_items JSONB DEFAULT '[]'::jsonb,
    share_mode TEXT NOT NULL DEFAULT 'private' CHECK (share_mode IN ('private', 'passcode', 'public')),
    passcode TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 建立「系統設定與自訂校務領域表 (app_settings)」
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 啟用 Row Level Security (RLS) 並設定存取策略
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 允許透過 API Key 進行讀寫（可搭配前端校長通行碼與 Supabase Auth 雙重保護）
DROP POLICY IF EXISTS "Allow full access with anon key on vault_items" ON public.vault_items;
CREATE POLICY "Allow full access with anon key on vault_items"
    ON public.vault_items FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access with anon key on strategy_pages" ON public.strategy_pages;
CREATE POLICY "Allow full access with anon key on strategy_pages"
    ON public.strategy_pages FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access with anon key on app_settings" ON public.app_settings;
CREATE POLICY "Allow full access with anon key on app_settings"
    ON public.app_settings FOR ALL
    USING (true)
    WITH CHECK (true);

-- 5. 建立雲端檔案儲存區 (Storage Bucket: kenny-vault-files)
INSERT INTO storage.buckets (id, name, public)
VALUES ('kenny-vault-files', 'kenny-vault-files', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access to kenny-vault-files" ON storage.objects;
CREATE POLICY "Public Access to kenny-vault-files"
    ON storage.objects FOR ALL
    USING (bucket_id = 'kenny-vault-files')
    WITH CHECK (bucket_id = 'kenny-vault-files');
