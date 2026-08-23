/**
 * 可分享只读链接：把整份简历压缩编码进 URL hash，打开即只读预览（可切模板/导出）。
 *
 * 纯前端、无后端、无新依赖：
 * - 压缩用浏览器原生 CompressionStream('deflate-raw')（2026 主流浏览器支持），
 *   再 base64url 编码进 #r=... 。相比裸 encodeURIComponent(JSON) 显著更短。
 * - 解码用 DecompressionStream 逆操作，再 validateAIResume 校验+补默认，防篡改/损坏致渲染崩溃。
 * 密钥从不进入分享链接（密钥在 settingsStore，与 Resume 数据分离）。
 */
import type { Resume } from '@/types/resume'
import { validateAIResume } from '@/schema/validate'

function base64urlFromBytes(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function bytesFromBase64url(s: string): Uint8Array {
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deflate(raw: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(raw)
  const cs = new CompressionStream('deflate-raw')
  const w = cs.writable.getWriter()
  w.write(bytes as unknown as BufferSource)
  w.close()
  const buf = await new Response(cs.readable).arrayBuffer()
  return new Uint8Array(buf)
}

async function inflate(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('deflate-raw')
  const w = ds.writable.getWriter()
  w.write(bytes as unknown as BufferSource)
  w.close()
  const buf = await new Response(ds.readable).arrayBuffer()
  return new TextDecoder().decode(buf)
}

/** 把简历编码为 hash 片段（不含 #）：'r=....' */
export async function encodeResumeToHash(resume: Resume): Promise<string> {
  const compressed = await deflate(JSON.stringify(resume))
  return 'r=' + base64urlFromBytes(compressed)
}

/** 由 hash 片段（'r=....' 或纯 base64url）解码出简历；失败抛错 */
export async function decodeResumeFromHash(part: string): Promise<Resume> {
  const eq = part.indexOf('=')
  const b64 = eq >= 0 ? part.slice(eq + 1) : part
  if (!b64) throw new Error('empty')
  const json = await inflate(bytesFromBase64url(b64))
  return validateAIResume(JSON.parse(json))
}

/** 拼成可分享的完整 URL */
export function shareUrlFromHash(hash: string): string {
  return `${location.origin}${location.pathname}#${hash}`
}
