import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

/**
 * 创建一个有效的日期对象，如果输入无效则返回null
 */
export function createValidDate(timestamp: string | number | Date | undefined | null): Date | null {
  if (!timestamp) return null
  
  try {
    const date = new Date(timestamp)
    // 检查日期是否有效
    if (isNaN(date.getTime())) {
      return null
    }
    return date
  } catch (error) {
    return null
  }
}

/**
 * 安全的 formatDistanceToNow 包装器，处理无效日期
 */
export function safeFormatDistanceToNow(
  date: Date | string | number | null | undefined,
  options: {
    addSuffix?: boolean
    locale?: any
  } = { addSuffix: true, locale: zhCN }
): string {
  const validDate = createValidDate(date)
  
  if (!validDate) {
    return '时间未知'
  }
  
  try {
    return formatDistanceToNow(validDate, options)
  } catch (error) {
    console.warn('Date formatting error:', error)
    return '时间未知'
  }
}

/**
 * 安全的日期格式化，用于显示具体日期时间
 */
export function safeFormatDate(
  date: Date | string | number | null | undefined,
  fallback: string = '时间未知'
): string {
  const validDate = createValidDate(date)
  
  if (!validDate) {
    return fallback
  }
  
  try {
    return validDate.toLocaleString('zh-CN')
  } catch (error) {
    console.warn('Date formatting error:', error)
    return fallback
  }
}

/**
 * 检查日期是否有效
 */
export function isValidDate(date: Date | string | number | null | undefined): boolean {
  return createValidDate(date) !== null
}