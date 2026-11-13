// 情报调查 briefing（移植自上游 generate_intelligence_briefing/_derive_findings/_derive_conclusions）。
// 确定性推导：热度TOP话题 / 新兴起量信号 / 核心达人 / 话题调查报告（发现+结论） / 跨平台建议。
import { formatNumber } from './normalize.js'
import { extractKeywords } from './cluster.js'

const SCENARIO_ENGINES = {
  '产品竞品分析': ['Baidu', 'Google', 'WeChat', 'DuckDuckGo'],
  '热点事件追踪': ['Baidu', 'Toutiao', 'Google', 'WeChat'],
  '人物背景验证': ['Baidu', 'Google', 'DuckDuckGo'],
  '用户口碑收集': ['WeChat', 'Toutiao', 'DuckDuckGo', 'Brave'],
  '技术趋势调查': ['DuckDuckGo', 'Google', 'Brave'],
  '市场数据验证': ['Google', 'Baidu', 'Bing INT'],
}

const TOPIC_MODE_MAP = [
  ['大模型', '竞品情报调查', '产品竞品分析'],
  ['GPT', '竞品情报调查', '产品竞品分析'],
  ['ChatGPT', '竞品情报调查', '产品竞品分析'],
  ['Agent', '竞品情报调查', '技术趋势调查'],
  ['绘画', '竞品情报调查', '用户口碑收集'],
  ['创作', '舆情事件调查', '用户口碑收集'],
  ['动画', '竞品情报调查', '用户口碑收集'],
  ['教程', '技术趋势调查', '技术趋势调查'],
  ['教学', '技术趋势调查', '技术趋势调查'],
  ['Prompt', '技术趋势调查', '产品竞品分析'],
]

function matchMode(topicName) {
  for (const [kw, mode, scenario] of TOPIC_MODE_MAP) {
    if (topicName.includes(kw)) return { mode, scenario }
  }
  return { mode: '舆情事件调查', scenario: '热点事件追踪' }
}

// 从视频数据中提取调查发现（头部内容/用户关注/互动特征/核心作者）
function deriveFindings(cluster) {
  const findings = []
  const arts = cluster.articles

  if (arts.length) {
    const top = arts[0]
    findings.push({
      dimension: '头部内容',
      discovery: `${String(top.title).slice(0, 40)} — ${formatNumber(top.like_count)}赞 ${formatNumber(top.comment_count)}评`,
      source: 'B站视频数据',
      credibility: 'B',
    })
  }

  const titleKw = new Map()
  for (const a of arts) {
    for (const seg of extractKeywords(a.title)) {
      if (seg.length >= 2) titleKw.set(seg, (titleKw.get(seg) || 0) + 1)
    }
  }
  if (titleKw.size) {
    const topKws = [...titleKw.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kw]) => kw).join('、')
    findings.push({ dimension: '用户关注', discovery: `高频关键词：${topKws}`, source: '标题关键词分析', credibility: 'C' })
  }

  const totalLikes = arts.reduce((n, a) => n + a.like_count, 0)
  const totalComments = arts.reduce((n, a) => n + a.comment_count, 0)
  if (totalLikes > 0) {
    const ratio = `${((totalComments / totalLikes) * 100).toFixed(1)}%`
    findings.push({
      dimension: '互动特征',
      discovery: `总赞${formatNumber(totalLikes)}，评论率${ratio}，${totalComments / Math.max(totalLikes, 1) > 0.15 ? '讨论活跃' : '以点赞为主'}`,
      source: '互动数据分析',
      credibility: 'B',
    })
  }

  const authorCounter = new Map()
  for (const a of arts) {
    if (a.author) authorCounter.set(a.author, (authorCounter.get(a.author) || 0) + 1)
  }
  if (authorCounter.size) {
    const [name, count] = [...authorCounter.entries()].sort((a, b) => b[1] - a[1])[0]
    findings.push({ dimension: '核心作者', discovery: `@${name} 贡献${count}条作品`, source: '作者统计', credibility: 'B' })
  }

  return findings
}

function deriveConclusions(cluster, findings) {
  const conclusions = []
  const topicName = cluster.category.replace(/^#/, '')
  const arts = cluster.articles

  if (arts.length && arts[0].like_count > 50000) {
    conclusions.push({ status: 'confirmed', text: `${topicName}话题有强流量表现，头部内容互动量${formatNumber(arts[0].like_count)}+` })
  }
  for (const f of findings) {
    if (f.dimension === '用户关注' && f.discovery.includes('高频关键词')) {
      conclusions.push({ status: 'pending', text: `用户关注方向需跨平台验证：${f.discovery.replace('高频关键词：', '')}` })
    }
  }
  if (cluster.count <= 15) {
    conclusions.push({ status: 'single', text: `${topicName}话题样本量较少（${cluster.count}条），趋势待观察` })
  }
  if (!conclusions.length) {
    conclusions.push({ status: 'confirmed', text: `${topicName}话题内容稳定，无异常信号` })
  }
  return conclusions
}

export function generateBriefing(clusters, articles) {
  if (!clusters?.length) return null
  const total = articles.length

  // 1. 热度 TOP 话题
  const topTopics = clusters.slice(0, 5).map((cluster) => ({
    topic: cluster.category,
    count: cluster.count,
    ratio: total ? Math.round((cluster.count / total) * 1000) / 10 : 0,
    top_article: cluster.articles[0] || null,
  }))

  // 2. 新兴起量话题（占比 <10% 但篇均互动 >1000）
  const emergingTopics = []
  for (const cluster of clusters) {
    if (cluster.count < total * 0.1 && cluster.articles.length) {
      const avg = cluster.articles.reduce((n, a) => n + a.like_count + a.comment_count, 0) / Math.max(cluster.articles.length, 1)
      if (avg > 1000) {
        emergingTopics.push({ topic: cluster.category, count: cluster.count, avg_engagement: Math.floor(avg) })
      }
    }
  }

  // 3. 核心达人
  const authorArts = new Map()
  for (const a of articles) {
    const name = a.author || '未知'
    if (!authorArts.has(name)) authorArts.set(name, [])
    authorArts.get(name).push(a)
  }
  const topAuthors = [...authorArts.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([name, arts]) => ({
      name,
      article_count: arts.length,
      total_likes: arts.reduce((n, a) => n + a.like_count, 0),
      total_shares: arts.reduce((n, a) => n + a.share_count, 0),
    }))

  // 4. TOP3 话题调查报告
  const investigationReports = clusters.slice(0, 3).map((cluster) => {
    const { mode, scenario } = matchMode(cluster.category.replace(/^#/, ''))
    const findings = deriveFindings(cluster)
    return {
      topic: cluster.category,
      mode,
      scenario,
      engines: SCENARIO_ENGINES[scenario] || SCENARIO_ENGINES['热点事件追踪'],
      findings,
      conclusions: deriveConclusions(cluster, findings),
    }
  })

  // 5. 跨平台建议
  const crossPlatformTips = topTopics.slice(0, 3).map((t) =>
    `「${t.topic.replace(/^#/, '')}」— 建议同步关注抖音、小红书、公众号同话题热度，用 Baidu+WeChat+Toutiao 三引擎追踪国内全平台动态`)

  return { top_topics: topTopics, emerging_topics: emergingTopics, top_authors: topAuthors, investigation_reports: investigationReports, cross_platform_tips: crossPlatformTips }
}

// 终端/模型可读的 briefing Markdown（对齐上游强制输出模板的信息量）
export function briefingToMarkdown(briefing, articles) {
  if (!briefing) return ''
  const lines = []
  lines.push('**一、新兴起量信号**', '')
  if (briefing.emerging_topics.length) {
    for (const t of briefing.emerging_topics) {
      lines.push(`- 🔥 **${t.topic}** — 仅${t.count}条但篇均互动${formatNumber(t.avg_engagement)}+，起量信号值得关注`)
    }
  } else {
    lines.push('暂无新兴起量信号')
  }
  lines.push('', '**二、核心达人**', '')
  if (briefing.top_authors.length) {
    lines.push('| 达人 | 作品数 | 总赞 | 亮点 |', '|------|--------|------|------|')
    for (const a of briefing.top_authors) {
      lines.push(`| @${a.name} | ${a.article_count}条 | ${formatNumber(a.total_likes)} | ${a.total_shares >= 1000 ? `分享${formatNumber(a.total_shares)}` : '高产UP'} |`)
    }
  } else {
    lines.push('暂无核心达人数据')
  }
  briefing.investigation_reports.forEach((report, i) => {
    lines.push('', `**${['三', '四', '五'][i] || '六'}、${report.topic} 调查报告**`, '')
    lines.push(`**调查模式**：${report.mode}`)
    lines.push(`**引擎组合**：${report.engines.join(' + ')}`, '')
    lines.push('| 维度 | 发现 | 来源 | 可信度 |', '|------|------|------|--------|')
    for (const f of report.findings) {
      lines.push(`| ${f.dimension} | ${f.discovery} | ${f.source} | ${f.credibility}级 |`)
    }
    lines.push('')
    lines.push(`**关键结论**：${report.conclusions.map((c) => {
      const mark = c.status === 'confirmed' ? '✅' : c.status === 'pending' ? '⚠️' : '🔍'
      return `${mark} ${c.text}`
    }).join('；')}`)
  })
  lines.push('', '**六、跨平台对比建议**', '')
  lines.push(...(briefing.cross_platform_tips.length ? briefing.cross_platform_tips.map((t) => `- **${t}**`) : ['- 暂无跨平台对比建议']))
  return lines.join('\n')
}
