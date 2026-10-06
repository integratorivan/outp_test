import { mkdir, rename, writeFile } from 'node:fs/promises'
import { loadEnv } from 'vite'

import { fetchDuneVolumeSnapshot } from '../src/shared/api/dune/client'
import { DuneApiService } from '../src/shared/api/dune/service'
import { readAppConfig } from '../src/shared/config/schema'
import { volumeSnapshotSchema, type Platform } from '../src/entities/volume/model'

async function updateFixtures() {
  const config = readAppConfig({ ...loadEnv('development', process.cwd(), 'VITE_'), VITE_DATA_MODE: 'dune' })
  if (config.dataMode !== 'dune') throw new Error('Fixture export requires Dune configuration')

  const service = new DuneApiService({ baseUrl: config.duneBaseUrl, apiKey: config.duneApiKey })
  const platforms: Platform[] = ['kalshi', 'polymarket']
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort())
  const snapshots = await Promise.all(platforms.map(async (platform) => {
    console.info(`Downloading ${platform} from Dune...`)
    return volumeSnapshotSchema.parse(await fetchDuneVolumeSnapshot({
      platform, queryId: config.queryIds[platform], service, signal: controller.signal,
    }))
  }))

  const directory = 'src/shared/data/fixtures'
  await mkdir(directory, { recursive: true })
  for (const snapshot of snapshots) {
    const path = `${directory}/${snapshot.platform}-volume.json`
    await writeFile(`${path}.tmp`, `${JSON.stringify(snapshot)}\n`)
    await rename(`${path}.tmp`, path)
    const days = snapshot.rows.map((row) => row.day).sort()
    console.info(`${snapshot.platform}: ${snapshot.rows.length} rows, ${days[0] ?? 'empty'}..${days.at(-1) ?? 'empty'}, calculated ${snapshot.calculatedAt}`)
  }
}

try {
  await updateFixtures()
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Fixture export failed')
  process.exitCode = 1
}
