// 冒烟测试（离线）：假 RedFox batch 服务器 + 工具直调全链路（含日期拦截）+ 面板 API 全路由。
// 运行：npm run smoke
const { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const http = await import('node:http')

const tmp = mkdtempSync(join(tmpdir(), 'dsh-bili-smoke-'))
process.env.DSH_HOME = tmp
delete process.env.REDFOX_API_KEY
delete process.env.X_API_KEY

let failed = 0
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!cond) failed++
}

// ── 假 RedFox batch 服务器 ──
// 8 条视频：type/topic 标签齐备，互动量乱序，一条无 photoId 去重，两条重复
let lastPayload = null
const RAW = [
  { photoId: 'BV1a', title: 'AI大模型实操教程：从零微调', userName: 'UP主甲', authorId: 'u1', likeCount: 52000, commentCount: 8000, shareCount: 3000, type: '#AI,#AI大模型,#Prompt', topic: '#AI #大模型', coverUrl: 'http://i0.hdslb.com/c1.jpg', userHeadUrl: '', gmtCreate: '2026-11-11 10:00:00' },
  { photoId: 'BV1b', title: 'ComfyUI 工作流入门', userName: 'UP主乙', likeCount: 31000, commentCount: 1200, shareCount: 500, type: '#AI绘画,#AI教程', topic: '', coverUrl: 'http://i0.hdslb.com/c2.jpg', gmtCreate: '2026-11-11 11:00:00' },
  { photoId: 'BV1c', title: 'GPT-5 发布解读', userName: 'UP主甲', likeCount: 27000, commentCount: 9000, shareCount: 2000, type: '#AI热点', topic: '#GPT', coverUrl: '', gmtCreate: '2026-11-11 12:00:00' },
  { photoId: 'BV1d', title: 'Agent 智能体开发实战', userName: 'UP主丙', likeCount: 15000, commentCount: 800, shareCount: 400, type: '#AI大模型,#Agent', topic: '', coverUrl: 'http://i0.hdslb.com/c4.jpg', gmtCreate: '2026-11-11 13:00:00' },
  { photoId: 'BV1e', title: 'AI绘画提示词分享', userName: 'UP主乙', likeCount: 9000, commentCount: 300, shareCount: 100, type: '', topic: '#AI绘画', coverUrl: '', gmtCreate: '2026-11-11 14:00:00' },
  { photoId: 'BV1f', title: '另一个无标签视频', userName: 'UP主丁', likeCount: 500, commentCount: 10, shareCount: 2, type: '', topic: '', coverUrl: '', gmtCreate: '2026-11-11 15:00:00' },
  { photoId: 'BV1a', title: '重复视频（应去重）', userName: 'UP主甲', likeCount: 1, commentCount: 0, shareCount: 0, type: '', topic: '', gmtCreate: '2026-11-11 16:00:00' },
  { title: '无 photoId（应被过滤）', userName: 'UP主戊', likeCount: 99, commentCount: 0, shareCount: 0, gmtCreate: '2026-11-11 17:00:00' },
  { photoId: 'BV2a', title: '大模型部署指南', userName: 'UP主丙', likeCount: 8000, commentCount: 400, shareCount: 200, type: '#AI,#AI大模型', topic: '', gmtCreate: '2026-11-11 09:00:00' },
  { photoId: 'BV2b', title: '大模型选型对比', userName: 'UP主丁', likeCount: 7000, commentCount: 350, shareCount: 150, type: '#AI,#AI大模型', topic: '', gmtCreate: '2026-11-11 09:30:00' },
  { photoId: 'BV2c', title: 'ComfyUI 节点详解', userName: 'UP主乙', likeCount: 6000, commentCount: 250, shareCount: 120, type: '#AI绘画', topic: '', gmtCreate: '2026-11-11 09:40:00' },
  { photoId: 'BV2d', title: 'Midjourney 出图技巧', userName: 'UP主甲', likeCount: 5500, commentCount: 200, shareCount: 90, type: '#AI绘画', topic: '', gmtCreate: '2026-11-11 09:50:00' },
  { photoId: 'BV2e', title: 'AI热点周报', userName: 'UP主丙', likeCount: 4000, commentCount: 300, shareCount: 200, type: '#AI热点', topic: '', gmtCreate: '2026-11-11 10:10:00' },
  { photoId: 'BV2f', title: 'AI热点快讯', userName: 'UP主丁', likeCount: 3000, commentCount: 200, shareCount: 100, type: '#AI热点', topic: '', gmtCreate: '2026-11-11 10:20:00' },
  { photoId: 'BV2g', title: '无标签视频甲', userName: 'UP主甲', likeCount: 2000, commentCount: 50, shareCount: 20, type: '', topic: '', gmtCreate: '2026-11-11 10:30:00' },
  { photoId: 'BV2h', title: '无标签视频乙', userName: 'UP主乙', likeCount: 1500, commentCount: 30, shareCount: 10, type: '', topic: '', gmtCreate: '2026-11-11 10:40:00' },
]
const srv = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    const reply = (obj) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
    if (req.headers['x-api-key'] !== 'ak_smoke') return reply({ code: 3106, msg: 'bad key' })
    lastPayload = JSON.parse(body || '{}')
    if (lastPayload.endTime?.startsWith('2026-11-10')) return reply({ code: 2000, data: { list: [] } }) // 空数据日
    reply({ code: 2000, data: { list: RAW } })
  })
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
mkdirSync(join(tmp, 'bili-ai-feed'), { recursive: true })
writeFileSync(join(tmp, 'bili-ai-feed', 'settings.json'), JSON.stringify({ api_key: 'ak_smoke', api_base: `http://127.0.0.1:${srv.address().port}` }))

// ── 工具直调 ──
const { biliFeedTool } = await import('../src/host.js')
const call = async (args) => {
  try { return await biliFeedTool.execute(args, {}) } catch (e) { return { ok: false, summary: String(e?.message || e) } }
}
let fid
{
  const r = await call({ action: 'fetch', date: '2026-11-11' })
  check('fetch 入库', r.ok && r.summary.includes('feedId='), r.summary.slice(0, 60))
  fid = r.summary.match(/feedId=([\p{L}\p{N}-]+)/u)?.[1]
  check('fetch 分类概览表', r.data.includes('### 分类概览') && r.data.includes('| 分类 | 数量 | 占比 |'), '')
  check('fetch 六步聚类（多分类）', (r.data.match(/^\*\*.+\*\*（/gm) || []).length >= 3, '')
  check('fetch 情报报告六板块', r.data.includes('一、新兴起量信号') && r.data.includes('二、核心达人') && r.data.includes('六、跨平台对比建议'), '')
  check('fetch 调查报告带模式与引擎', r.data.includes('**调查模式**') && r.data.includes('**引擎组合**'), '')
  check('fetch 去重+过滤', r.data.includes('BV1a') && !r.data.includes('重复视频'), '')
  check('fetch 视频链接拼接', r.data.includes('bilibili.com/video/BV1a'), '')
  check('fetch 页脚', (r.footer || '').includes('2026-11-11') && (r.footer || '').includes(fid), (r.footer || '').slice(0, 80))
  check('batch payload 结构', lastPayload?.keywords?.[0] === 'AI' && lastPayload.source === 'B站AI信息源-dsh' && lastPayload.pageSize === 200, JSON.stringify(lastPayload || {}).slice(0, 80))
}
{
  // 日期拦截：无数据区间（未来日期）
  const r = await call({ action: 'fetch', date: '2099-01-01' })
  check('无数据日期拦截（不扣积分话术）', !r.ok && r.summary.includes('数据尚未更新') && r.summary.includes('是否需要查询'), r.summary.slice(0, 60))
  const r2 = await call({ action: 'fetch', date: '2099-01-01', confirmNewer: 'true' })
  check('确认后落最新可用日期', r2.ok && r2.summary.includes('feedId='), r2.summary.slice(0, 50))
}
{
  const r = await call({ action: 'fetch', date: '2026-11-10' })
  check('空数据如实说明', !r.ok && r.summary.includes('暂无内容'), r.summary.slice(0, 60))
  const r2 = await call({ action: 'fetch', keywords: 'Stable Diffusion,ComfyUI', date: '2026-11-11' })
  check('自定义关键词批量查询', r2.ok && r2.summary.includes('feedId=') && lastPayload.keywords.join(',') === 'Stable Diffusion,ComfyUI', '')
}
{
  const r = await call({ action: 'list' })
  check('list 日报列表', r.ok && r.data.split('\n').length >= 3, (r.data || '').split('\n')[0])
  const r2 = await call({ action: 'get', feedId: fid })
  check('get 补读条目', r2.ok && r2.data.includes('bilibili.com/video/BV1b'), '')
  const unknown = await call({ action: 'destroy' })
  check('未知 action 报错', !unknown.ok && unknown.summary.includes('只能是'), '')
}

// ── 面板 API ──
const { registerApi } = await import('../lib/api.js')
const { Writable } = await import('node:stream')
const { EventEmitter } = await import('node:events')
const routes = {}
registerApi({ get: () => undefined, webServer: { register: (r) => { routes[r.path] = r.handler } } }, { config: {} })
const req = async (method, path, body) => {
  const reqObj = new EventEmitter()
  reqObj.method = method
  reqObj.url = `/bili-ai-feed${path}`
  reqObj.headers = body ? { 'content-type': 'application/json', host: 'x', origin: 'http://x' } : { host: 'x' }
  const chunks = []
  const resObj = new Writable({ write(c, _e, cb) { chunks.push(c); cb() } })
  resObj.statusCode = 0
  resObj.writeHead = (code) => { resObj.statusCode = code }
  const done = new Promise((resolve) => {
    const origEnd = resObj.end.bind(resObj)
    resObj.end = (...args) => { origEnd(...args); resolve({ status: resObj.statusCode, json: (() => { try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return null } })(), text: () => Buffer.concat(chunks).toString('utf8') }) }
  })
  const p = routes['/bili-ai-feed'](reqObj, resObj)
  if (body) reqObj.emit('data', Buffer.from(JSON.stringify(body)))
  reqObj.emit('end')
  await p
  return done
}
{
  const cat = await req('GET', '/api/catalog')
  check('catalog：key/最新日期/历史', cat.status === 200 && cat.json.has_key && cat.json.latest_date && cat.json.feeds.length >= 3, `feeds=${cat.json?.feeds?.length}`)
  const blocked = await req('POST', '/api/feeds', { date: '2099-01-01' })
  check('面板日期拦截 409', blocked.status === 409 && blocked.json.blocked && blocked.json.latest, blocked.json?.error?.slice(0, 50))
  const panelFetch = await req('POST', '/api/feeds', { date: '2026-11-11', count: 50 })
  check('面板直查抓取+HTML落盘', panelFetch.status === 200 && panelFetch.json.ok && panelFetch.json.feed.total >= 10, `total=${panelFetch.json?.feed?.total}`)
  const one = await req('GET', `/api/feeds/${fid}`)
  check('日报详情带 raw', one.status === 200 && one.json.raw?.clusters?.length >= 3 && one.json.raw?.briefing?.investigation_reports?.length === 3, '')
  const rep = await req('GET', `/api/feeds/${fid}/report`)
  const html = rep.text ? rep.text() : ''
  check('HTML 日报关键元素', rep.status === 200 && html.includes('category-card') && html.includes('intelligence-section') && html.includes('i0.hdslb.com'), '')
  check('HTML 无 API Key 泄漏', !html.includes('ak_smoke') && !html.includes('{{API_KEY}}'), '')
  check('HTML 无占位残留', !html.includes('{{DATE}}') && !html.includes('{{CATEGORY_CARDS}}') && !html.includes('[object Object]') && !html.includes('>undefined<'), '')
  const del = await req('DELETE', `/api/feeds/${(cat.json.feeds.find(f => f.feed_id !== fid) || {}).feed_id}`)
  check('面板删记录', del.status === 200 && del.json.ok, '')
}
{
  const st = await req('GET', '/api/settings')
  check('settings GET 尾号', st.status === 200 && st.json.settings.has_key && st.json.settings.key_tail.length === 6, String(st.json.settings.key_tail))
  const bad = await req('POST', '/api/settings', { api_key: 'no-prefix' })
  check('settings 非 ak_ 拒绝', bad.status === 400, '')
}
{
  const idx = readFileSync(new URL('../lab/index.html', import.meta.url), 'utf8')
  check('lab 引用 scheme/app', idx.includes('app.js') && idx.includes('scheme.js'), '')
  const appjs = readFileSync(new URL('../lab/app.js', import.meta.url), 'utf8')
  check('lab 消息类型与 client 对齐', appjs.includes('bili-ai-feed:refresh') && appjs.includes('bili-ai-feed:start-ok'), '')
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  check('client 消息类型一致', client.includes('bili-ai-feed:refresh') && client.includes('bili-ai-feed:start-ok'), '')
  const skill = readFileSync(new URL('../skills/bili-ai-feed/SKILL.md', import.meta.url), 'utf8')
  check('技能快照带强制输出模板', skill.includes('唯一合法输出格式') && skill.includes('分类概览'), '')
}

srv.close()
rmSync(tmp, { recursive: true, force: true })
console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
