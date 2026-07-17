# 表达训练：桌面端 + 网页端

> **代码：MIT License**
>
> **大连理工大学情感词汇本体及其衍生数据：**
> 仅供科研及教学使用，不包含在 MIT 授权范围内。
> 商业使用或公开再分发请向大连理工大学信息检索研究室取得授权。
>
> 标准引用：
> 徐琳宏, 林鸿飞, 潘宇, 任惠, 陈建美.
> 情感词汇本体的构造.
> 情报学报, 2008, 27(2):180-185.

一个同时支持 Electron 桌面端和浏览器使用的实时表达训练工具。公开版本内置 MIT 口语规则；DLUT 情感词库由用户在符合其使用条件的前提下自行下载并仅在本地启用。

网页版：[https://akiai.cn/expression-trainer/](https://akiai.cn/expression-trainer/)

## 功能

- 🎤 **实时语音识别**：基于 Sherpa-ONNX 本地模型，中文优化
- 📝 **全屏字幕显示**：黑底大字，实时显示你说的每一句话
- 🔍 **词库分析**：自动检测填充词、犹豫词、笼统词，给出精准替代
- 🤖 **AI反馈**：支持 Groq/OpenAI/DeepSeek/Ollama 多后端
- 📊 **结构化报告**：指标卡片、亮点、问题、精准替换和练习重点
- 💾 **报告导出**：支持可离线打开的 HTML 和 Markdown
- 🕘 **训练历史**：训练结束自动保存，可再次打开和重复导出
- ✍️ **优化版全文**：AI 在保留原意的前提下生成可直接使用的完整逐字稿
- 🌐 **网页实时训练**：Chrome、Edge、Safari 可使用浏览器语音识别；也支持粘贴逐字稿

## 安装

### 1. 克隆项目 & 安装依赖

```bash
cd expression-trainer
npm install
```

### 2. 下载语音识别模型

需要下载 Sherpa-ONNX 的 streaming paraformer 中英双语模型：

```bash
cd models

# 方法一：使用 wget
wget https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2
tar xvf sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2

# 方法二：使用 huggingface
# https://huggingface.co/csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en
```

下载后 `models/` 目录应包含：
```
models/
└── sherpa-onnx-streaming-paraformer-bilingual-zh-en/
    ├── encoder.int8.onnx
    ├── decoder.int8.onnx
    └── tokens.txt
```

### 3. 配置 AI 后端

启动后点击右上角 ⚙️ 进入设置页面。

推荐配置：

| 后端 | 费用 | 速度 | 获取方式 |
|------|------|------|----------|
| **Groq** | 免费 | 极快 | [console.groq.com](https://console.groq.com) |
| DeepSeek | 极低 | 快 | [platform.deepseek.com](https://platform.deepseek.com) |
| OpenAI | 中等 | 快 | [platform.openai.com](https://platform.openai.com) |
| Ollama | 免费 | 取决于硬件 | [ollama.com](https://ollama.com) 本地运行 |

**推荐 Groq**：免费额度足够日常使用，响应速度极快（<500ms）。

### 4. 启动应用

```bash
npm start
```

## 使用说明

1. **点击「开始录制」** → 对着麦克风说话
2. **实时字幕**会在屏幕中央显示你说的内容
3. **左侧面板**实时统计填充词/犹豫词/笼统词
4. **右侧面板**即时显示本地词库反馈；配置 API Key 后，每30字左右追加 AI 深度反馈
5. **说完后点击「结束」** → 点击「生成报告」，可导出 HTML 或 Markdown

网页版使用浏览器自带语音识别，需要允许麦克风权限。未配置 API Key 时仍可完成实时词库反馈和本地结构化报告；完整优化逐字稿需要配置 AI 服务。

## 字幕颜色含义

| 颜色 | 含义 |
|------|------|
| 🔴 红色波浪下划线 | 填充词（嗯、啊、那个、然后…） |
| 🟠 橙色 | 犹豫词（可能、也许、我觉得…） |
| 🟡 黄色虚线 | 笼统词（有精准替代建议） |
| 🟣 紫色 | 情绪词（显示类别和强度） |

左栏绿色数字是“表达密度”，右侧绿色反馈表示结构或表达亮点。

## 技术架构

```
┌─────────────────────────────────────────┐
│ Electron 主进程                          │
│  ├── Sherpa-ONNX (本地语音识别)          │
│  ├── 词库匹配 (内置口语规则 + 可选本地 DLUT)│
│  └── AI反馈 (多后端 HTTP API)            │
├─────────────────────────────────────────┤
│ 渲染进程 (Chromium)                      │
│  ├── 全屏字幕显示                        │
│  ├── 实时统计面板                        │
│  └── 分析报告弹窗                        │
└─────────────────────────────────────────┘
```

## 词库说明

公开仓库不包含 DLUT 原始 CSV，也不包含从其生成的完整浏览器词库。没有 DLUT 时，填充词、犹豫词、笼统词、报告、历史和导出仍可正常使用。

如需在科研或教学场景本地启用 DLUT：

```bash
# 先显示官方获取和授权说明
npm run setup:dlut

# 从官方页面手动下载、解压并另存为 UTF-8 CSV 后安装
npm run setup:dlut -- --source "/绝对路径/情感词汇本体.csv"

# 可选：生成仅供本地自托管使用、且被 Git 忽略的网页词库
npm run build:web:dlut
```

官方页面：[大连理工大学信息检索研究室：情感词汇本体-词典](https://ir.dlut.edu.cn/info/1013/1142.htm)。详细边界见 [DATA_LICENSE.md](DATA_LICENSE.md) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 开发

```bash
# 开发模式（带DevTools）
npm run dev

# 重新生成网页版词库和报告渲染器
npm run build:web

# 网页版静态文件位于 web/，可用任意静态服务器部署

# 目录结构
├── main.js              # Electron主进程
├── preload.js           # preload脚本
├── src/
│   ├── index.html       # 主界面
│   ├── settings.html    # 设置页
│   ├── styles.css       # 样式
│   ├── app.js           # 前端逻辑
│   └── settings.js      # 设置逻辑
├── lib/
│   ├── asr.js           # 语音识别
│   ├── lexicon.js       # 词库匹配
│   ├── ai-feedback.js   # AI反馈
│   └── prompts.js       # Prompt模板
├── data/                # 用户本地数据目录（受限数据被 Git 忽略）
└── models/              # Sherpa-ONNX模型（需下载）
```

## 系统要求

- macOS 12+ / Windows 10+ / Linux
- Node.js 18+
- 麦克风权限
- （可选）网络连接（用于 AI 反馈；词库分析无需联网）

## License

程序代码采用 MIT License。DLUT 情感词汇本体及其任何衍生数据不属于 MIT License。
