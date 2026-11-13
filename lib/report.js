// HTML 日报渲染（移植自上游 generate_report/generate_category_cards/generate_intelligence_html）。
// 模板占位符：{{DATE}}/{{DATE_CN}}/{{TOTAL_COUNT}}/{{TOPIC_COUNT}}/{{TOP_AUTHOR}}/{{AVG_LIKES}}/{{TOTAL_LIKES}}/{{CATEGORY_CARDS}}/{{INTELLIGENCE_SECTION}}/{{TIMESTAMP}}/{{SOURCE}}
// 安全注意：不注入 {{API_KEY}}（上游占位无实际使用，避免 key 落盘）。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatNumber } from './normalize.js'
import { esc } from './html.js'

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), 'report_template.html')

const CREDIBILITY_LEVELS = {
  A: '官方/政府/权威媒体',
  B: '行业媒体/专业平台',
  C: '社交媒体/自媒体',
  D: '匿名/未验证来源',
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function dateCn(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return dateStr
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(dt.getTime())) return dateStr
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日 星期${WEEKDAYS[(dt.getDay() + 6) % 7]}`
}

function categoryCards(clusters) {
  return clusters.map((cluster, i) => {
    const articlesHtml = cluster.articles.map((v) => {
      const cover = v.cover_url
        ? `<img class="article-cover" src="${esc(v.cover_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : ''
      return `
                <div class="article-item">
                    ${cover}
                    <div class="article-info">
                        <a href="${esc(v.url)}" target="_blank" class="article-title">${esc(v.title)}</a>
                        <div class="article-meta">
                            <span class="author">${esc(v.author)}</span>
                            <span class="metrics">
                                <span class="metric">&#x1f517; ${formatNumber(v.share_count)}</span>
                                <span class="metric">&#x1f44d; ${formatNumber(v.like_count)}</span>
                                <span class="metric">&#x1f4ac; ${formatNumber(v.comment_count)}</span>
                            </span>
                        </div>
                    </div>
                </div>`
    }).join('')
    return `
        <div class="category-card reveal">
            <div class="card-header">
                <span class="card-number">${String(i + 1).padStart(2, '0')}</span>
                <h3 class="card-category">${esc(cluster.category)}</h3>
                <span class="card-count">${cluster.count} 条</span>
            </div>
            <div class="card-body">${articlesHtml}
            </div>
        </div>`
  }).join('')
}

function intelligenceHtml(briefing) {
  if (!briefing) return ''

  const topicsHtml = briefing.top_topics.map((topic, i) => {
    const topArt = topic.top_article
    return `
                <div class="intel-rank-item">
                    <span class="intel-rank-num">${i + 1}</span>
                    <div class="intel-rank-info">
                        <span class="intel-rank-topic">${esc(topic.topic)}</span>
                        <span class="intel-rank-detail">占比 ${topic.ratio}% · ${topic.count}条 · 头部: ${esc(topArt ? String(topArt.title).slice(0, 50) : '-')}</span>
                    </div>
                    <span class="intel-rank-metric">${topArt ? formatNumber(topArt.like_count) : '-'} 点赞</span>
                </div>`
  }).join('')

  const emergingHtml = briefing.emerging_topics.map((topic) => `
                <div class="intel-emerging-item">
                    <span class="intel-emerging-badge">起量信号</span>
                    <span class="intel-emerging-topic">${esc(topic.topic)}</span>
                    <span class="intel-emerging-detail">${topic.count}条 · 均互动${topic.avg_engagement}+</span>
                </div>`).join('')

  const emergingSection = emergingHtml ? `
        <div class="intel-subsection">
            <h4 class="intel-subtitle">新兴起量信号</h4>
            <div class="intel-emerging-list">${emergingHtml}
            </div>
        </div>` : ''

  const authorsHtml = briefing.top_authors.map((author) => `
                <div class="intel-author-item">
                    <span class="intel-author-name">@${esc(author.name)}</span>
                    <span class="intel-author-stats">${author.article_count}条 · 总赞${formatNumber(author.total_likes)} · 总分享${formatNumber(author.total_shares)}</span>
                </div>`).join('')

  const authorsSection = authorsHtml ? `
        <div class="intel-subsection">
            <h4 class="intel-subtitle">核心达人</h4>
            <div class="intel-author-list">${authorsHtml}
            </div>
        </div>` : ''

  const reportsHtml = briefing.investigation_reports.map((report) => {
    const findingsRows = report.findings.map((f) => `
                        <tr>
                            <td>${esc(f.dimension)}</td>
                            <td>${esc(f.discovery)}</td>
                            <td>${esc(f.source)}</td>
                            <td><span class="intel-cred-badge intel-cred-${esc(String(f.credibility).toLowerCase())}">${esc(String(f.credibility))}级</span></td>
                        </tr>`).join('')
    const icons = { confirmed: '✅', pending: '⚠️', denied: '❌', single: '🔍' }
    const cssClass = { confirmed: 'intel-conclusion-confirmed', pending: 'intel-conclusion-pending', denied: 'intel-conclusion-denied', single: 'intel-conclusion-single' }
    const conclusionItems = report.conclusions.map((c) =>
      `<li class="intel-conclusion-item ${cssClass[c.status] || ''}">${icons[c.status] || '·'} ${esc(c.text)}</li>`).join('')
    return `
        <div class="intel-report-card reveal">
            <div class="intel-report-head">
                <span class="intel-report-topic">${esc(report.topic)}</span>
                <span class="intel-report-mode">${esc(report.mode)}</span>
                <span class="intel-report-engines">${esc(report.engines.join(' + '))}</span>
            </div>
            <div class="intel-report-body">
                <div class="intel-report-scenario">📋 调查场景: ${esc(report.scenario)}</div>
                <table class="intel-findings-table">
                    <thead><tr><th>维度</th><th>发现</th><th>来源</th><th>可信度</th></tr></thead>
                    <tbody>${findingsRows}
                    </tbody>
                </table>
                <div class="intel-conclusion-title">关键结论</div>
                <ul class="intel-conclusion-list">${conclusionItems}
                </ul>
            </div>
        </div>`
  }).join('')

  const crossHtml = briefing.cross_platform_tips.map((tip) => `<div class="intel-cross-tip">${esc(tip)}</div>`).join('')
  const crossSection = crossHtml ? `
        <div class="intel-subsection">
            <h4 class="intel-subtitle">跨平台对比建议</h4>
            <div class="intel-cross-list">${crossHtml}
            </div>
        </div>` : ''

  const credRefItems = Object.entries(CREDIBILITY_LEVELS).map(([level, desc]) => `
            <div class="intel-cred-ref-item">
                <span class="intel-cred-badge intel-cred-${level.toLowerCase()}">${level}级</span>
                <span class="intel-cred-ref-label">${desc}</span>
            </div>`).join('')

  return `
    <div class="intelligence-section reveal">
        <div class="intel-header">
            <h2 class="intel-title">情报调查报告</h2>
            <span class="intel-subtitle-badge">基于智能情报调查员 · 多源交叉验证</span>
        </div>

        <div class="intel-body">
            <div class="intel-subsection">
                <h4 class="intel-subtitle">热度TOP话题</h4>
                <div class="intel-rank-list">${topicsHtml}
                </div>
            </div>

            ${emergingSection}

            ${authorsSection}

            <div class="intel-subsection">
                <h4 class="intel-subtitle">TOP话题调查报告</h4>
                ${reportsHtml}
            </div>

            ${crossSection}

            <div class="intel-subsection">
                <h4 class="intel-subtitle">可信度标注规范</h4>
                <div class="intel-cred-ref">${credRefItems}
                </div>
            </div>
        </div>
    </div>`
}

export function formatDigestHtml({ dateStr, articles, clusters, briefing, source }) {
  let template
  try {
    template = readFileSync(TEMPLATE, 'utf8')
  } catch (err) {
    throw new Error(`无法读取模板文件 ${TEMPLATE}: ${err.message}`)
  }
  const total = articles.length
  const totalLikes = articles.reduce((n, a) => n + a.like_count, 0)
  const avgLikes = total ? Math.floor(totalLikes / total) : 0
  const authorCounter = new Map()
  for (const a of articles) authorCounter.set(a.author, (authorCounter.get(a.author) || 0) + 1)
  const topAuthor = [...authorCounter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '-'

  const html = template
    .replaceAll('{{DATE}}', esc(dateStr))
    .replaceAll('{{DATE_CN}}', esc(dateCn(dateStr)))
    .replaceAll('{{TOTAL_COUNT}}', String(total))
    .replaceAll('{{TOPIC_COUNT}}', String(clusters.length))
    .replaceAll('{{TOP_AUTHOR}}', esc(topAuthor))
    .replaceAll('{{AVG_LIKES}}', formatNumber(avgLikes))
    .replaceAll('{{TOTAL_LIKES}}', formatNumber(totalLikes))
    .replaceAll('{{CATEGORY_CARDS}}', categoryCards(clusters))
    .replaceAll('{{INTELLIGENCE_SECTION}}', intelligenceHtml(briefing))
    .replaceAll('{{TIMESTAMP}}', esc(new Date().toISOString().replace('T', ' ').slice(0, 19)))
    .replaceAll('{{API_KEY}}', '')
    .replaceAll('{{SOURCE}}', esc(source))
  return html
}
