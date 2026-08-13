/**
 * 解析 SKILL.md 字符串为 Skill 对象
 *
 * 格式：
 * ---
 * name: senior-backend
 * description: 资深后端工程师简历，侧重系统设计
 * ---
 * <主指令正文>
 *
 * <!-- reference: quantify-rules -->
 * <reference 内容>
 *
 * 不引 YAML 依赖，自写最小 frontmatter 解析（仅 name/description 单行；description: | 块标量可选）。
 * body 用 `<!-- reference: NAME -->` 标记切分 references。
 */
import type { Skill, SkillReference } from './types'

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MARKER_RE = /<!--\s*reference:\s*([a-z0-9_-]+)\s*-->/g

export function parseSkill(md: string, opts: { id?: string; builtin?: boolean } = {}): Skill {
  const text = md.replace(/\r\n/g, '\n')
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  if (!fmMatch) throw new Error('缺少 frontmatter（需以 --- 开头）')
  const { name, title, description } = parseFrontmatter(fmMatch[1])
  if (!name) throw new Error('frontmatter 缺少 name')
  if (!NAME_RE.test(name)) throw new Error(`name 需为 kebab-case（如 senior-backend），收到 "${name}"`)
  if (!description) throw new Error('frontmatter 缺少 description')

  const rest = text.slice(fmMatch[0].length)
  const { body, references } = splitReferences(rest)

  return {
    id: opts.id ?? name,
    name,
    title: title || name,
    description,
    body: body.trim(),
    references,
    builtin: opts.builtin ?? false,
  }
}

function parseFrontmatter(fm: string): { name: string; title: string; description: string } {
  let name = ''
  let title = ''
  let description = ''
  const lines = fm.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\w+)\s*:\s*(.*)$/)
    if (!m) continue
    const [, key, val] = m
    if (key === 'name') name = val.trim()
    else if (key === 'title') title = val.trim()
    else if (key === 'description') {
      if (val.trim() === '|' || val.trim() === '>') {
        const buf: string[] = []
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\s/.test(lines[j]) || lines[j].trim() === '') buf.push(lines[j].replace(/^ {2}/, ''))
          else break
        }
        description = buf.join('\n').trim()
      } else {
        description = val.trim()
      }
    }
  }
  return { name, title, description }
}

function splitReferences(rest: string): { body: string; references: SkillReference[] } {
  const marks: { name: string; markerStart: number; contentStart: number }[] = []
  MARKER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MARKER_RE.exec(rest)) !== null) {
    marks.push({ name: m[1], markerStart: m.index, contentStart: m.index + m[0].length })
  }
  if (marks.length === 0) return { body: rest, references: [] }
  const body = rest.slice(0, marks[0].markerStart)
  const references: SkillReference[] = marks.map((mk, i) => ({
    name: mk.name,
    content: rest.slice(mk.contentStart, i + 1 < marks.length ? marks[i + 1].markerStart : rest.length).trim(),
  }))
  return { body, references }
}
