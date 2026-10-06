import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveOpenRouterApiKey } from './openrouter-env'

const previous = process.env.OPENROUTER_API_KEY

afterEach(() => {
  if (previous === undefined) delete process.env.OPENROUTER_API_KEY
  else process.env.OPENROUTER_API_KEY = previous
})

describe('resolveOpenRouterApiKey', () => {
  it('prefers OPENROUTER_API_KEY from env files over a stale process.env export', () => {
    const envDir = mkdtempSync(join(tmpdir(), 'outpoll-env-'))
    writeFileSync(join(envDir, '.env'), 'OPENROUTER_API_KEY=file-key\n')
    process.env.OPENROUTER_API_KEY = 'shell-key'
    expect(resolveOpenRouterApiKey('development', envDir)).toEqual({
      apiKey: 'file-key',
      misnamedOpenRouterKey: false,
    })
  })

  it('falls back to process.env when env files omit the key', () => {
    const envDir = mkdtempSync(join(tmpdir(), 'outpoll-env-'))
    writeFileSync(join(envDir, '.env'), 'VITE_DUNE_API_KEY=\n')
    process.env.OPENROUTER_API_KEY = 'shell-key'
    expect(resolveOpenRouterApiKey('development', envDir)).toEqual({
      apiKey: 'shell-key',
      misnamedOpenRouterKey: false,
    })
  })

  it('flags a misnamed VITE_OPENROUTER_API_KEY in env files', () => {
    const envDir = mkdtempSync(join(tmpdir(), 'outpoll-env-'))
    writeFileSync(join(envDir, '.env'), 'VITE_OPENROUTER_API_KEY=browser-key\n')
    delete process.env.OPENROUTER_API_KEY
    expect(resolveOpenRouterApiKey('development', envDir)).toEqual({
      apiKey: '',
      misnamedOpenRouterKey: true,
    })
  })
})
