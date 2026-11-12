// 条目清洗：B站视频字段统一（链接拼接、null 兜底、http 封面升级 https）。
const pad = (n) => String(n).padStart(2, '0')

export function formatNumber(n) {
  const num = Number(n) || 0
  if (num >= 10000) return `${(num / 10000).toFixed(1)}w`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
  return String(num)
}

function httpsUrl(u) {
  const s = String(u || '').trim()
  return /^https?:\/\//.test(s) ? s.replace(/^http:\/\//, 'https://') : ''
}

export function normalizeVideo(item = {}) {
  const photoId = String(item.photoId || '').trim()
  const like = Number(item.likeCount) || 0
  const comment = Number(item.commentCount) || 0
  const share = Number(item.shareCount) || 0
  const gmt = String(item.gmtCreate ?? '') || ''
  return {
    photo_id: photoId,
    url: photoId ? `https://www.bilibili.com/video/${photoId}` : '',
    title: String(item.title || '').trim() || '无标题',
    author: String(item.userName || '').trim() || '未知UP主',
    author_id: String(item.authorId || '').trim(),
    avatar_url: httpsUrl(item.userHeadUrl),
    cover_url: httpsUrl(item.coverUrl),
    like_count: like,
    comment_count: comment,
    share_count: share,
    engagement_num: like + comment + share,
    type: String(item.type ?? '').trim(),
    topic: String(item.topic ?? '').trim(),
    published_at: gmt,
    published_date: /^\d{4}-\d{2}-\d{2}/.test(gmt) ? gmt.slice(0, 10) : '',
  }
}

export function dedupeVideos(videos) {
  const seen = new Set()
  return videos.filter((v) => {
    if (!v.photo_id || seen.has(v.photo_id)) return false
    seen.add(v.photo_id)
    return true
  })
}

export function sortByLikes(videos, topN = 200) {
  return [...videos].sort((a, b) => b.like_count - a.like_count).slice(0, topN)
}
