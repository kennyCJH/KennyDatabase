// ============================================================================
// KennyDatabase - 國小校長個人知識庫與治校策略系統 預設資料與領域設定
// ============================================================================

window.KENNY_DEFAULT_DOMAINS = [
  {
    id: 'vision',
    name: '辦學願景與品牌特色',
    shortName: '辦學願景',
    office: '校長室',
    icon: 'compass',
    color: '#2563eb',
    description: '學校願景定位、校本特色課程、少子化品牌亮點與中長程校務發展計畫'
  },
  {
    id: 'curriculum',
    name: '課程教學與數位創新',
    shortName: '教務課程',
    office: '教務處',
    icon: 'book-open',
    color: '#0891b2',
    description: '108課綱深耕、閱讀素養推動、AI與數位學習精進、雙語教育、學習扶助'
  },
  {
    id: 'student',
    name: '品格實踐與活力校園',
    shortName: '學務品格',
    office: '學務處',
    icon: 'shield-check',
    color: '#059669',
    description: '正向管教、友善校園與霸凌防制、自治小市長、社團體育與健康促進'
  },
  {
    id: 'campus',
    name: '空間美學與永續環境',
    shortName: '總務空間',
    office: '總務處',
    icon: 'building-2',
    color: '#d97706',
    description: '校園美感角落改造、老舊校舍活化、SDGs永續綠校園、工程修繕與防災安全'
  },
  {
    id: 'guidance',
    name: '適性輔導與親師共好',
    shortName: '輔導親師',
    office: '輔導室',
    icon: 'heart-handshake',
    color: '#7c3aed',
    description: '特教融合支持、高關懷學生三級輔導、家長會與志工團經營、社區與大學資源連結'
  },
  {
    id: 'leadership',
    name: '行政賦能與教師社群',
    shortName: '行政領導',
    office: '校長室 / 人事',
    icon: 'zap',
    color: '#e11d48',
    description: '行政減量與數位自動化、跨處室協作、教師專業學習社群(PLC)、危機處理SOP'
  }
];

window.KENNY_DEFAULT_VAULT_ITEMS = [
  {
    id: 'item_ai_reading_quote',
    type: 'snippet',
    title: 'AI 時代的閱讀素養：從「提取訊息」走向「精準提問与思辨」',
    content: '【校長晨會/教師共備核心論述】\n過去我們教孩子讀書是為了找標準答案；但在生成式 AI 普及的今天，國小階段最重要的兩個基本功是：\n1. 深層閱讀理解力（能讀懂文本脈絡與作者意圖）\n2. 結構化提問力（能向 AI 提出好問題，並查核 AI 回應的真偽）\n\n推動方向建議：低年級維持紙本繪本共讀溫度，中高年級導入「先讀紙本 → 小組討論 → AI 輔助延伸探究」的三段式閱讀課。',
    url: '',
    file_name: '',
    file_size: 0,
    file_type: '',
    file_data: '',
    domain: 'curriculum',
    tags: ['AI教育', '閱讀推動', '校長論述', '115學年度'],
    is_starred: true,
    is_inbox: false,
    created_at: '2026-10-25T09:30:00+08:00',
    updated_at: '2026-10-25T09:30:00+08:00'
  },
  {
    id: 'item_moe_digital_link',
    type: 'link',
    title: '教育部推動中小學數位學習精進方案入口網（因材網 / 生生用平板資源）',
    content: '彙整全國數位學習工作坊、因材網生成式 AI 學習夥伴（e度）教學案例，以及各縣市公開授課教案示範，可提供給教務主任與資訊組長作為學期初教師增能研習規畫依據。',
    url: 'https://pads.moe.edu.tw/',
    file_name: '',
    file_size: 0,
    file_type: '',
    file_data: '',
    domain: 'curriculum',
    tags: ['數位學習', '教育部政策', '生生用平板', '教師增能'],
    is_starred: true,
    is_inbox: false,
    created_at: '2026-10-26T14:15:00+08:00',
    updated_at: '2026-10-26T14:15:00+08:00'
  },
  {
    id: 'item_reading_plan_file',
    type: 'file',
    title: '國小跨域閱讀與數位走讀課程架構檢核表.md',
    content: '包含低中高年級每學期閱讀達標冊數、班級共讀書箱輪替機制、以及結合社區踏查的「走讀家鄉」評量規準範本。',
    url: '',
    file_name: '國小跨域閱讀與數位走讀課程架構檢核表.md',
    file_size: 4280,
    file_type: 'text/markdown',
    file_data: 'data:text/markdown;charset=utf-8,' + encodeURIComponent('# 國小跨域閱讀與數位走讀課程架構檢核表\n\n## 一、 各年段核心目標\n- **低年級（繪本悅讀）**：每週晨讀 3 次，培養親子共讀習慣，學期累計 30 本繪本。\n- **中年級（橋樑書與科普探索）**：結合自然與社會領域，使用心智圖整理文章結構。\n- **高年級（專題探究與 AI 思辨）**：針對 SDGs 或社區議題進行多文本閱讀，並運用數位工具發表專題簡報。\n\n## 二、 處室支援檢核\n- [x] 教務處：盤點圖書室新書採購與班級書箱更新\n- [x] 資訊組：設定高年級平板閱讀探究平台帳號\n- [ ] 輔導室：招募晨光故事志工團入班說故事'),
    domain: 'curriculum',
    tags: ['閱讀推動', '校訂課程', '檢核表範本'],
    is_starred: false,
    is_inbox: false,
    created_at: '2026-10-27T11:20:00+08:00',
    updated_at: '2026-10-27T11:20:00+08:00'
  },
  {
    id: 'item_campus_aesthetics_link',
    type: 'link',
    title: '學美・美學—校園美感設計實踐計畫（台灣設計研究院 TDRI）',
    content: '收錄全國各國小改造走廊、川堂、圖書角、掃具間與指標系統的成功案例。非常適合提供給總務主任作為年底申請校園空間活化經費與設計招標的視覺參考。',
    url: 'https://www.tdri.org.tw/',
    file_name: '',
    file_size: 0,
    file_type: '',
    file_data: '',
    domain: 'campus',
    tags: ['空間美學', '校園改造', '經費申請', '總務工程'],
    is_starred: true,
    is_inbox: false,
    created_at: '2026-10-28T16:40:00+08:00',
    updated_at: '2026-10-28T16:40:00+08:00'
  },
  {
    id: 'item_admin_streamline_note',
    type: 'snippet',
    title: '處室行政減量三原則：不重複填報、表單雲端化、會議聚焦決策',
    content: '【行政主管會報共識紀錄】\n為了把時間還給老師專注教學，本學期推動行政減量三大具體作法：\n1. 宣導事項全面改為「電子週報」事先公告，週三教師晨會不超過 20 分鐘，只談需要跨年段共識的議題。\n2. 成果照片與計畫佐證統一建立全校共用雲端索引，禁止各處室向導師重複索取同性質照片。\n3. 歷史悠久的例行活動重新盤點「教育價值 vs. 勞務負擔」，大膽整併低效益活動。',
    url: '',
    file_name: '',
    file_size: 0,
    file_type: '',
    file_data: '',
    domain: 'leadership',
    tags: ['行政減量', '主管會報', '領導策略', '教師支持'],
    is_starred: true,
    is_inbox: false,
    created_at: '2026-10-29T10:05:00+08:00',
    updated_at: '2026-10-29T10:05:00+08:00'
  },
  {
    id: 'item_sel_inbox_snippet',
    type: 'snippet',
    title: '【待整理靈感】社會情緒學習 (SEL) 融入導師時間與友善校園週',
    content: '近期多所小學開始將 SEL（自我覺察、情緒管理、同理心、人際關係）做成簡單的「情緒溫度計」班級小卡。下次與學務主任、輔導主任開會時，可討論是否在四年級、五年級先行試辦，減少同儕人際衝突。',
    url: '',
    file_name: '',
    file_size: 0,
    file_type: '',
    file_data: '',
    domain: 'student',
    tags: ['SEL情緒學習', '友善校園', '正向管教'],
    is_starred: false,
    is_inbox: true,
    created_at: '2026-11-01T08:30:00+08:00',
    updated_at: '2026-11-01T08:30:00+08:00'
  }
];

window.KENNY_DEFAULT_STRATEGIES = [
  {
    id: 'strat_ai_reading_115',
    slug: 'ai-reading-115',
    title: '115學年度「AI 領航・深耕閱讀」雙核心教學推動策略',
    domain: 'curriculum',
    office: '教務處 / 資訊組 / 圖書推動小組',
    status: '處室共識中',
    summary: '以「紙本深閱讀為根、AI 數位探究為翼」，建立低中高年級循序漸進的閱讀與提問素養，並透過公開授課社群減輕教師備課負擔。',
    blocks: [
      {
        id: 'b1',
        title: '一、 核心理念與治校目標（Why）',
        type: 'vision',
        content: '- **解決痛點**：避免數位載具淪為單純刷題工具，同時改善高年級學生長文閱讀耐受度不足的問題。\n- **核心目標**：讓每位孩子在畢業前具備「讀懂長文脈絡」與「善用 AI 進行專題探究」的雙重能力。'
      },
      {
        id: 'b2',
        title: '二、 分年段策略方針（What）',
        type: 'policy',
        content: '1. **低年級（溫馨共讀期）**：100% 紙本繪本與晨光故事媽媽入班，不急於導入螢幕，專注語感與識字量。\n2. **中年級（結構思維期）**：導入數位心智圖與橋樑書共讀，訓練學生找出段落大意與因果關係。\n3. **高年級（AI 協作探究期）**：結合校訂走讀課程，引導學生先閱讀紙本史料，再使用教育部「因材網 e度」進行提問検証與簡報發表。'
      },
      {
        id: 'b3',
        title: '三、 處室分工與學期里程碑（How & When）',
        type: 'action',
        content: '- **[9月] 教務處 & 資訊組**：完成高年級導師 AI 輔助閱讀工作坊（示範 3 個現成教學模組）。\n- **[10月] 圖書室**：啟動主題書展與班級共讀書箱數位借閱統計。\n- **[11月-12月] 學年教師社群 (PLC)**：各學年完成至少 1 場結合閱讀或數位工具之公開觀議課。\n- **[1月] 期末校務會議**：各學年分享學生作品亮點，滾動修正下學期書單。'
      }
    ],
    linked_items: ['item_ai_reading_quote', 'item_moe_digital_link', 'item_reading_plan_file'],
    share_mode: 'passcode',
    passcode: '2026',
    created_at: '2026-10-28T10:00:00+08:00',
    updated_at: '2026-11-01T18:00:00+08:00'
  },
  {
    id: 'strat_admin_empowerment',
    slug: 'admin-empowerment-plc',
    title: '行政減量數位化與教師專業社群（PLC）賦能藍圖',
    domain: 'leadership',
    office: '校長室 / 各處室主任',
    status: '推動執行中',
    summary: '透過「表單雲端單一窗口、會議精準化、活動減法盤點」三大工程，把時間真正還給老師，讓行政成為教學最強後盾。',
    blocks: [
      {
        id: 'b201',
        title: '一、 校長領導承諾（Why）',
        type: 'vision',
        content: '行政存在的價值不在於產出厚重的成果冊，而在於創造一個「讓老師安心教書、孩子快樂學習」的支援系統。本學期起由校長室帶頭進行行政減法。'
      },
      {
        id: 'b202',
        title: '二、 三大具體行動準則（What & How）',
        type: 'action',
        content: '1. **週三晨會瘦身**：政令宣導一律於週二下班前彙整於雲端電子報，晨會聚焦於跨處室協調與學生個案支持，時間控制在 20 分鐘內。\n2. **全校雲端佐證單一資料庫**：各處室評鑑所需照片與紀錄，由行政端自共用相簿調閱，不再重複向導師催繳。\n3. **社群取代傳統研習**：減少單向聽講式研習，將週三下午時間留給學年社群共同備課與實作。'
      }
    ],
    linked_items: ['item_admin_streamline_note'],
    share_mode: 'public',
    passcode: '',
    created_at: '2026-10-29T15:00:00+08:00',
    updated_at: '2026-11-01T19:00:00+08:00'
  },
  {
    id: 'strat_campus_aesthetics_draft',
    slug: 'campus-aesthetics-sdgs',
    title: '【校長私人構想】北棟走廊空間美學改造與 SDGs 永續角規畫',
    domain: 'campus',
    office: '校長室 / 總務處（尚未公開）',
    status: '構想草稿',
    summary: '盤點北棟二樓閒置角落，預計結合學美美學設計理念與家長會資源，打造兼具閱讀與展示功能的木質調減壓空間。',
    blocks: [
      {
        id: 'b301',
        title: '一、 空間盤點與初步構想（私人備忘）',
        type: 'vision',
        content: '- 目前北棟二樓轉角採光極佳，但堆置舊教具櫃，相當可惜。\n- 預計先與總務主任私下場勘，評估拆除舊櫃、鋪設安全耐磨木紋地墊與展示燈槽的概算（預估約 15~25 萬，可爭取專案補助或家長會專案支持）。'
      }
    ],
    linked_items: ['item_campus_aesthetics_link'],
    share_mode: 'private',
    passcode: '',
    created_at: '2026-10-30T21:00:00+08:00',
    updated_at: '2026-11-01T19:30:00+08:00'
  }
];
