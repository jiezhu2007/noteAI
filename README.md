# NoteAI

智能笔记与提醒一体化 macOS 桌面应用，集成 AI 能力，支持富文本 / Markdown 编辑、文件夹与标签管理、全局搜索以及自然语言提醒。

## 功能特性

- **富文本编辑** — 基于 TipTap，支持 Markdown 快捷键、代码块高亮、表格、任务列表、图片等
- **文件夹 & 标签** — 多层级文件夹组织笔记，标签快速分类与筛选
- **全局搜索** — `⌘K` 唤起，按标题和内容实时搜索
- **智能提醒** — 支持自然语言输入（如"明天下午3点提醒我开会"），自动解析为系统通知
- **AI 集成** — 笔记摘要、智能续写、自然语言提醒解析；支持 Ollama（本地）/ Claude API / OpenAI API / 自定义端点
- **深色模式** — 跟随系统或手动切换，macOS 风格 UI
- **本地存储** — SQLite (sql.js WASM) 存储，数据完全离线，隐私安全

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 35 + React 18 + TypeScript |
| 构建 | Vite + vite-plugin-electron |
| 编辑器 | TipTap 2 |
| 数据库 | sql.js (SQLite WASM) |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS |
| AI | Ollama / Claude API / OpenAI API |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装与运行

```bash
git clone https://github.com/jiezhu2007/noteAI.git
cd noteAI
npm install
npm run dev
```

### 构建

```bash
npm run build
```

生成的 `.dmg` 安装包位于 `dist/` 目录。

## 项目结构

```
noteai/
├── electron/
│   ├── main.ts              # Electron 主进程
│   ├── preload.ts           # Context Bridge
│   └── services/
│       ├── db.ts            # SQLite CRUD
│       ├── ai.ts            # AI 服务（摘要、续写、提醒解析）
│       ├── reminder.ts      # macOS 通知调度
│       └── fileStore.ts     # 文件存储
├── src/
│   ├── App.tsx              # 三栏布局（笔记 / 提醒 / 设置）
│   ├── pages/               # 页面组件
│   ├── components/          # UI 组件（编辑器、侧边栏、搜索等）
│   ├── store/               # Zustand 状态管理
│   └── types.ts             # TypeScript 类型定义
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## 许可证

MIT
