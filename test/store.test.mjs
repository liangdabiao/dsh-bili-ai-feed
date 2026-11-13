import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-bili-store-'))
process.env.DSH_HOME = tmp
delete process.env.REDFOX_API_KEY

const { saveFeed, getMeta, getRaw, listFeeds, publicMeta, deleteFeed, getSettings, saveSettings, saveReportHtml, readReportHtml, resolveFeed } = await import('../lib/store.js')
const { formatDigestHtml } = await import('../lib/report.js')

test.after(() => { rmSync(tmp, { recursive: true, force: true }) })

const feedFixture = () => ({
  date: '2026-11-11',
  keywords: ['AI', '人工智能'],
  articles: [
    { photo_id: 'BV1', url: 'https://www.bilibili.com/video/BV1', title: '视频一', author: '甲', like_count: 5000, comment_count: 500, share_count: 100, cover_url: 'https://i0.hdslb.com/1.jpg', published_at: '2026-11-11 10:00:00' },
    { photo_id: 'BV2', url: 'https://www.bilibili.com/video/BV2', title: '视频二', author: '乙', like_count: 3000, comment_count: 300, share_count: 50, cover_url: '', published_at: '2026-11-11 11:00:00' },
  ],
  clusters: [{ category: '#AI大模型', count: 2, articles: [{ photo_id: 'BV1', url: 'https://www.bilibili.com/video/BV1', title: '视频一', author: '甲', like_count: 5000, comment_count: 500, share_count: 100, cover_url: 'https://i0.hdslb.com/1.jpg', published_at: '2026-11-11 10:00:00' }], total_likes: 8000, avg_likes: 4000 }],
  briefing: { top_topics: [{ topic: '#AI大模型', count: 2, ratio: 100, top_article: null }], emerging_topics: [], top_authors: [{ name: '甲', article_count: 1, total_likes: 5000, total_shares: 100 }], investigation_reports: [], cross_platform_tips: ['tip'] },
  fetched_at: '2026-11-12T16:00:00.000Z',
})

test('saveFeed/listFeeds/getMeta/getRaw 全链路', () => {
  const meta = saveFeed(feedFixture())
  assert.ok(meta.feed_id.startsWith('2026-11-11-'))
  assert.equal(meta.total, 2)
  assert.equal(meta.topic_count, 1)
  assert.deepEqual(meta.emerging, [])
  const got = getMeta(meta.feed_id)
  assert.equal(got.date, '2026-11-11')
  const raw = getRaw(meta.feed_id)
  assert.equal(raw.articles.length, 2)
  const pub = publicMeta(got)
  assert.equal(pub.has_report, false)
  const list = listFeeds()
  assert.equal(list.length, 1)
})

test('settings', () => {
  saveSettings({ api_key: 'ak_test', proxy_url: '' })
  assert.equal(getSettings().api_key, 'ak_test')
  saveSettings({ api_base: 'http://127.0.0.1:9' })
  assert.equal(getSettings().api_base, 'http://127.0.0.1:9')
})

test('resolveFeed：缺省最新', () => {
  const meta = resolveFeed(undefined)
  assert.equal(meta.date, '2026-11-11')
  assert.throws(() => resolveFeed('nope'), /不存在/)
})

test('report.html 落盘 + formatDigestHtml', () => {
  const meta = listFeeds()[0]
  const raw = getRaw(meta.feed_id)
  const html = formatDigestHtml({ dateStr: raw.date, articles: raw.articles, clusters: raw.clusters, briefing: raw.briefing, source: 'B站爆款雷达-dsh' })
  assert.ok(html.includes('category-card'))
  assert.ok(html.includes('视频一'))
  assert.ok(html.includes('i0.hdslb.com/1.jpg'))
  assert.ok(!html.includes('{{DATE}}') && !html.includes('{{CATEGORY_CARDS}}') && !html.includes('{{API_KEY}}') && !html.includes('[object Object]'))
  saveReportHtml(meta.feed_id, html)
  assert.ok(readReportHtml(meta.feed_id))
  assert.equal(publicMeta(getMeta(meta.feed_id)).has_report, true)
  assert.ok(readFileSync(readReportHtml(meta.feed_id), 'utf8').includes('情报调查报告'))
})

test('deleteFeed', () => {
  const meta = listFeeds()[0]
  assert.deepEqual(deleteFeed(meta.feed_id), { ok: true })
  assert.equal(listFeeds().length, 0)
  assert.equal(deleteFeed(meta.feed_id).ok, false)
})
