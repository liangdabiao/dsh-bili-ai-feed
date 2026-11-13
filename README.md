# dsh-bili-ai-feed · B站爆款雷达

> 每日自动扫描B站AI创作内容，按点赞量筛选爆款视频，智能聚类后生成深色主题 HTML 日报（封面图+互动数据+视频直链），并基于热门话题输出 AI 情报调查报告。

dsh 插件（完整形态：原生工具 + 数据持久化 + 侧栏看板）。支持自定义关键词批量查询。移植自 [redfox-community](https://github.com/redfox-data/redfox-community) 的 skills/bili-ai-feed，Python 引擎（daily_report.py 1463 行）全量重写为 Node。
<img width="2025" height="797" alt="image" src="https://github.com/user-attachments/assets/054d3c6c-2e2a-41ab-8145-d9b65bd07c73" />

## ⚠️ 数据纪律（核心设计）

- 数据**每日 15:00 更新前一天**：15:00 前最新可用 = T-2，之后 = T-1（面板与工具内置此规则）
- **目标日期无数据时禁止自动调用接口**（扣积分无返回）：工具返回拦截话术，必须先向用户确认，确认后带 `confirmNewer` 重查（自动落到最新有数据日）；面板日期选择器前端拦截
- 默认关键词 `AI`，数据不足自动扩展（人工智能→大模型→GPT→Agent→AI绘画→AI教程），batch 接口一次批量查询；自定义关键词只用用户列表

## 功能

- **bili_feed 工具**（agent 对话内使用）
  - `fetch`：扫描 + 智能聚类（六步算法：标签分组/大组拆分/小组合并/标题关键词再拆/保底5类）+ AI 情报调查报告（新兴起量信号/核心达人/TOP话题调查/跨平台建议）+ HTML 日报落盘
  - `list` / `get`：日报历史与补读
- **强制输出模板**：对话回复严格按「分类概览表 → 情报调查报告六板块 → 日报地址」呈现（技能注入硬规则）
- **侧栏看板**：直查日报（关键词/日期/条数）、分类卡片（B站封面缩略图+互动数据+视频直链）、情报调查视图、深色主题 HTML 日报（面板内嵌查看）、日期拦截提示
- **bili-ai-feed 技能**：完整方法论快照（引擎策略/调查模式/报告模板）

## 安装

```bash
dsh plugin --profile web add file:D:/dsh-research/dsh-bili-ai-feed
```

前置：dsh >= 0.2.1-rc.2；RedFox API Key（[红狐 hub 获取](https://redfox.hk/settings/api-keys?source=github)，`ak_` 开头）。

## 开发

```bash
npm install        # 安装依赖并构建 dist/client.js
npm test           # 单测（node --test）
npm run smoke      # 离线冒烟：假 batch 服务器 + 工具直调（含日期拦截）+ 面板 API 全路由
npm run dev        # 开发预览：DSH_HOME=<数据目录> node scripts/devserver.mjs 5195
npm run live       # 真实抓取：DSH_HOME=<目录> node scripts/live.mjs [关键词] ak_xxx
```

数据目录：`$DSH_HOME/bili-ai-feed/`（settings.json + feeds/<id>/meta.json、raw.json、report.html）。

## License

MIT
