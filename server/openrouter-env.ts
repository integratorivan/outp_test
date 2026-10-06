import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const name = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[name] = value
  }
  return out
}

/** Same merge order as Vite: later files override earlier ones. */
export function loadOpenRouterFromEnvFiles(mode: string, envDir: string) {
  const files = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
  let merged: Record<string, string> = {}
  for (const file of files) {
    merged = { ...merged, ...parseEnvFile(resolve(envDir, file)) }
  }
  return {
    openRouterApiKey: merged.OPENROUTER_API_KEY?.trim() ?? '',
    viteOpenRouterApiKey: merged.VITE_OPENROUTER_API_KEY?.trim() ?? '',
  }
}

/**
 * OPENROUTER_API_KEY from env files wins over process.env.
 * loadEnv() does the opposite and often leaves a stale shell export in charge.
 */
export function resolveOpenRouterApiKey(mode: string, envDir: string) {
  const fromFiles = loadOpenRouterFromEnvFiles(mode, envDir)
  const fromProcess = process.env.OPENROUTER_API_KEY?.trim() ?? ''
  const apiKey = fromFiles.openRouterApiKey || fromProcess
  const misnamedOpenRouterKey = !apiKey && Boolean(fromFiles.viteOpenRouterApiKey)
  return { apiKey, misnamedOpenRouterKey }
}
