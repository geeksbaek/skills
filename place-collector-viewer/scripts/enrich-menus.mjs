#!/usr/bin/env node

import { readdir, readFile, rename, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const ENDPOINT = "https://pcmap-api.place.naver.com/graphql"
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const execFileAsync = promisify(execFile)
const QUERY = `query getPlaceMenus($input: PlaceDetailInput) {
  placeDetail(input: $input) {
    base { id name }
    menuSource { name link clickCode }
    menus(source: [tpirates]) {
      name price recommend nameForBlogReview description id index
    }
    baemin {
      menuGroups {
        order id name isRepresentative
        menus {
          id name desc price source isRepresentative menuId
        }
      }
      menus {
        id name desc price source isRepresentative menuId
      }
    }
  }
}`

function parseArgs(argv) {
  const options = {
    batchSize: 20,
    delayMs: 220,
    checkpointEvery: 2000,
    force: false,
    syncAssets: false,
    cdpPort: null,
    files: [],
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === "--force") options.force = true
    else if (arg === "--sync-assets") options.syncAssets = true
    else if (arg === "--cdp") options.cdpPort = Number(argv[++index])
    else if (arg === "--batch-size") options.batchSize = Number(argv[++index])
    else if (arg === "--delay-ms") options.delayMs = Number(argv[++index])
    else if (arg === "--checkpoint-every") options.checkpointEvery = Number(argv[++index])
    else if (arg === "--help" || arg === "-h") options.help = true
    else options.files.push(resolve(arg))
  }

  for (const [name, value] of [
    ["batch-size", options.batchSize],
    ["delay-ms", options.delayMs],
    ["checkpoint-every", options.checkpointEvery],
  ]) {
    if (!Number.isFinite(value) || value < 1) throw new Error(`--${name} must be a positive number`)
  }
  if (options.cdpPort != null && (!Number.isInteger(options.cdpPort) || options.cdpPort < 1 || options.cdpPort > 65535)) {
    throw new Error("--cdp must be a valid port number")
  }

  return options
}

function printHelp() {
  console.log(`Usage: node scripts/enrich-menus.mjs [options] [data.json ...]

Fetch every place's Naver and Baemin menu metadata and merge it into the JSON files.
When no files are provided, viewer-app/public/data/*.json is used.

Options:
  --batch-size N        GraphQL operations per request (default: 20)
  --delay-ms N          Delay between successful requests (default: 220)
  --checkpoint-every N  Save progress after N places (default: 2000)
  --force               Refetch places that already have menusFetchedAt
  --sync-assets         Copy final datasets to assets/data
  --cdp N               Run GraphQL inside agent-browser Chrome on CDP port N
  -h, --help            Show this help`)
}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

function compactMenu(menu, source, group = null) {
  const normalized = {
    id: String(menu.id || menu.menuId || ""),
    name: String(menu.name || ""),
    price: menu.price ?? "",
    description: menu.description ?? menu.desc ?? "",
    source,
  }

  if (menu.nameForBlogReview && menu.nameForBlogReview !== menu.name) {
    normalized.nameForBlogReview = menu.nameForBlogReview
  }
  if (menu.isRepresentative || menu.recommend) normalized.isRepresentative = true
  if (Number.isFinite(menu.index)) normalized.index = menu.index

  if (group) {
    normalized.groupId = group.id || ""
    normalized.groupName = group.name || ""
  }

  return normalized
}

function compactStoredMenus(datasets) {
  for (const dataset of datasets) {
    for (const record of Object.values(dataset.data)) {
      if (!Array.isArray(record?.menus)) continue
      record.menus = record.menus.map((menu) => compactMenu(
        menu,
        menu?.source || "naver",
        menu?.groupId || menu?.groupName ? { id: menu.groupId, name: menu.groupName } : null
      ))
    }
  }
}

function normalizeMenus(detail) {
  const menus = []
  const seen = new Set()

  const append = (items, source, group = null) => {
    for (const menu of Array.isArray(items) ? items : []) {
      if (!menu?.name) continue
      const key = [source, group?.id || "", menu.id || menu.menuId || "", menu.name, menu.price].join("|")
      if (seen.has(key)) continue
      seen.add(key)
      menus.push(compactMenu(menu, source, group))
    }
  }

  append(detail?.menus, "naver")
  for (const group of detail?.baemin?.menuGroups || []) append(group.menus, "baemin", group)
  append(detail?.baemin?.menus, "baemin")
  return menus
}

async function defaultDataFiles() {
  const dataDir = join(PROJECT_ROOT, "viewer-app/public/data")
  return (await readdir(dataDir))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(dataDir, name))
}

async function loadDatasets(paths) {
  const datasets = []
  for (const path of paths) {
    const parsed = JSON.parse(await readFile(path, "utf8"))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${path}: JSON root must be an object keyed by placeId`)
    }
    datasets.push({ path, data: parsed })
  }
  return datasets
}

async function writeJsonAtomic(path, data) {
  const tempPath = join(dirname(path), `.${basename(path)}.menus.tmp`)
  await writeFile(tempPath, JSON.stringify(data), "utf8")
  await rename(tempPath, path)
}

async function saveDatasets(datasets) {
  for (const dataset of datasets) await writeJsonAtomic(dataset.path, dataset.data)
}

function indexPlaces(datasets, force) {
  const recordsById = new Map()
  let records = 0
  let cachedRecords = 0

  for (const dataset of datasets) {
    for (const [fallbackId, record] of Object.entries(dataset.data)) {
      records++
      const id = String(record?.id || fallbackId || "")
      if (!id) continue
      if (!recordsById.has(id)) recordsById.set(id, [])
      recordsById.get(id).push(record)
      if (!force && record?.menusFetchedAt) cachedRecords++
    }
  }

  const targetIds = [...recordsById.entries()]
    .filter(([, placeRecords]) => force || placeRecords.some((record) => !record?.menusFetchedAt))
    .map(([id]) => id)

  return { recordsById, targetIds, records, cachedRecords }
}

function buildBatch(ids) {
  return ids.map((id) => ({
    operationName: "getPlaceMenus",
    variables: { input: { deviceType: "pcmap", id, isNx: false } },
    query: QUERY,
  }))
}

async function fetchBatch(ids, maxAttempts = 3) {
  const wtmHeader = Buffer.from(JSON.stringify({ arg: ids[0], type: "restaurant", source: "place" })).toString("base64")
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wtm-graphql": wtmHeader,
          origin: "https://pcmap.place.naver.com",
          referer: "https://pcmap.place.naver.com/",
        },
        body: JSON.stringify(buildBatch(ids)),
      })
      const text = await response.text()

      if (response.ok) return { rows: JSON.parse(text), attempts: attempt }

      const captcha = /captcha|보안 확인|서비스 이용이 제한/i.test(text)
      lastError = new Error(`${captcha ? "NAVER_CAPTCHA" : `HTTP_${response.status}`}: batch starting ${ids[0]}`)
      if (captcha || ![429, 500, 502, 503, 504].includes(response.status)) break
    } catch (error) {
      lastError = error
    }

    if (attempt < maxAttempts) {
      await sleep(Math.min(5000, 600 * (2 ** attempt)) + Math.floor(Math.random() * 350))
    }
  }

  throw lastError || new Error(`Failed batch starting ${ids[0]}`)
}

async function runAgentBrowser(cdpPort, args) {
  const { stdout } = await execFileAsync(
    "npx",
    ["--yes", "agent-browser", "--cdp", String(cdpPort), "--json", ...args],
    { cwd: PROJECT_ROOT, maxBuffer: 64 * 1024 * 1024 }
  )
  const payload = JSON.parse(stdout)
  if (!payload?.success) throw new Error(payload?.error || `agent-browser ${args[0]} failed`)
  return payload.data
}

async function readNcaptchaToken(cdpPort) {
  const data = await runAgentBrowser(cdpPort, ["network", "requests", "--filter", "graphql"])
  const requests = Array.isArray(data?.requests) ? data.requests : []
  const candidate = requests
    .filter((request) => request?.method === "POST" && request?.status === 200)
    .filter((request) => request?.headers?.["X-Wtm-NCaptcha-Token"] || request?.headers?.["x-wtm-ncaptcha-token"])
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))[0]
  return candidate?.headers?.["X-Wtm-NCaptcha-Token"] || candidate?.headers?.["x-wtm-ncaptcha-token"] || ""
}

async function refreshNcaptchaToken(cdpPort) {
  await runAgentBrowser(cdpPort, ["network", "requests", "--clear"])
  await runAgentBrowser(cdpPort, ["reload"])
  await runAgentBrowser(cdpPort, ["wait", "--fn", "document.readyState === 'complete'"])
  const token = await readNcaptchaToken(cdpPort)
  if (!token) throw new Error("NAVER_CAPTCHA_TOKEN_MISSING: reload the Naver Place page in the CDP Chrome")
  return token
}

async function createAgentBrowserContext(cdpPort) {
  let token = await readNcaptchaToken(cdpPort)
  if (!token) token = await refreshNcaptchaToken(cdpPort)
  return { cdpPort, token }
}

async function fetchBatchViaAgentBrowser(ids, context, maxAttempts = 3) {
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const wtmHeader = Buffer.from(JSON.stringify({ arg: ids[0], type: "restaurant", source: "place" })).toString("base64")
    const pageScript = `(async()=>{
      const response=await fetch(${JSON.stringify(ENDPOINT)}, {
        method:"POST",
        headers:{
          "content-type":"application/json",
          "x-wtm-graphql":${JSON.stringify(wtmHeader)},
          "x-wtm-ncaptcha-token":${JSON.stringify(context.token)}
        },
        body:${JSON.stringify(JSON.stringify(buildBatch(ids)))}
      });
      return JSON.stringify({status:response.status,contentType:response.headers.get("content-type"),body:await response.text()});
    })()`

    try {
      const encoded = Buffer.from(pageScript).toString("base64")
      const data = await runAgentBrowser(context.cdpPort, ["eval", "-b", encoded])
      const result = JSON.parse(data.result)
      if (result.status === 200) return { rows: JSON.parse(result.body), attempts: attempt }

      const captcha = result.status === 405 || /captcha|보안 확인|서비스 이용이 제한/i.test(result.body)
      lastError = new Error(`${captcha ? "NAVER_CAPTCHA" : `HTTP_${result.status}`}: batch starting ${ids[0]}`)
      if (captcha && attempt < maxAttempts) {
        context.token = await refreshNcaptchaToken(context.cdpPort)
        continue
      }
      if (![429, 500, 502, 503, 504].includes(result.status) || attempt >= maxAttempts) break
    } catch (error) {
      lastError = error
    }

    if (attempt < maxAttempts) {
      await sleep(Math.min(5000, 600 * (2 ** attempt)) + Math.floor(Math.random() * 350))
    }
  }

  throw lastError || new Error(`Failed agent-browser batch starting ${ids[0]}`)
}

function applyRows(ids, rows, recordsById, fetchedAt) {
  let succeeded = 0
  let placesWithMenus = 0
  let unavailable = 0

  ids.forEach((expectedId, index) => {
    const row = rows[index]
    const detail = row?.data?.placeDetail
    const id = String(detail?.base?.id || expectedId || "")
    const records = recordsById.get(id) || []
    if (!detail || !records.length) {
      const error = row?.errors?.[0]?.message || "placeDetail missing"
      for (const record of recordsById.get(expectedId) || []) {
        record.menus = []
        record.menuSource = null
        record.menusFetchedAt = fetchedAt
        record.menuFetchStatus = "unavailable"
        record.menuFetchError = error
      }
      unavailable++
      return
    }

    const menus = normalizeMenus(detail)
    for (const record of records) {
      record.menus = menus
      record.menuSource = detail.menuSource || null
      record.menusFetchedAt = fetchedAt
      record.menuFetchStatus = menus.length ? "ok" : "no_data"
      delete record.menuFetchError
    }
    succeeded++
    if (menus.length) placesWithMenus++
  })

  return { succeeded, placesWithMenus, unavailable }
}

async function syncAssets(datasets) {
  const assetDir = join(PROJECT_ROOT, "assets/data")
  for (const dataset of datasets) {
    await writeJsonAtomic(join(assetDir, basename(dataset.path)), dataset.data)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const paths = options.files.length ? options.files : await defaultDataFiles()
  const datasets = await loadDatasets(paths)
  compactStoredMenus(datasets)
  const index = indexPlaces(datasets, options.force)
  const stats = {
    datasets: datasets.length,
    records: index.records,
    uniquePlaces: index.recordsById.size,
    targets: index.targetIds.length,
    succeeded: 0,
    placesWithMenus: 0,
    failed: 0,
    unavailable: 0,
    retries: 0,
  }

  console.log(JSON.stringify({ event: "start", ...stats }))
  const agentBrowserContext = options.cdpPort && index.targetIds.length
    ? await createAgentBrowserContext(options.cdpPort)
    : null

  for (let cursor = 0; cursor < index.targetIds.length; cursor += options.batchSize) {
    const ids = index.targetIds.slice(cursor, cursor + options.batchSize)
    const fetchedAt = new Date().toISOString()
    let result
    try {
      result = agentBrowserContext
        ? await fetchBatchViaAgentBrowser(ids, agentBrowserContext)
        : await fetchBatch(ids)
    } catch (error) {
      await saveDatasets(datasets)
      console.error(JSON.stringify({
        event: "checkpoint-on-error",
        processed: cursor,
        total: index.targetIds.length,
        error: String(error),
      }))
      throw error
    }
    stats.retries += result.attempts - 1
    const applied = applyRows(ids, result.rows, index.recordsById, fetchedAt)
    stats.succeeded += applied.succeeded
    stats.placesWithMenus += applied.placesWithMenus
    stats.unavailable += applied.unavailable

    const processed = Math.min(cursor + ids.length, index.targetIds.length)
    if (processed % options.checkpointEvery < ids.length || processed === index.targetIds.length) {
      await saveDatasets(datasets)
      console.log(JSON.stringify({ event: "checkpoint", processed, total: index.targetIds.length, ...stats }))
    }

    await sleep(options.delayMs)
  }

  await saveDatasets(datasets)
  if (options.syncAssets) await syncAssets(datasets)
  console.log(JSON.stringify({ event: "complete", ...stats, syncedAssets: options.syncAssets }))
  if (stats.failed) process.exitCode = 2
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "fatal", error: String(error?.stack || error) }))
  process.exitCode = 1
})
