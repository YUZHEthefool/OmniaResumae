/**
 * 剪贴板复制工具
 *
 * 优先用 navigator.clipboard.writeText（异步、安全上下文 https/localhost），
 * 失败（非安全上下文如 http 站点、或被权限策略拒绝）回退到 execCommand('copy')：
 * 临时插一个隐藏 textarea 选中复制后移除。返回是否成功。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 回退到 execCommand */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.left = '-9999px'
    ta.setAttribute('readonly', '')
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
