# 表达训练网页版

**直接使用：[akiai.cn/expression-trainer](https://akiai.cn/expression-trainer/)**

无需安装，打开浏览器即用。支持中英双语。

## 功能

- 🎤 **实时语音识别** — Chrome、Edge、Safari 允许麦克风后说话即转文字
- **口语词库分析** — 填充词、犹豫词和笼统词实时高亮
- **实时反馈** — 无需 API Key，右侧同步显示替换建议和表达提醒
- **训练历史** — 保存在当前浏览器，可再次打开和导出
- **结构化报告** — 包含逐句编辑、行为模式和优化版完整逐字稿
- **HTML/Markdown 导出** — 报告可独立保存和重复导出
- 🌍 **中英双语** — 一键切换，英语练口语同样适用
- 📊 **练习统计** — 时长、字数、填充词占比

未配置 API Key 时会生成本地结构化报告；配置后可增加 AI 深度反馈和优化版完整逐字稿。浏览器识别结果即使返回繁体字，也会按简体词库匹配并保持原文显示。

## 桌面版

Electron 桌面版继续使用本地 Sherpa-ONNX 识别，与网页版共用词库、报告结构和过滤规则。项目仓库：[akiai666/expression-trainer](https://github.com/akiai666/expression-trainer)

## License

程序代码采用 MIT License。公开网页不分发 DLUT 情感词汇本体及其衍生数据；相关数据不属于 MIT License。
