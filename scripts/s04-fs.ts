import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import type { SrcFile } from './s04-lib.ts'

// Reads all files with the given extensions under `dir` (posix paths relative to repo root).
export function readTree(dir: string, exts: string[]): SrcFile[] {
  const out: SrcFile[] = []
  if (!existsSync(dir)) return out
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const full = `${current}/${name}`
      if (statSync(full).isDirectory()) walk(full)
      else if (exts.some((e) => name.endsWith(e))) out.push({ path: full.replace(/\\/g, '/'), text: readFileSync(full, 'utf8') })
    }
  }
  walk(dir.replace(/\\/g, '/'))
  return out
}
