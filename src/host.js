// B站爆款雷达 · Host 半边（bili_feed 原生工具 + bili-ai-feed 技能提供方 + 硬规则注入 + 面板数据面）。
// 扫描/聚类/情报 briefing 是同步接口；情报调查延伸与强制模板输出由会话模型按技能完成。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { systemSection } from './systemPrompt.js'
import { registerApi } from '../lib/api.js'
import { fetchFeed, feedOpts, SOURCE_LABEL } from '../lib/engine.js'
import { formatNumber } from '../lib/normalize.js'
import {
  saveFeed, getMeta, getRaw, listFeeds, publicMeta, getSettings, saveReportHtml,
} from '../lib/store.js'
import { formatDigestHtml } from '../lib/report.js'
import { briefingToMarkdown as briefingMarkdown } from '../lib/briefing.js'

export const name = 'bili-ai-feed' // = cordis.patch.yml 的 id

export const inject = ['tools', 'skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  injectRules: Schema.boolean().default(true).description('注入B站爆款雷达工作流到系统提示'),
  apiKey: Schema.string().default('').description('RedFox API Key（ak_ 开头；留空读面板设置或环境变量 REDFOX_API_KEY）'),
  proxyUrl: Schema.string().default('').description('HTTP(S) 代理（访问 redfox.hk 用），留空直连'),
})

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：分类概览/情报调查报告/条目明细' },
      footer: { type: 'string', description: '可选：输出时需逐字附带的引擎页脚' },
    },
  },
  render: (_args, value) => text([value.summary, value.data, value.footer].filter(Boolean).join('\n\n')),
}

const result = (ok, summary, data = '', footer = '') => ({ ok, summary, data, footer })

const MAX_TEXT = 58000

function buildFooter(meta) {
  return `📺 数据源：redfox.hk API（B站爆款雷达）· ${meta.date} · 扫描 ${meta.total} 条 · 聚类 ${meta.topic_count} 类 · 记录 ${meta.feed_id}`
}

// 单条视频行（模型可读）
function renderRow(v, idx) {
  return `${idx}｜[${v.title}](${v.url})｜@${v.author}｜👍${formatNumber(v.like_count)} 💬${formatNumber(v.comment_count)} 📤${formatNumber(v.share_count)}｜${v.published_at ? String(v.published_at).slice(5, 16) : '--'}`
}

// ---------------------------------------------------------------------------
// 工具：bili_feed —— fetch / list / get
// ---------------------------------------------------------------------------
export const biliFeedTool = {
  name: 'bili_feed',
  description:
    'B站爆款雷达：按关键词扫描 B 站作品（默认关键词 AI，可换任意关键词），按点赞发现爆款视频，智能聚类话题，基于热门话题生成情报调查报告（新兴起量信号/核心达人/话题调查/跨平台建议），产出深色主题 HTML 日报。' +
    '⚠️数据每日15:00更新前一天：请求无数据日期时工具会拦截并要求先向用户确认，未经确认禁止查询（扣积分无返回）。' +
    '需要 RedFox API Key（面板「设置」页或环境变量 REDFOX_API_KEY）。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('fetch 生成日报；list 历史日报；get 读详情', { enum: ['fetch', 'list', 'get'] }),
      date: str('fetch：目标日期 yyyy-MM-dd；不传=最新可用日期（自动按15:00规则）'),
      keywords: str('fetch：自定义关键词逗号分隔（如 "AI绘画,ComfyUI"）；不传=默认AI+自动扩展词 batch 批量查询'),
      confirmNewer: str('fetch：用户已确认接受切到最新可用日期后传 "true"（配合 date 传入较新日期时自动落到最新有数据日）'),
      count: num('fetch：扫描视频数量上限，默认 200（最大 200）'),
      feedId: str('get 定位：目标日报记录 id；缺省=最新一次'),
    },
  },
  output: OUTPUT,
  async execute(args, ctxConfig) {
    check(args, this.parameters)
    const cfg = ctxConfig || {}

    // ── fetch ────────────────────────────────────────────────────────────
    if (args.action === 'fetch') {
      const opts = feedOpts({ settings: getSettings(), config: cfg })
      if (!opts.apiKey) {
        return result(false, '未配置 RedFox API Key。请用户到面板「B站爆款雷达 → 设置」填入，或在插件配置/环境变量 REDFOX_API_KEY 里配置（获取：https://redfox.hk/settings/api-keys?source=github）。')
      }
      const count = Math.min(Math.max(Number(args.count) || 200, 20), 200)
      const confirmNewer = args.confirmNewer === 'true' || args.confirmNewer === true
      const data = await fetchFeed({ date: args.date, keywords: args.keywords, count, confirmNewer, ...opts })

      // 第零步硬规则：无数据区间拦截——输出确认话术并停止（不扣积分）
      if (data.date_blocked) {
        return result(false,
          `⛔ **${data.requested_date}数据尚未更新**\n数据更新规则：每日15:00更新前一天的数据\n当前可查询的最新日期：${data.latest}\n\n是否需要查询${data.latest}的数据？（用户明确确认后，再调一次 fetch 并传 confirmNewer="true"）`,
          '', '📺 数据源：redfox.hk API（B站爆款雷达）· 未产生查询')
      }

      if (!data.articles.length) {
        return result(false,
          `关键词 ${data.keywords.join('/')} 在 ${data.date} 暂无内容。可建议用户更换关键词或查询更近日期；不要自动改查其他关键词。`,
          '', `📺 数据源：redfox.hk API（B站爆款雷达）· ${data.date} · 0 条`)
      }

      const meta = saveFeed(data)
      const html = formatDigestHtml({ dateStr: data.date, articles: data.articles, clusters: data.clusters, briefing: data.briefing, source: SOURCE_LABEL })
      const reportFile = saveReportHtml(meta.feed_id, html)
      const pm = publicMeta(meta)

      // 分类概览（强制输出模板用）
      const total = data.articles.length
      const overview = [
        `## B站爆款雷达 · ${data.date} 日报`,
        '',
        `**扫描 ${total} 条热门视频，聚类 ${data.clusters.length} 个分类**`,
        '',
        '---',
        '',
        '### 分类概览',
        '',
        '| 分类 | 数量 | 占比 | 头部视频亮点 |',
        '|------|------|------|------|',
        ...data.clusters.slice(0, 12).map((c) => {
          const top = c.articles[0]
          const highlight = top ? `${String(top.title).slice(0, 24)}…（${formatNumber(top.like_count)}赞）` : '-'
          return `| ${c.category} | ${c.count}条 | ${(c.count * 100 / total).toFixed(1)}% | ${highlight} |`
        }),
        '',
        '### 各分类头部视频（TOP5/类，标题带链接）',
        '',
        ...data.clusters.slice(0, 8).flatMap((c) => [
          `**${c.category}**（${c.count}条 · 均赞${formatNumber(c.avg_likes)}）`,
          ...c.articles.slice(0, 5).map((v, i) => `  ${renderRow(v, i + 1)}`),
          '',
        ]),
      ].join('\n')

      const briefingMd = data.briefing
        ? [
            '### 情报调查报告',
            '',
            briefingToMarkdownSafe(data.briefing, data.articles),
          ].join('\n')
        : ''

      const summary =
        `已入库（feedId=${meta.feed_id}）。${data.date} · ${total} 条 · ${data.clusters.length} 类。` +
        `按 bili-ai-feed 技能的强制输出模板向用户输出：分类概览表 → 情报调查报告六板块（用下方数据）。板块无数据标"暂无"不删板块，数值严禁编造。桌面端 WebContentsView 会 deny window.open/target=_blank，报告只能在面板内查看——告诉用户点侧栏「B站爆款雷达」的报告页/详情页（HTML 日报记录 ${meta.feed_id}，磁盘文件 ${reportFile}），不要把磁盘路径当成可点开的入口。`

      return result(true, summary, [overview, briefingMd].filter(Boolean).join('\n\n').slice(0, MAX_TEXT), buildFooter(pm))
    }

    // ── list ─────────────────────────────────────────────────────────────
    if (args.action === 'list') {
      const list = listFeeds({ limit: 20 })
      if (!list.length) return result(false, '还没有日报记录。先 fetch。')
      const lines = list.map((r) =>
        `${r.feed_id}｜${r.date}｜${r.total}条 ${r.topic_count}类${r.emerging?.length ? '｜起量:' + r.emerging.join(',') : ''}`)
      return result(true, `共 ${list.length} 期日报（新→旧）。读详情用 action="get"。`, lines.join('\n').slice(0, MAX_TEXT))
    }

    // ── get ──────────────────────────────────────────────────────────────
    if (args.action === 'get') {
      const meta = resolveFeedMeta(args.feedId)
      const raw = getRaw(meta.feed_id)
      if (!raw) throw new Error(`日报数据缺失：${meta.feed_id}`)
      const pool = raw.articles || []
      const body = pool.slice(0, 50).map((v, i) => renderRow(v, i + 1)).join('\n')
      return result(true,
        `${meta.date} 日报共 ${pool.length} 条（${meta.topic_count} 类）。引用时链接取 url 字段。`,
        body.slice(0, MAX_TEXT), buildFooter(publicMeta(meta)))
    }

    throw new Error(`未知 action：${args.action}`)
  },
}

function briefingToMarkdownSafe(briefing, articles) {
  return briefingMarkdown(briefing, articles)
}

function resolveFeedMeta(feedId) {
  if (feedId) {
    const meta = getMeta(feedId)
    if (!meta) throw new Error(`日报记录不存在：${feedId}。用 list 查看已有日报。`)
    return meta
  }
  const [latest] = listFeeds({ limit: 1 })
  if (!latest) throw new Error('还没有日报记录。先 fetch。')
  return getMeta(latest.feed_id)
}

// ---------------------------------------------------------------------------
// 装配
// ---------------------------------------------------------------------------
export function apply(ctx, config) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]

  const toolWithConfig = { ...biliFeedTool, execute(args) { return biliFeedTool.execute(args, config) } }

  ctx.effect(() => ctx.tools.register(toolWithConfig), `${name}: tool`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: workflow`)
  }
  ctx.effect(() => registerApi(ctx, { config }), `${name}: routes`)
}

export { publicMeta }
