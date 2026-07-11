#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

async function defaultDataFiles() {
  const dataDir = join(PROJECT_ROOT, "viewer-app/public/data")
  return (await readdir(dataDir))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(dataDir, name))
}

function parseArgs(argv) {
  const files = []
  let checkAssets = false
  for (const arg of argv) {
    if (arg === "--check-assets") checkAssets = true
    else if (arg === "--help" || arg === "-h") return { help: true, files, checkAssets }
    else files.push(resolve(arg))
  }
  return { help: false, files, checkAssets }
}

function printHelp() {
  console.log(`Usage: node scripts/verify-menu-datasets.mjs [--check-assets] [data.json ...]

Verify that every place record has a completed, internally consistent menu collection result.
When no files are provided, viewer-app/public/data/*.json is used.

  --check-assets  Also require assets/data copies to exactly match public/data
  -h, --help      Show this help`)
}

function validateRecord(id, record) {
  const errors = []
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["record is not an object"]
  if (!record.menusFetchedAt || typeof record.menusFetchedAt !== "string") errors.push("menusFetchedAt missing")
  if (!Array.isArray(record.menus)) errors.push("menus is not an array")
  if (!new Set(["ok", "no_data", "unavailable"]).has(record.menuFetchStatus)) errors.push("invalid menuFetchStatus")

  const menus = Array.isArray(record.menus) ? record.menus : []
  if (record.menuFetchStatus === "ok" && menus.length === 0) errors.push("ok status has no menus")
  if (record.menuFetchStatus === "no_data" && menus.length !== 0) errors.push("no_data status has menus")
  if (record.menuFetchStatus === "unavailable" && menus.length !== 0) errors.push("unavailable status has menus")
  if (record.menuFetchStatus === "unavailable" && !String(record.menuFetchError || "").trim()) errors.push("unavailable status has no error")

  const seen = new Set()
  menus.forEach((menu, index) => {
    if (!menu || typeof menu !== "object" || Array.isArray(menu)) {
      errors.push(`menu[${index}] is not an object`)
      return
    }
    if (!String(menu.name || "").trim()) errors.push(`menu[${index}] name missing`)
    if (!new Set(["naver", "baemin"]).has(menu.source)) errors.push(`menu[${index}] source invalid`)
    const key = [menu.source, menu.groupId || "", menu.id || menu.menuId || "", menu.name, menu.price].join("|")
    if (seen.has(key)) errors.push(`menu[${index}] duplicate key`)
    seen.add(key)
  })

  return errors.map((error) => `${id}: ${error}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const files = options.files.length ? options.files : await defaultDataFiles()
  const totals = {
    datasets: files.length,
    records: 0,
    uniquePlaces: 0,
    completedRecords: 0,
    placesWithMenus: 0,
    menus: 0,
    invalidRecords: 0,
    assetMismatches: 0,
  }
  const uniqueIds = new Set()
  const failures = []

  for (const path of files) {
    const sourceText = await readFile(path, "utf8")
    const data = JSON.parse(sourceText)
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      failures.push(`${basename(path)}: JSON root is not an object`)
      continue
    }

    const datasetStats = { records: 0, completed: 0, withMenus: 0, menus: 0, invalid: 0 }
    for (const [fallbackId, record] of Object.entries(data)) {
      const id = String(record?.id || fallbackId || "")
      uniqueIds.add(id)
      totals.records++
      datasetStats.records++
      const recordFailures = validateRecord(id, record)
      if (recordFailures.length) {
        totals.invalidRecords++
        datasetStats.invalid++
        if (failures.length < 100) failures.push(...recordFailures.slice(0, 5))
        continue
      }

      totals.completedRecords++
      datasetStats.completed++
      totals.menus += record.menus.length
      datasetStats.menus += record.menus.length
      if (record.menus.length) {
        totals.placesWithMenus++
        datasetStats.withMenus++
      }
    }

    if (options.checkAssets) {
      const assetPath = join(PROJECT_ROOT, "assets/data", basename(path))
      let assetText = ""
      try {
        assetText = await readFile(assetPath, "utf8")
      } catch {
        failures.push(`${basename(path)}: assets/data copy missing`)
      }
      if (assetText !== sourceText) {
        totals.assetMismatches++
        failures.push(`${basename(path)}: assets/data copy differs`)
      }
    }

    console.log(JSON.stringify({ event: "dataset", file: basename(path), ...datasetStats }))
  }

  totals.uniquePlaces = uniqueIds.size
  console.log(JSON.stringify({ event: failures.length ? "failed" : "complete", ...totals, failureSamples: failures.slice(0, 30) }))
  if (failures.length || totals.completedRecords !== totals.records) process.exitCode = 1
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "fatal", error: String(error?.stack || error) }))
  process.exitCode = 1
})
