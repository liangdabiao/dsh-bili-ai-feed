import test from 'node:test'
import assert from 'node:assert/strict'
import { extractKeywords, getArticleTags, clusterArticles } from '../lib/cluster.js'
import { latestAvailableDate, resolveTargetDate, isDateLikelyEmpty } from '../lib/dates.js'
import { normalizeVideo, dedupeVideos, sortByLikes, formatNumber } from '../lib/normalize.js'
import { generateBriefing, briefingToMarkdown } from '../lib/briefing.js'

const mk = (photoId, title, type, topic, like = 1000, author = 'UP主') => ({
  ...normalizeVideo({ photoId, title, type, topic, likeCount: like, commentCount: Math.floor(like / 10), shareCount: Math.floor(like / 20), userName: author, gmtCreate: '2026-11-11 10:00:00', coverUrl: `http://i0.hdslb.com/${photoId}.jpg` }),
})

test('extractKeywords：中文 2-4 字片段 + 停用词过滤（贪婪切分，上游同款行为）', () => {
  const kws = extractKeywords('大模型微调的教程，怎么入门实践')
  assert.ok(kws.length >= 1 && kws.length <= 5)
  // 纯停用词片段被过滤（如「的」「了」不会单独成段）
  assert.ok(kws.every((k) => k.length >= 2))
})

test('getArticleTags：type 优先 topic 补充，泛标签跳过', () => {
  const tags = getArticleTags({ type: '#AI,#AI大模型', topic: '#AI #豆包' })
  assert.deepEqual(tags, ['#AI大模型', '#豆包'])
})

test('clusterArticles：标签分组 + 小组合并 + 保底分类', () => {
  const articles = [
    mk('BV1', '大模型教程A', '#AI,#AI大模型', '', 5000),
    mk('BV2', '大模型教程B', '#AI,#AI大模型', '', 4000),
    mk('BV3', '大模型实战C', '#AI,#AI大模型', '', 3000),
    mk('BV4', 'AI绘画分享1', '#AI绘画', '', 2000),
    mk('BV5', 'AI绘画分享2', '#AI绘画', '', 1500),
    mk('BV6', 'AI绘画分享3', '#AI绘画', '', 1200),
    mk('BV7', '完全无标签', '', '', 800),
  ]
  const clusters = clusterArticles(articles)
  assert.ok(clusters.length >= 2)
  // 按条数降序
  const counts = clusters.map((c) => c.count)
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a))
  // 每类 top5 按点赞降序
  for (const c of clusters) {
    const likes = c.articles.map((a) => a.like_count)
    assert.deepEqual(likes, [...likes].sort((a, b) => b - a))
  }
  // 无标签进「其他」
  assert.ok(clusters.some((c) => c.category === '其他'))
})

test('clusterArticles：大组用第二标签拆分', () => {
  // 40 条全是大模型标签，其中一半有第二标签 #Agent
  const articles = []
  for (let i = 0; i < 40; i++) {
    articles.push(mk(`BV${i}`, `大模型视频${i}`, i % 2 === 0 ? '#AI,#AI大模型,#Agent' : '#AI,#AI大模型', '', 1000 + i))
  }
  const clusters = clusterArticles(articles)
  // 大组（>25）应拆出 #Agent 子组
  assert.ok(clusters.some((c) => c.category === '#Agent'))
})

test('dates：15:00 规则', () => {
  const after = new Date(2026, 10, 13, 15, 0)
  const before = new Date(2026, 10, 13, 14, 59)
  assert.equal(latestAvailableDate(after), '2026-11-12')
  assert.equal(latestAvailableDate(before), '2026-11-11')
})

test('dates：resolveTargetDate 拦截无数据区间', () => {
  const now = new Date(2026, 10, 13, 10, 0) // 15:00 前
  const r1 = resolveTargetDate('', now)
  assert.equal(r1.date, '2026-11-11')
  const r2 = resolveTargetDate('2026-11-13', now)
  assert.equal(r2.empty, true)
  assert.equal(r2.latest, '2026-11-11')
  const r3 = resolveTargetDate('2026-11-11', now)
  assert.ok(!r3.empty)
  assert.throws(() => resolveTargetDate('2026/11/11', now), /yyyy-MM-dd/)
})

test('normalize：BV 链接拼接 + http 封面升级 + engagement', () => {
  const v = normalizeVideo({ photoId: 'BV1x', title: ' T ', userName: '', likeCount: '100', commentCount: null, shareCount: 20, coverUrl: 'http://i0.hdslb.com/x.jpg' })
  assert.equal(v.url, 'https://www.bilibili.com/video/BV1x')
  assert.equal(v.author, '未知UP主')
  assert.equal(v.cover_url, 'https://i0.hdslb.com/x.jpg')
  assert.equal(v.engagement_num, 120)
})

test('normalize：去重与排序', () => {
  const items = [mk('BV3', 'c', '', '', 100), mk('BV1', 'a', '', '', 300), mk('BV2', 'b', '', '', 200), mk('BV1', 'dup', '', '', 999)]
  const deduped = dedupeVideos(items)
  assert.equal(deduped.length, 3)
  const sorted = sortByLikes(deduped)
  assert.equal(sorted[0].photo_id, 'BV1')
})

test('formatNumber', () => {
  assert.equal(formatNumber(52000), '5.2w')
  assert.equal(formatNumber(1500), '1.5k')
  assert.equal(formatNumber(999), '999')
})

test('briefing：新兴起量/核心达人/调查报告/跨平台建议', () => {
  const articles = [
    mk('BV1', 'GPT大模型解读', '#AI,#AI大模型', '', 60000, 'UP主甲'),
    mk('BV2', 'GPT使用技巧', '#AI,#AI大模型', '', 30000, 'UP主甲'),
    mk('BV3', 'GPT案例分享', '#AI,#AI大模型', '', 20000, 'UP主乙'),
    mk('BV4', '冷门新话题高互动', '#AI,#冷门话题', '', 2000, 'UP主丙'),
  ]
  const clusters = clusterArticles(articles)
  const briefing = generateBriefing(clusters, articles)
  assert.ok(briefing.top_topics.length >= 1)
  assert.ok(briefing.investigation_reports.length <= 3 && briefing.investigation_reports.length >= 1)
  // 大模型话题命中竞品情报调查
  const report = briefing.investigation_reports.find((r) => r.topic.includes('大模型'))
  assert.ok(report, 'TOP3 含大模型')
  assert.equal(report.mode, '竞品情报调查')
  assert.ok(report.engines.length >= 3)
  assert.ok(report.findings.some((f) => f.dimension === '头部内容'))
  assert.ok(report.conclusions.some((c) => ['confirmed', 'pending', 'single'].includes(c.status)))
  assert.ok(briefing.top_authors.some((a) => a.name === 'UP主甲'))
  assert.ok(briefing.cross_platform_tips.length >= 1)
  const md = briefingToMarkdown(briefing, articles)
  assert.ok(md.includes('一、新兴起量信号'))
  assert.ok(md.includes('六、跨平台对比建议'))
})
