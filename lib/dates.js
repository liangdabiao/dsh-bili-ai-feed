// 日期处理：数据每日 15:00 更新前一天（15:00 前最新可用 = T-2，之后 = T-1）。
// 核心纪律（移植自上游第零步）：目标日期无数据时禁止自动调用接口——调用方必须先向用户确认。
const pad = (n) => String(n).padStart(2, '0')

export const DATA_UPDATE_HOUR = 15

export function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 最新有数据的日期
export function latestAvailableDate(now = new Date()) {
  const offset = now.getHours() >= DATA_UPDATE_HOUR ? 1 : 2
  return fmtDate(new Date(now.getTime() - offset * 86400_000))
}

// 目标日期是否大概率无数据（晚于最新可用日期即无数据区间）
export function isDateLikelyEmpty(dateStr, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim())
  if (!m) return false
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59)
  return target > new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59) || target > (() => {
    const [y, mo, d] = latestAvailableDate(now).split('-').map(Number)
    return new Date(y, mo - 1, d, 23, 59, 59)
  })()
}

/**
 * 解析目标日期：
 * - 空 / 'latest' → 最新可用日期（--latest 语义：跳过无数据区间，不扣积分）
 * - 具体日期 → 校验格式；落在无数据区间返回 { empty: true, latest }
 * @returns {{ date: string, empty?: boolean, latest: string }}
 */
export function resolveTargetDate(input, now = new Date()) {
  const raw = String(input || '').trim()
  const latest = latestAvailableDate(now)
  if (!raw || raw === 'latest') return { date: latest, latest }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`日期格式应为 yyyy-MM-dd（收到「${raw}」）`)
  }
  const [y, m, d] = raw.split('-').map(Number)
  const probe = new Date(y, m - 1, d)
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    throw new Error(`日期不存在：${raw}`)
  }
  return { date: raw, empty: isDateLikelyEmpty(raw, now), latest }
}
