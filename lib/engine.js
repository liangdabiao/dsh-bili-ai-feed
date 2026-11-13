// B站爆款雷达引擎：日期预检（15:00 规则）→ batch 批量关键词查询 → 清洗去重 → 聚类 → 情报 briefing → HTML 日报。
import { fetchBatch, DEFAULT_KEYWORDS, EXPAND_KEYWORDS, PAGE_SIZE, resolveApiKey, resolveApiBase, SOURCE_LABEL } from './redfox.js'
import { resolveTargetDate } from './dates.js'
import { normalizeVideo, dedupeVideos, sortByLikes } from './normalize.js'
import { clusterArticles } from './cluster.js'
import { generateBriefing } from './briefing.js'
import { formatDigestHtml } from './report.js'

// 工具/面板共用的参数装配（settings + config + env → fetch opts）
export function feedOpts({ settings = {}, config = {} } = {}) {
  return {
    apiKey: resolveApiKey({ settings, config }),
    apiBase: resolveApiBase({ settings }),
    proxyUrl: config?.proxyUrl || settings.proxy_url || '',
  }
}

// 关键词列表构建（上游策略）：自定义关键词只用用户列表；默认关键词 AI + 扩展词 batch 批量
export function buildKeywords(keywordsArg) {
  const list = String(keywordsArg || '').split(/[,，]/).map((k) => k.trim()).filter(Boolean)
  if (!list.length || list.join(',') === DEFAULT_KEYWORDS.join(',')) {
    return [...new Set([...DEFAULT_KEYWORDS, ...EXPAND_KEYWORDS])]
  }
  return list
}

/**
 * 生成日报（同步）。
 * @param {object} opts { date|'latest', keywords, count=200, apiKey, apiBase, proxyUrl, now }
 * @returns {{ date, requested_date, keywords, articles, clusters, briefing, date_blocked?, latest }}
 */
export async function fetchFeed({ date, keywords: keywordsArg, count = 200, confirmNewer = false, apiKey, apiBase, proxyUrl = '', now = new Date() } = {}) {
  if (!apiKey) throw new Error('未配置 RedFox API Key。请到面板「设置」页填入，或在插件配置/环境变量 REDFOX_API_KEY 里配置（获取：https://redfox.hk/settings/api-keys?source=github）。')
  let resolved = resolveTargetDate(date, now)
  if (resolved.empty && confirmNewer) {
    // 用户已确认：--latest 语义，落到最新有数据日（不扣无效积分）
    resolved = { date: resolved.latest, latest: resolved.latest }
  }
  if (resolved.empty) {
    // 上游第零步硬规则：目标日期无数据时禁止自动调用接口（会扣积分无返回），交回给 agent 问用户
    return {
      date_blocked: true,
      requested_date: resolved.date,
      latest: resolved.latest,
      date: resolved.date,
      keywords: [],
      articles: [],
      clusters: [],
      briefing: null,
      fetched_at: new Date().toISOString(),
    }
  }
  const keywords = buildKeywords(keywordsArg)
  const startTime = `${resolved.date} 00:00:00`
  const endTime = `${resolved.date} 24:00:00`
  const batch = await fetchBatch({
    keywords,
    keyword: keywords[0],
    startTime,
    endTime,
    apiKey, apiBase, proxyUrl,
    pageSize: Math.min(count, PAGE_SIZE),
  })
  const articles = sortByLikes(dedupeVideos(batch.map(normalizeVideo)), count)
  const clusters = clusterArticles(articles)
  const briefing = generateBriefing(clusters, articles)
  return {
    date: resolved.date,
    requested_date: date || resolved.date,
    keywords,
    articles,
    clusters,
    briefing,
    fetched_at: new Date().toISOString(),
  }
}

export { SOURCE_LABEL, formatDigestHtml }
