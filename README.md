# KennyDatabase | 國小校長個人知識庫與治校策略系統

這是一套專為**國小校長**量身打造的**「個人知識庫 × 治校政策藍圖 × 單頁權限分享系統」**，採用 **Notion / Linear 現代極簡科技風**設計，支援直接託管於 **GitHub Pages**，並可搭配免費的 **Supabase 雲端資料庫与檔案櫃** 實現跨手機、平板、電腦同步。

---

## 一、 系統檔案結構

- [index.html](file:///g:/我的雲端硬碟/KennyDatabase/index.html)：系統主介面（直接雙擊即可在瀏覽器開啟使用，無須複雜編譯步驟）。
- [styles.css](file:///g:/我的雲端硬碟/KennyDatabase/styles.css)：Notion / Linear 極簡科技風樣式表（含手機響應式與 A4 政策簡報列印樣式）。
- [data.js](file:///g:/我的雲端硬碟/KennyDatabase/data.js)：預設之國小校務六大核心領域、範例資料與 3 份治校策略範本。
- [supabase-client.js](file:///g:/我的雲端硬碟/KennyDatabase/supabase-client.js)：本地與 Supabase 雲端雙引擎資料管理與單頁加密分享產生器。
- [app.js](file:///g:/我的雲端硬碟/KennyDatabase/app.js)：核心互動邏輯（快速收集、表格/卡片檢視、策略分頁編輯器、通行碼驗證獨立視角）。
- [supabase_schema.sql](file:///g:/我的雲端硬碟/KennyDatabase/supabase_schema.sql)：Supabase 雲端資料庫一鍵初始化 SQL 腳本。
- [deploy-github.bat](file:///g:/我的雲端硬碟/KennyDatabase/deploy-github.bat)：Windows 一鍵推送更新至 GitHub 工具。

---

## 二、 如何立即開始使用？

### 方式 1：現在直接打開使用（本機免設定）
直接用 Chrome 或 Edge 瀏覽器打開資料夾中的 **`index.html`**，即可立即：
1. 在頂部 **⚡ 快速收集列** 貼上複製的文字、網頁連結，或上傳檔案。
2. 在左側 **第二層：校務領域分類** 瀏覽或管理國小六大處室核心領域。
3. 在左側 **第三層：治校政策與策略分頁** 撰寫策略方針，並將收集的資料掛載到策略分頁下方。
4. 點擊策略分頁右上角的 **「🔗 分享與權限設定」**，切換 **🔒 私人**、**🔑 通行碼保護** 或 **🌐 公開連結**，並點擊「👁️ 預覽對方看到的獨立畫面」體驗主任/老師點開連結時的通行碼驗證與一頁式報告介面！

---

## 三、 如何部署到 GitHub Pages 並開啟雲端同步？

### 步驟 A：將網頁放到 GitHub Pages
1. 登入您的 [GitHub](https://github.com/)，右上角點擊 **`+` -> `New repository`**，名稱輸入 `KennyDatabase`，點擊 **Create repository**。
2. 雙擊本資料夾中的 **[deploy-github.bat](file:///g:/我的雲端硬碟/KennyDatabase/deploy-github.bat)**（或將資料夾內的檔案直接上傳至 GitHub 儲存庫）。
3. 在 GitHub 儲存庫上方點擊 **`Settings` -> 左側 `Pages`**，在 `Branch` 選擇 **`main`** 並點擊 **Save**。
4. 約 1 分鐘後，您的個人網站就會正式上線於：`https://您的帳號.github.io/KennyDatabase/`！

### 步驟 B：連接免費 Supabase 雲端資料庫（實現跨手機/電腦即時同步與大檔案上傳）
1. 前往 [Supabase.com](https://supabase.com/) 免費註冊並點擊 **New Project** 建立一個專案。
2. 進入專案後，點擊左側 **SQL Editor**，在您的網站中點擊左下角 **「設定 ➔ 複製 Supabase 資料表初始化 SQL」**（或複製 [supabase_schema.sql](file:///g:/我的雲端硬碟/KennyDatabase/supabase_schema.sql) 內容），貼上並點擊 **Run**。
3. 在 Supabase 左側點擊 **Project Settings -> API**，複製 **`Project URL`** 與 **`anon public key`**。
4. 回到您的 `KennyDatabase` 網站，點擊左下角 **「設定」**，貼上這兩組網址與金鑰並點擊 **「⬆️ 儲存設定並將目前資料上傳至雲端」** 即大功告成！
