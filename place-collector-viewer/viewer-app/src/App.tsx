import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Loader2,
  RotateCcw,
  Search,
  X,
} from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type ColumnType = "text" | "number" | "boolean"
type SortDirection = "asc" | "desc"
type RawRecord = Record<string, unknown>
type RuleMode = "all" | "any"
type CenterStatusTone = "muted" | "ok" | "warn"

type Primitive = string | number | boolean | null | undefined

interface ColumnDef {
  key: keyof PlaceRow | "openAtRefRank"
  label: string
  type: ColumnType
}

interface SortRule {
  key: ColumnDef["key"]
  dir: SortDirection
}

interface FieldDef {
  key: string
  label: string
  type: ColumnType
  source: "derived" | "raw"
}

interface AdvancedRule {
  id: number
  field: string
  op: string
  value1: string
  value2: string
}

interface CenterSearchResult {
  id: string
  x: number
  y: number
  label: string
}

interface PlaceRow {
  _index: number
  raw: RawRecord
  id: string
  name: string
  category: string
  reviewCount: number
  avgRating: number
  rawDistanceM: number | null
  distanceM: number | null
  petFriendly: boolean
  topKeyword: string
  topKeywordCount: number
  topKeywordPct: number
  openDesc: string
  openAtRefLabel: string
  openAtRefRank: number
  openAtRefCode: string
  address: string
  roadAddress: string
  commonAddress: string
  phone: string
  options: string
  conveniences: string[]
  conveniencesText: string
  priceCategory: string
  newOpening: boolean
  broadcastInfo: string
  hasBroadcast: boolean
  parkingDetail: string
  hasParkingDetail: boolean
  hasParkingOption: boolean
  hasValetOption: boolean
  hasReservationOption: boolean
  detailConveniences: string
  regularClosedDays: string
  saveCount: number
  visitorReviewCount: number
  visitorReviewScore: number
  blogCafeReviewCount: number
  feedsCount: number
  feedsHasMore: boolean
  hasFeeds: boolean
  x: number
  y: number
  mapUrl: string
}

interface OpenState {
  label: string
  rank: number
  code: string
}

const columns: ColumnDef[] = [
  { key: "name", label: "장소명", type: "text" },
  { key: "category", label: "카테고리", type: "text" },
  { key: "reviewCount", label: "리뷰수", type: "number" },
  { key: "distanceM", label: "거리(m)", type: "number" },
  { key: "topKeywordPct", label: "최상위 키워드%", type: "number" },
  { key: "petFriendly", label: "반려동물", type: "boolean" },
  { key: "openAtRefRank", label: "기준시점 영업", type: "number" },
]

const DERIVED_FIELD_META: Record<string, { label: string; type: ColumnType }> = {
  id: { label: "아이디", type: "text" },
  name: { label: "장소명", type: "text" },
  category: { label: "카테고리", type: "text" },
  reviewCount: { label: "리뷰수", type: "number" },
  avgRating: { label: "평점", type: "number" },
  distanceM: { label: "거리(m)", type: "number" },
  petFriendly: { label: "반려동물 동반", type: "boolean" },
  topKeyword: { label: "최상위 키워드", type: "text" },
  topKeywordCount: { label: "최상위 키워드 수", type: "number" },
  topKeywordPct: { label: "최상위 키워드 %", type: "number" },
  openDesc: { label: "영업 상태", type: "text" },
  openAtRefLabel: { label: "기준시점 영업", type: "text" },
  openAtRefRank: { label: "기준시점 영업순위", type: "number" },
  openAtRefCode: { label: "기준시점 영업코드", type: "text" },
  address: { label: "주소", type: "text" },
  roadAddress: { label: "도로명 주소", type: "text" },
  commonAddress: { label: "지번 주소", type: "text" },
  phone: { label: "전화", type: "text" },
  options: { label: "옵션", type: "text" },
  conveniences: { label: "편의시설 목록", type: "text" },
  conveniencesText: { label: "편의시설 텍스트", type: "text" },
  priceCategory: { label: "가격대", type: "text" },
  newOpening: { label: "신규오픈", type: "boolean" },
  broadcastInfo: { label: "방송 정보", type: "text" },
  hasBroadcast: { label: "방송 정보 존재", type: "boolean" },
  parkingDetail: { label: "주차 상세", type: "text" },
  hasParkingDetail: { label: "주차 상세 존재", type: "boolean" },
  hasParkingOption: { label: "옵션:주차", type: "boolean" },
  hasValetOption: { label: "옵션:발렛", type: "boolean" },
  hasReservationOption: { label: "옵션:예약", type: "boolean" },
  detailConveniences: { label: "편의정보", type: "text" },
  regularClosedDays: { label: "정기휴무", type: "text" },
  saveCount: { label: "저장수", type: "number" },
  visitorReviewCount: { label: "방문자 리뷰수", type: "number" },
  visitorReviewScore: { label: "방문자 리뷰점수", type: "number" },
  blogCafeReviewCount: { label: "블로그/카페 리뷰수", type: "number" },
  feedsCount: { label: "소식 수", type: "number" },
  feedsHasMore: { label: "소식 더보기", type: "boolean" },
  hasFeeds: { label: "소식 존재", type: "boolean" },
  x: { label: "경도(x)", type: "number" },
  y: { label: "위도(y)", type: "number" },
  mapUrl: { label: "지도 링크", type: "text" },
}

const RAW_TO_DERIVED_FIELD: Record<string, string> = {
  id: "id",
  name: "name",
  category: "category",
  reviewCount: "reviewCount",
  avgRating: "avgRating",
  distance: "distanceM",
  roadAddress: "roadAddress",
  commonAddress: "commonAddress",
  detailPhone: "phone",
  options: "options",
  priceCategory: "priceCategory",
  newOpening: "newOpening",
  broadcastInfo: "broadcastInfo",
  parkingDetail: "parkingDetail",
  detailConveniences: "detailConveniences",
  regularClosedDays: "regularClosedDays",
  saveCount: "saveCount",
  visitorReviewCount: "visitorReviewCount",
  visitorReviewScore: "visitorReviewScore",
  blogCafeReviewCount: "blogCafeReviewCount",
  feedsHasMore: "feedsHasMore",
  x: "x",
  y: "y",
  mapUrl: "mapUrl",
}

const RAW_FIELD_LABELS: Record<string, string> = {
  detailCid: "상세 식별자",
  detailHours: "영업시간 상세",
  details: "세부 정보",
  detailStatus: "상태 상세",
  feeds: "소식 목록",
  isNx: "확장 수집 여부",
  keywords: "키워드 목록",
  microReview: "마이크로 리뷰",
  newBusinessHours: "신규 영업시간",
}

const OPS_BY_TYPE: Record<ColumnType, Array<{ value: string; label: string }>> = {
  text: [
    { value: "contains", label: "포함" },
    { value: "not_contains", label: "미포함" },
    { value: "eq", label: "=" },
    { value: "neq", label: "!=" },
    { value: "starts_with", label: "시작 일치" },
    { value: "ends_with", label: "끝 일치" },
    { value: "is_empty", label: "비어 있음" },
    { value: "not_empty", label: "비어 있지 않음" },
  ],
  number: [
    { value: "gte", label: ">=" },
    { value: "gt", label: ">" },
    { value: "lte", label: "<=" },
    { value: "lt", label: "<" },
    { value: "eq", label: "=" },
    { value: "neq", label: "!=" },
    { value: "between", label: "범위" },
    { value: "is_empty", label: "비어 있음" },
    { value: "not_empty", label: "비어 있지 않음" },
  ],
  boolean: [
    { value: "is_true", label: "참" },
    { value: "is_false", label: "거짓" },
  ],
}

const MIN_REVIEW_PRESETS = [
  { label: "0+", value: 0 },
  { label: "10+", value: 10 },
  { label: "30+", value: 30 },
  { label: "50+", value: 50 },
  { label: "100+", value: 100 },
  { label: "300+", value: 300 },
]

const MAX_DISTANCE_PRESETS: Array<{ label: string; value: number | null }> = [
  { label: "제한 없음", value: null },
  { label: "300m", value: 300 },
  { label: "500m", value: 500 },
  { label: "1km", value: 1000 },
  { label: "2km", value: 2000 },
  { label: "5km", value: 5000 },
]

const DEFAULT_MIN_REVIEW = 50
const DEFAULT_MAX_DISTANCE: number | null = null
const CENTER_SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search"
const CENTER_SEARCH_FALLBACK_ENDPOINT = "https://photon.komoot.io/api/"
const CENTER_SEARCH_LIMIT = 8

const numFmt = new Intl.NumberFormat("ko-KR")

function toNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/,/g, "")
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toNum(value: unknown): number {
  return toNumOrNull(value) ?? 0
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map((item) => toText(item)).join(", ")
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseSearchKeywords(inputValue: string): string[] {
  return toText(inputValue)
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

function parseDistanceMeters(distance: unknown): number | null {
  if (!distance) return null
  if (typeof distance === "number") return Math.round(distance)
  const text = String(distance).trim().toLowerCase()
  if (text.endsWith("km")) return Math.round(toNum(text.replace("km", "")) * 1000)
  if (text.endsWith("m")) return Math.round(toNum(text.replace("m", "")))
  const num = toNumOrNull(text)
  return num == null ? null : Math.round(num)
}

function normalizeConvenienceLabel(text: unknown): string {
  const normalized = toText(text).replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  if (normalized.includes("�")) return ""
  return normalized
}

function extractConveniences(optionsValue: unknown, detailConveniencesValue: unknown): string[] {
  const items: string[] = []
  const push = (value: unknown) => {
    const normalized = normalizeConvenienceLabel(value)
    if (normalized) items.push(normalized)
  }

  if (typeof optionsValue === "string") {
    optionsValue.split(",").forEach(push)
  } else if (Array.isArray(optionsValue)) {
    optionsValue.forEach(push)
  }

  if (Array.isArray(detailConveniencesValue)) {
    detailConveniencesValue.forEach(push)
  } else if (typeof detailConveniencesValue === "string") {
    detailConveniencesValue.split(",").forEach(push)
  }

  return [...new Set(items)]
}

function distanceFromXYMeters(x: unknown, y: unknown, centerX: number, centerY: number): number | null {
  const px = toNumOrNull(x)
  const py = toNumOrNull(y)
  if (px == null || py == null) return null
  const dx = (px - centerX) * 88000
  const dy = (py - centerY) * 111000
  return Math.round(Math.sqrt(dx * dx + dy * dy))
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function toInputDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function toInputTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function parseTimeToMinutes(text: string | undefined): number | null {
  if (typeof text !== "string") return null
  const m = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 24 || mm < 0 || mm > 59) return null
  if (hh === 24 && mm !== 0) return null
  return hh * 60 + mm
}

function getReferenceDateTime(dateText: string, timeText: string): Date {
  const now = new Date()
  const datePart = dateText || toInputDate(now)
  const m = String(timeText || toInputTime(now)).match(/^(\d{1,2}):(\d{2})/)
  const hh = m ? m[1].padStart(2, "0") : "00"
  const mm = m ? m[2] : "00"
  const dt = new Date(`${datePart}T${hh}:${mm}:00`)
  return Number.isNaN(dt.getTime()) ? now : dt
}

function matchDayLabel(dayText: unknown, dayKo: string): boolean {
  if (typeof dayText !== "string") return false
  const text = dayText.trim()
  if (text === dayKo) return true
  if (text === `${dayKo}요일`) return true
  if (text.startsWith(`${dayKo}(`)) return true
  if (text.startsWith(`${dayKo}요일(`)) return true
  return false
}

function computeReferenceOpenState(row: PlaceRow, refDateTime: Date): OpenState {
  const fallback = row.openDesc ? `계산불가 · ${row.openDesc}` : "계산불가"
  if (!(refDateTime instanceof Date) || Number.isNaN(refDateTime.getTime())) {
    return { label: fallback, rank: 0, code: "unknown" }
  }

  const details = Array.isArray((row.raw as { detailHours?: unknown }).detailHours)
    ? ((row.raw as { detailHours: Array<Record<string, unknown>> }).detailHours ?? [])
    : []

  if (!details.length) {
    return { label: fallback, rank: 0, code: "unknown" }
  }

  const dayKo = ["일", "월", "화", "수", "목", "금", "토"][refDateTime.getDay()]
  const byDay =
    details.find((entry) => entry && matchDayLabel(entry.day, dayKo)) ||
    details.find((entry) => entry && entry.day === "매일")

  if (!byDay) {
    return { label: fallback, rank: 0, code: "unknown" }
  }

  const businessHours = (byDay.businessHours as { start?: string; end?: string } | undefined) ?? undefined
  const start = parseTimeToMinutes(businessHours?.start)
  const end = parseTimeToMinutes(businessHours?.end)

  if (start == null || end == null) {
    if ((row.openDesc || "").includes("휴무")) return { label: "휴무", rank: 1, code: "unknown" }
    return { label: fallback, rank: 0, code: "unknown" }
  }

  let now = refDateTime.getHours() * 60 + refDateTime.getMinutes()
  const s = start
  let e = end
  const overnight = e <= s
  if (overnight) {
    e += 1440
    if (now < s) now += 1440
  }

  if (now < s || now >= e) return { label: "영업종료", rank: 2, code: "closed" }

  const breaks = Array.isArray(byDay.breakHours) ? (byDay.breakHours as Array<Record<string, unknown>>) : []
  for (const br of breaks) {
    const bsRaw = parseTimeToMinutes(typeof br.start === "string" ? br.start : undefined)
    const beRaw = parseTimeToMinutes(typeof br.end === "string" ? br.end : undefined)
    if (bsRaw == null || beRaw == null) continue

    let bs = bsRaw
    let be = beRaw
    if (be <= bs) be += 1440
    if (overnight && bs < s) {
      bs += 1440
      be += 1440
    }

    if (now >= bs && now < be) return { label: "브레이크타임", rank: 4, code: "break" }
  }

  return { label: "영업중", rank: 5, code: "open" }
}

function getTopKeyword(details: unknown, reviewCount: number): { label: string; count: number; pct: number } {
  if (Array.isArray(details) && details.length) {
    const top = details
      .filter((d): d is { displayName?: string; count: number } => Boolean(d && typeof d === "object" && typeof (d as { count?: unknown }).count === "number"))
      .sort((a, b) => b.count - a.count)[0]

    if (top) {
      const label = top.displayName || ""
      const count = top.count
      const pct = reviewCount > 0 ? (count / reviewCount) * 100 : 0
      return { label, count, pct }
    }
  }

  return { label: "", count: 0, pct: 0 }
}

function normalizeRecord(raw: RawRecord, fallbackId: string, index: number): PlaceRow {
  const reviewCount = toNum(raw.reviewCount)
  const avgRating = toNum(raw.avgRating)
  const parsedDistance = parseDistanceMeters(raw.distance)
  const topKeyword = getTopKeyword(raw.details, reviewCount)
  const placeId = toText(raw.id || fallbackId)

  const options = toText(raw.options)
  const conveniences = extractConveniences(raw.options, raw.detailConveniences)
  const parkingDetail = toText(raw.parkingDetail)
  const detailConveniences = toText(raw.detailConveniences)
  const regularClosedDays = toText(raw.regularClosedDays)
  const broadcastInfo = toText(raw.broadcastInfo)

  const feedsCount = Array.isArray(raw.feeds) ? raw.feeds.length : 0
  const hasFeeds = feedsCount > 0

  return {
    _index: index,
    raw,
    id: placeId,
    name: toText(raw.name),
    category: toText(raw.category),
    reviewCount,
    avgRating,
    rawDistanceM: parsedDistance,
    distanceM: parsedDistance,
    petFriendly: options.includes("반려동물 동반"),
    topKeyword: topKeyword.label,
    topKeywordCount: topKeyword.count,
    topKeywordPct: Number(topKeyword.pct.toFixed(1)),
    openDesc: toText((raw.detailStatus as { description?: Primitive } | undefined)?.description || (raw.newBusinessHours as { description?: Primitive } | undefined)?.description || ""),
    openAtRefLabel: "",
    openAtRefRank: 0,
    openAtRefCode: "unknown",
    address: toText(raw.roadAddress || raw.commonAddress || ""),
    roadAddress: toText(raw.roadAddress),
    commonAddress: toText(raw.commonAddress),
    phone: toText(raw.detailPhone),
    options,
    conveniences,
    conveniencesText: conveniences.join(", "),
    priceCategory: toText(raw.priceCategory),
    newOpening: Boolean(raw.newOpening),
    broadcastInfo,
    hasBroadcast: broadcastInfo.trim() !== "",
    parkingDetail,
    hasParkingDetail: parkingDetail.trim() !== "",
    hasParkingOption: options.includes("주차"),
    hasValetOption: options.includes("발렛"),
    hasReservationOption: options.includes("예약"),
    detailConveniences,
    regularClosedDays,
    saveCount: toNum(raw.saveCount),
    visitorReviewCount: toNum(raw.visitorReviewCount),
    visitorReviewScore: toNum(raw.visitorReviewScore),
    blogCafeReviewCount: toNum(raw.blogCafeReviewCount),
    feedsCount,
    feedsHasMore: Boolean(raw.feedsHasMore),
    hasFeeds,
    x: toNum(raw.x),
    y: toNum(raw.y),
    mapUrl: placeId ? `https://map.naver.com/p/smart-around/place/${placeId}` : "",
  }
}

function parseJsonToRows(payload: unknown): PlaceRow[] {
  let entries: Array<[string, RawRecord]> = []

  if (Array.isArray(payload)) {
    entries = payload.map((record, i) => [String((record as RawRecord)?.id || i), (record as RawRecord) || {}])
  } else if (payload && typeof payload === "object") {
    entries = Object.entries(payload as Record<string, RawRecord>)
  } else {
    throw new Error("JSON 루트는 객체 또는 배열이어야 합니다.")
  }

  return entries.map(([id, record], i) => normalizeRecord(record || {}, id, i))
}

function buildConvenienceCatalog(rows: PlaceRow[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const item of row.conveniences || []) {
      counts.set(item, (counts.get(item) || 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([name, count]) => ({ name, count }))
}

function buildTopKeywordCatalog(rows: PlaceRow[]): Array<{ keyword: string; count: number }> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const keyword = toText(row.topKeyword).trim()
    if (!keyword) continue
    counts.set(keyword, (counts.get(keyword) || 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([keyword, count]) => ({ keyword, count }))
}

function compare(left: unknown, right: unknown, type: ColumnType): number {
  if (left === null || left === undefined) return right === null || right === undefined ? 0 : 1
  if (right === null || right === undefined) return -1
  if (type === "number") return Number(left) - Number(right)
  if (type === "boolean") return Number(left) - Number(right)
  return String(left).localeCompare(String(right), "ko")
}

function sortRows(rows: PlaceRow[], sortRules: SortRule[]): PlaceRow[] {
  const sorted = rows.slice()
  if (!sortRules.length) {
    return sorted.sort((a, b) => a._index - b._index)
  }

  return sorted.sort((a, b) => {
    for (const rule of sortRules) {
      const col = columns.find((item) => item.key === rule.key)
      if (!col) continue
      const result = compare(a[col.key], b[col.key], col.type)
      if (result !== 0) return rule.dir === "asc" ? result : -result
    }
    return a._index - b._index
  })
}

function inferTypeFromRows(rows: PlaceRow[], fieldKey: string): ColumnType {
  const isRaw = fieldKey.startsWith("raw.")
  if (fieldKey === "raw.id") return "text"

  for (const row of rows) {
    const rowRecord = row as unknown as Record<string, unknown>
    const value = isRaw ? (row.raw as Record<string, unknown>)[fieldKey.slice(4)] : rowRecord[fieldKey]
    if (value === null || value === undefined || value === "") continue

    if (typeof value === "boolean") return "boolean"
    if (typeof value === "number") return "number"
    if (typeof value === "string") {
      const cleaned = value.trim().replace(/,/g, "")
      if (/^-?\d+(\.\d+)?$/.test(cleaned)) return "number"
      return "text"
    }

    return "text"
  }

  return "text"
}

function buildFilterFields(rows: PlaceRow[]): FieldDef[] {
  if (!rows.length) return []

  const defs: FieldDef[] = []
  const seen = new Set<string>()
  const derivedKeys = new Set<string>()
  const first = rows[0]

  const pushField = (key: string, label: string, type: ColumnType, source: "derived" | "raw") => {
    if (seen.has(key)) return
    seen.add(key)
    defs.push({ key, label, type, source })
  }

  Object.keys(first)
    .filter((key) => !["_index", "raw"].includes(key))
    .forEach((key) => {
      const meta = DERIVED_FIELD_META[key]
      const type = meta?.type || inferTypeFromRows(rows, key)
      const label = meta?.label || key
      pushField(key, label, type, "derived")
      derivedKeys.add(key)
    })

  const rawKeys = new Set<string>()
  for (const row of rows) {
    Object.keys(row.raw || {}).forEach((key) => rawKeys.add(key))
  }

  Array.from(rawKeys)
    .sort((a, b) => a.localeCompare(b, "ko"))
    .forEach((rawKey) => {
      const mappedDerivedKey = RAW_TO_DERIVED_FIELD[rawKey] || rawKey
      if (derivedKeys.has(mappedDerivedKey)) return
      const key = `raw.${rawKey}`
      const type = inferTypeFromRows(rows, key)
      const label = RAW_FIELD_LABELS[rawKey] || rawKey
      pushField(key, label, type, "raw")
    })

  return defs.sort((a, b) => {
    const labelOrder = a.label.localeCompare(b.label, "ko", { sensitivity: "base", numeric: true })
    if (labelOrder !== 0) return labelOrder
    return a.key.localeCompare(b.key, "ko", { sensitivity: "base", numeric: true })
  })
}

function getFieldValue(row: PlaceRow, fieldKey: string): unknown {
  if (fieldKey.startsWith("raw.")) {
    return (row.raw as Record<string, unknown>)[fieldKey.slice(4)]
  }
  return (row as unknown as Record<string, unknown>)[fieldKey]
}

function getOpsForType(type: ColumnType): Array<{ value: string; label: string }> {
  return OPS_BY_TYPE[type] || OPS_BY_TYPE.text
}

function getTypeLabel(type: ColumnType): string {
  if (type === "number") return "숫자"
  if (type === "boolean") return "불리언"
  return "텍스트"
}

function defaultOpForType(type: ColumnType): string {
  const ops = getOpsForType(type)
  return ops.length ? ops[0].value : "contains"
}

function opNeedsValue(op: string): boolean {
  return !["is_empty", "not_empty", "is_true", "is_false"].includes(op)
}

function opNeedsSecondValue(op: string): boolean {
  return op === "between"
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === "object") return Object.keys(value).length === 0
  return false
}

function evaluateRule(row: PlaceRow, rule: AdvancedRule, filterFieldMap: Map<string, FieldDef>): boolean {
  const def = filterFieldMap.get(rule.field)
  if (!def) return true

  const leftRaw = getFieldValue(row, rule.field)
  const op = rule.op

  if (op === "is_empty") return isEmptyValue(leftRaw)
  if (op === "not_empty") return !isEmptyValue(leftRaw)
  if (op === "is_true") return Boolean(leftRaw) === true
  if (op === "is_false") return Boolean(leftRaw) === false

  if (def.type === "number") {
    const left = toNumOrNull(leftRaw)
    const right = toNumOrNull(rule.value1)
    const right2 = toNumOrNull(rule.value2)

    if (left == null) return false

    if (op === "gt") return right != null && left > right
    if (op === "gte") return right != null && left >= right
    if (op === "lt") return right != null && left < right
    if (op === "lte") return right != null && left <= right
    if (op === "eq") return right != null && left === right
    if (op === "neq") return right != null && left !== right
    if (op === "between") {
      if (right == null || right2 == null) return false
      const min = Math.min(right, right2)
      const max = Math.max(right, right2)
      return left >= min && left <= max
    }
    return false
  }

  const left = toText(leftRaw).toLowerCase()
  const right = String(rule.value1 || "").toLowerCase()

  if (op === "contains") return right === "" ? true : left.includes(right)
  if (op === "not_contains") return right === "" ? true : !left.includes(right)
  if (op === "eq") return left === right
  if (op === "neq") return left !== right
  if (op === "starts_with") return right === "" ? true : left.startsWith(right)
  if (op === "ends_with") return right === "" ? true : left.endsWith(right)

  return true
}

function passAdvancedFilters(row: PlaceRow, rules: AdvancedRule[], mode: RuleMode, filterFieldMap: Map<string, FieldDef>): boolean {
  if (!rules.length) return true
  const results = rules.map((rule) => evaluateRule(row, rule, filterFieldMap))
  return mode === "any" ? results.some(Boolean) : results.every(Boolean)
}

function getCenterSearchResultIdFromInput(inputValue: string, results: CenterSearchResult[]): string | null {
  const normalized = inputValue.trim()
  if (!normalized) return null

  const indexMatched = normalized.match(/^(\d+)\.\s*/)
  if (indexMatched) {
    const idx = Number(indexMatched[1]) - 1
    if (Number.isInteger(idx) && idx >= 0 && idx < results.length) {
      return results[idx].id
    }
  }

  const labelOnly = normalized.replace(/^\d+\.\s*/, "").trim()
  if (!labelOnly) return null

  const exact = results.find((item) => item.label === labelOnly)
  if (exact) return exact.id

  const lower = labelOnly.toLowerCase()
  const partial = results.find((item) => item.label.toLowerCase().includes(lower))
  return partial ? partial.id : null
}

function toCenterSearchOptionText(item: CenterSearchResult, index: number): string {
  return `${index + 1}. ${item.label}`
}

async function fetchCenterSearchByNominatim(query: string): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    limit: String(CENTER_SEARCH_LIMIT),
    countrycodes: "kr",
    "accept-language": "ko",
    q: query,
  })

  const response = await fetch(`${CENTER_SEARCH_ENDPOINT}?${params.toString()}`, {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const payload = await response.json()
  return Array.isArray(payload) ? payload : []
}

async function fetchCenterSearchByPhoton(query: string): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({ q: query, limit: String(CENTER_SEARCH_LIMIT) })

  const response = await fetch(`${CENTER_SEARCH_FALLBACK_ENDPOINT}?${params.toString()}`, {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const payload = await response.json()
  const features = Array.isArray(payload?.features) ? payload.features : []

  return features.map((feature: Record<string, unknown>) => {
    const coordinates = Array.isArray((feature.geometry as { coordinates?: unknown[] } | undefined)?.coordinates)
      ? (((feature.geometry as { coordinates: unknown[] }).coordinates ?? []) as unknown[])
      : []

    const properties = (feature.properties as Record<string, unknown>) || {}
    const nameParts = [
      properties.name,
      properties.street,
      properties.district,
      properties.city,
      properties.state,
      properties.country,
    ]
      .map((value) => toText(value).trim())
      .filter(Boolean)

    return {
      lon: coordinates[0],
      lat: coordinates[1],
      display_name: nameParts.join(", "),
    }
  })
}

function normalizeCenterSearchResult(item: Record<string, unknown>, index: number): CenterSearchResult | null {
  const x = toNumOrNull(item.lon ?? item.x)
  const y = toNumOrNull(item.lat ?? item.y)
  if (x == null || y == null) return null

  const label = toText(item.display_name || item.name || "").replace(/\s+/g, " ").trim()
  return {
    id: `${index}:${x.toFixed(7)}:${y.toFixed(7)}`,
    x,
    y,
    label: label || `${y.toFixed(7)}, ${x.toFixed(7)}`,
  }
}

function App() {
  const now = useMemo(() => new Date(), [])

  const [rows, setRows] = useState<PlaceRow[]>([])
  const [sort, setSort] = useState<SortRule[]>([])

  const [searchInput, setSearchInput] = useState("")
  const [minReviewPreset, setMinReviewPreset] = useState(DEFAULT_MIN_REVIEW)
  const [maxDistancePreset, setMaxDistancePreset] = useState<number | null>(DEFAULT_MAX_DISTANCE)

  const [centerSearchInput, setCenterSearchInput] = useState("")
  const [centerSearchResults, setCenterSearchResults] = useState<CenterSearchResult[]>([])
  const [selectedCenterSearchResultId, setSelectedCenterSearchResultId] = useState("")
  const [centerSearchSelectOpen, setCenterSearchSelectOpen] = useState(false)
  const [centerSearchLoading, setCenterSearchLoading] = useState(false)
  const [centerSearchStatus, setCenterSearchStatus] = useState<{ message: string; tone: CenterStatusTone }>({
    message: "주소/건물명을 검색하고 옵션에서 선택하면 거리를 계산합니다.",
    tone: "muted",
  })

  const [distanceCenter, setDistanceCenter] = useState<{ x: number; y: number } | null>(null)

  const [refDate, setRefDate] = useState(toInputDate(now))
  const [refTime, setRefTime] = useState(toInputTime(now))
  const [refOpenMode, setRefOpenMode] = useState("all")
  const [topKeywordFilter, setTopKeywordFilter] = useState("all")

  const [convenienceMode, setConvenienceMode] = useState<RuleMode>("all")
  const [selectedConveniences, setSelectedConveniences] = useState<string[]>([])

  const [advMode, setAdvMode] = useState<RuleMode>("all")
  const [advancedRules, setAdvancedRules] = useState<AdvancedRule[]>([])
  const [nextRuleId, setNextRuleId] = useState(1)

  const [statusError, setStatusError] = useState<string | null>(null)

  const [accordionValues, setAccordionValues] = useState<string[]>(["convenience", "advanced"])

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const centerSearchSeqRef = useRef(0)

  const convenienceCatalog = useMemo(() => buildConvenienceCatalog(rows), [rows])
  const topKeywordCatalog = useMemo(() => buildTopKeywordCatalog(rows), [rows])
  const filterFields = useMemo(() => buildFilterFields(rows), [rows])
  const filterFieldMap = useMemo(() => new Map(filterFields.map((field) => [field.key, field])), [filterFields])

  useEffect(() => {
    if (topKeywordFilter !== "all" && !topKeywordCatalog.some((item) => item.keyword === topKeywordFilter)) {
      setTopKeywordFilter("all")
    }
  }, [topKeywordCatalog, topKeywordFilter])

  const referenceDateTime = useMemo(() => getReferenceDateTime(refDate, refTime), [refDate, refTime])
  const keywords = useMemo(() => parseSearchKeywords(searchInput), [searchInput])

  const rowsWithComputed = useMemo(() => {
    return rows.map((row) => {
      const runtimeDistance = distanceCenter
        ? distanceFromXYMeters(row.x, row.y, distanceCenter.x, distanceCenter.y)
        : null
      const openState = computeReferenceOpenState(row, referenceDateTime)
      return {
        ...row,
        distanceM: runtimeDistance,
        openAtRefLabel: openState.label,
        openAtRefRank: openState.rank,
        openAtRefCode: openState.code,
      }
    })
  }, [rows, distanceCenter, referenceDateTime])

  const filteredRows = useMemo(() => {
    return rowsWithComputed.filter((row) => {
      if (row.reviewCount < minReviewPreset) return false

      if (maxDistancePreset != null && distanceCenter) {
        if (row.distanceM == null || row.distanceM > maxDistancePreset) return false
      }

      if (refOpenMode !== "all" && row.openAtRefCode !== refOpenMode) return false
      if (topKeywordFilter !== "all" && row.topKeyword !== topKeywordFilter) return false

      if (selectedConveniences.length) {
        if (convenienceMode === "all") {
          if (!selectedConveniences.every((item) => row.conveniences.includes(item))) return false
        } else if (!selectedConveniences.some((item) => row.conveniences.includes(item))) {
          return false
        }
      }

      if (keywords.length) {
        const text = [
          row.name,
          row.category,
          row.address,
          row.options,
          row.phone,
          row.topKeyword,
          row.openDesc,
          row.openAtRefLabel,
          row.priceCategory,
          row.parkingDetail,
          row.detailConveniences,
          row.conveniencesText,
          row.broadcastInfo,
        ]
          .join(" ")
          .toLowerCase()

        if (!keywords.some((keyword) => text.includes(keyword))) return false
      }

      if (!passAdvancedFilters(row, advancedRules, advMode, filterFieldMap)) return false

      return true
    })
  }, [rowsWithComputed, minReviewPreset, maxDistancePreset, distanceCenter, refOpenMode, topKeywordFilter, selectedConveniences, convenienceMode, keywords, advancedRules, advMode, filterFieldMap])

  const viewRows = useMemo(() => sortRows(filteredRows, sort), [filteredRows, sort])

  const statusBadges = useMemo(() => {
    const list: string[] = []
    if (keywords.length > 0) list.push(`검색 ${keywords.length}`)
    if (minReviewPreset > 0) list.push(`최소 리뷰 ${numFmt.format(minReviewPreset)}+`)
    if (maxDistancePreset != null) list.push(`최대 거리 ${numFmt.format(maxDistancePreset)}m`)
    if (selectedConveniences.length > 0) list.push(`편의시설 ${selectedConveniences.length}`)
    if (advancedRules.length > 0) list.push(`고급규칙 ${advancedRules.length}`)
    if (sort.length > 0) list.push(`정렬 ${sort.length}`)
    return list
  }, [keywords.length, minReviewPreset, maxDistancePreset, selectedConveniences.length, advancedRules.length, sort.length])

  const centerSelectPlaceholder = centerSearchResults.length
    ? "검색 결과에서 기준점을 선택하세요"
    : "검색 결과 옵션을 선택하세요"

  const getFieldDef = (fieldKey: string): FieldDef | undefined => filterFieldMap.get(fieldKey)

  const clearDistanceCenter = useCallback(() => {
    setDistanceCenter(null)
    setSelectedCenterSearchResultId("")
    setCenterSearchSelectOpen(false)
  }, [])

  const applyCenterSearchResultById = (resultId: string, options?: { silentStatus?: boolean }): boolean => {
    const selected = centerSearchResults.find((item) => item.id === resultId)
    if (!selected) return false

    const index = centerSearchResults.findIndex((item) => item.id === resultId)
    setDistanceCenter({ x: selected.x, y: selected.y })
    setSelectedCenterSearchResultId(resultId)
    setCenterSearchSelectOpen(false)
    if (index >= 0) {
      setCenterSearchInput(toCenterSearchOptionText(centerSearchResults[index], index))
    }

    if (!options?.silentStatus) {
      setCenterSearchStatus({ message: `기준점 적용: ${selected.label}`, tone: "ok" })
    }
    return true
  }

  const applyCenterSearchResultFromInput = (options?: { silentStatus?: boolean }): boolean => {
    const resultId = getCenterSearchResultIdFromInput(centerSearchInput, centerSearchResults)
    if (!resultId) return false
    return applyCenterSearchResultById(resultId, options)
  }

  const searchDistanceCenter = async () => {
    const query = centerSearchInput.trim()
    if (!query) {
      setCenterSearchStatus({ message: "검색어를 입력하세요. 예: 상현역, 광교호수공원", tone: "warn" })
      return
    }

    const seq = centerSearchSeqRef.current + 1
    centerSearchSeqRef.current = seq
    setCenterSearchSelectOpen(false)
    setCenterSearchLoading(true)
    setCenterSearchStatus({ message: `주소 검색 중: ${query}`, tone: "muted" })

    try {
      const providers: Array<{ label: string; fetcher: (q: string) => Promise<Array<Record<string, unknown>>> }> = [
        { label: "Photon", fetcher: fetchCenterSearchByPhoton },
        { label: "Nominatim", fetcher: fetchCenterSearchByNominatim },
      ]

      let providerLabel = providers[0].label
      let payload: Array<Record<string, unknown>> = []
      let lastErrorMessage = ""

      for (const provider of providers) {
        providerLabel = provider.label
        try {
          payload = await provider.fetcher(query)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          lastErrorMessage = `${provider.label}: ${message}`
          continue
        }

        if (seq !== centerSearchSeqRef.current) return
        if (Array.isArray(payload) && payload.length) break
      }

      const nextResults = (Array.isArray(payload) ? payload : [])
        .map((item, index) => normalizeCenterSearchResult(item, index))
        .filter((item): item is CenterSearchResult => item !== null)

      setCenterSearchResults(nextResults)
      setSelectedCenterSearchResultId("")
      setCenterSearchSelectOpen(false)

      if (!nextResults.length) {
        const suffix = lastErrorMessage ? ` (${lastErrorMessage})` : ""
        setCenterSearchStatus({ message: `검색 결과가 없습니다. 다른 키워드로 시도하세요.${suffix}`, tone: "warn" })
        return
      }

      setCenterSearchStatus({
        message: `${nextResults.length}건 검색됨 (${providerLabel}) · Select를 열어 기준점을 선택하세요.`,
        tone: "ok",
      })
    } catch (error) {
      if (seq !== centerSearchSeqRef.current) return
      const message = error instanceof Error ? error.message : String(error)
      setCenterSearchStatus({ message: `주소 검색 실패: ${message}`, tone: "warn" })
    } finally {
      if (seq === centerSearchSeqRef.current) {
        setCenterSearchLoading(false)
      }
    }
  }

  const loadJsonText = useCallback((text: string) => {
    try {
      const payload = JSON.parse(text)
      const nextRows = parseJsonToRows(payload)

      setRows(nextRows)
      setSort([])
      setSelectedConveniences([])
      setAdvancedRules([])
      setNextRuleId(1)
      clearDistanceCenter()
      setCenterSearchResults([])
      setCenterSearchInput("")
      setCenterSearchStatus({ message: "주소/건물명을 검색하고 옵션에서 선택하면 거리를 계산합니다.", tone: "muted" })
      setTopKeywordFilter("all")
      setStatusError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("JSON")) {
        setStatusError(`JSON 파싱 실패: ${message}`)
      } else {
        setStatusError(`데이터 변환 실패: ${message}`)
      }
    }
  }, [clearDistanceCenter])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => loadJsonText(String(reader.result || ""))
    reader.readAsText(file, "utf-8")
  }

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      event.preventDefault()
    }

    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      const file = event.dataTransfer?.files?.[0]
      if (!file || !file.name.toLowerCase().endsWith(".json")) return
      const reader = new FileReader()
      reader.onload = () => loadJsonText(String(reader.result || ""))
      reader.readAsText(file, "utf-8")
    }

    window.addEventListener("dragover", onDragOver)
    window.addEventListener("drop", onDrop)

    return () => {
      window.removeEventListener("dragover", onDragOver)
      window.removeEventListener("drop", onDrop)
    }
  }, [loadJsonText])

  const updateSort = (key: ColumnDef["key"], isMulti: boolean) => {
    setSort((prev) => {
      const next = [...prev]
      const idx = next.findIndex((item) => item.key === key)

      if (isMulti) {
        if (idx < 0) {
          next.push({ key, dir: "asc" })
        } else if (next[idx].dir === "asc") {
          next[idx] = { ...next[idx], dir: "desc" }
        } else {
          next.splice(idx, 1)
        }
        return next
      }

      if (idx === 0 && next.length === 1 && next[0].dir === "asc") {
        return [{ key, dir: "desc" }]
      }
      if (idx === 0 && next.length === 1 && next[0].dir === "desc") {
        return []
      }
      return [{ key, dir: "asc" }]
    })
  }

  const handleCenterFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!applyCenterSearchResultFromInput()) {
      void searchDistanceCenter()
    }
  }

  const addAdvancedRule = () => {
    if (!filterFields.length) return
    const def = filterFields[0]
    const rule: AdvancedRule = {
      id: nextRuleId,
      field: def.key,
      op: defaultOpForType(def.type),
      value1: "",
      value2: "",
    }
    setAdvancedRules((prev) => [...prev, rule])
    setNextRuleId((id) => id + 1)
  }

  const clearAdvancedRules = () => {
    setAdvancedRules([])
  }

  const removeAdvancedRule = (ruleId: number) => {
    setAdvancedRules((prev) => prev.filter((rule) => rule.id !== ruleId))
  }

  const updateRuleField = (ruleId: number, fieldKey: string) => {
    setAdvancedRules((prev) =>
      prev.map((rule) => {
        if (rule.id !== ruleId) return rule
        const def = getFieldDef(fieldKey)
        return {
          ...rule,
          field: fieldKey,
          op: defaultOpForType(def?.type || "text"),
          value1: "",
          value2: "",
        }
      })
    )
  }

  const updateRuleOp = (ruleId: number, op: string) => {
    setAdvancedRules((prev) =>
      prev.map((rule) => {
        if (rule.id !== ruleId) return rule
        const nextRule = { ...rule, op }
        if (!opNeedsValue(op)) {
          nextRule.value1 = ""
          nextRule.value2 = ""
        } else if (!opNeedsSecondValue(op)) {
          nextRule.value2 = ""
        }
        return nextRule
      })
    )
  }

  const updateRuleValue = (ruleId: number, key: "value1" | "value2", value: string) => {
    setAdvancedRules((prev) => prev.map((rule) => (rule.id === ruleId ? { ...rule, [key]: value } : rule)))
  }

  const toggleConvenience = (name: string) => {
    setSelectedConveniences((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    )
  }

  const clearConvenience = () => {
    setSelectedConveniences([])
  }

  const resetFilters = () => {
    const nowDate = new Date()
    setSearchInput("")
    setMinReviewPreset(DEFAULT_MIN_REVIEW)
    setMaxDistancePreset(DEFAULT_MAX_DISTANCE)
    setCenterSearchInput("")
    setCenterSearchResults([])
    clearDistanceCenter()
    setCenterSearchStatus({ message: "주소/건물명을 검색하고 옵션에서 선택하면 거리를 계산합니다.", tone: "muted" })
    setRefDate(toInputDate(nowDate))
    setRefTime(toInputTime(nowDate))
    setRefOpenMode("all")
    setTopKeywordFilter("all")
    setConvenienceMode("all")
    setAdvMode("all")
    setAccordionValues(["convenience", "advanced"])
    setSort([])
    setSelectedConveniences([])
    setAdvancedRules([])
    setStatusError(null)
  }

  const getSortMarker = (key: ColumnDef["key"]): string => {
    const idx = sort.findIndex((item) => item.key === key)
    if (idx < 0) return ""
    const item = sort[idx]
    return `${idx + 1}${item.dir === "asc" ? "▲" : "▼"}`
  }

  const renderCell = (row: PlaceRow, column: ColumnDef) => {
    if (column.key === "name") {
      const name = row.name || "(이름 없음)"
      if (row.mapUrl) {
        return (
          <a className="text-primary hover:underline" href={row.mapUrl} target="_blank" rel="noreferrer noopener">
            {name}
          </a>
        )
      }
      return name
    }

    if (column.key === "reviewCount") return numFmt.format(row.reviewCount)
    if (column.key === "distanceM") return row.distanceM == null ? "-" : numFmt.format(row.distanceM)

    if (column.key === "topKeywordPct") {
      if (!row.topKeyword && row.topKeywordPct <= 0) return "-"
      const pct = `${row.topKeywordPct.toFixed(1)}%`
      const key = row.topKeyword ? ` (${row.topKeyword})` : ""
      return `${pct}${key}`
    }

    if (column.key === "openAtRefRank") return row.openAtRefLabel || "-"
    if (column.key === "petFriendly") return row.petFriendly ? "동반 가능" : "정보 없음"

    return toText(row[column.key]) || "-"
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,rgba(15,118,110,0.14),transparent_42%),radial-gradient(circle_at_100%_0%,rgba(59,130,246,0.14),transparent_40%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-3 md:p-5">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3">
        <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl font-bold tracking-tight">플레이스 데이터그리드</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                React + shadcn/ui 기반 뷰어입니다. JSON(객체/배열) 로드 후 정렬, 복합 필터, 기준점 거리 계산,
                고급 규칙 필터를 지원합니다.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="gap-3">
              <Badge variant="secondary" className="w-fit text-xs">1. JSON 업로드</Badge>
              <Badge variant="secondary" className="w-fit text-xs">2. 조건 선택</Badge>
              <Badge variant="secondary" className="w-fit text-xs">3. 결과 확인</Badge>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-3 xl:grid-cols-[430px_minmax(0,1fr)]">
          <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5">
            <CardContent className="p-4">
              <ScrollArea className="h-[min(72vh,860px)] pr-3">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground" htmlFor="fileInput">JSON 파일</label>
                    <Input id="fileInput" ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFileChange} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground" htmlFor="searchInput">통합 검색</label>
                    <Input
                      id="searchInput"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="예: 파스타, 주차, 광교중앙역"
                    />
                    <p className="text-[11px] text-muted-foreground">콤마(,)로 여러 키워드를 입력하면 OR 조건으로 검색합니다.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">최소 리뷰 수</label>
                    <div className="flex flex-wrap gap-2" id="minReviewsChips">
                      {MIN_REVIEW_PRESETS.map((preset) => (
                        <Button
                          key={preset.value}
                          type="button"
                          size="sm"
                          variant={preset.value === minReviewPreset ? "default" : "outline"}
                          onClick={() => setMinReviewPreset(preset.value)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">최대 거리(m)</label>
                    <div className="flex flex-wrap gap-2" id="maxDistanceChips">
                      {MAX_DISTANCE_PRESETS.map((preset) => (
                        <Button
                          key={preset.label}
                          type="button"
                          size="sm"
                          variant={preset.value === maxDistancePreset ? "default" : "outline"}
                          onClick={() => setMaxDistancePreset(preset.value)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground" htmlFor="centerSearchInput">
                      거리 기준 주소/건물명
                    </label>
                    <form id="centerSearchForm" className="grid gap-2 md:grid-cols-[1fr_1.2fr_auto]" onSubmit={handleCenterFormSubmit}>
                      <Input
                        id="centerSearchInput"
                        value={centerSearchInput}
                        onChange={(event) => setCenterSearchInput(event.target.value)}
                        onBlur={() => {
                          applyCenterSearchResultFromInput({ silentStatus: true })
                        }}
                        placeholder="예: 상현역, 광교호수공원"
                      />
                      <div id="centerSearchSelectRoot" className="w-full">
                        <Select
                          open={centerSearchSelectOpen}
                          onOpenChange={(open) => {
                            if (!centerSearchResults.length && open) {
                              setCenterSearchStatus({
                                message: "검색 결과가 없습니다. 먼저 주소/건물명을 검색하세요.",
                                tone: "warn",
                              })
                              return
                            }
                            setCenterSearchSelectOpen(open)
                          }}
                          value={selectedCenterSearchResultId || undefined}
                          onValueChange={(value) => {
                            applyCenterSearchResultById(value)
                          }}
                        >
                          <SelectTrigger id="centerSearchSelectTrigger" className="w-full">
                            <SelectValue
                              id="centerSearchSelectValue"
                              placeholder={centerSelectPlaceholder}
                            />
                          </SelectTrigger>
                          <SelectContent id="centerSearchOptions" className="max-h-72">
                            {centerSearchResults.map((item, idx) => (
                              <SelectItem key={item.id} value={item.id}>
                                {toCenterSearchOptionText(item, idx)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button id="searchCenterBtn" type="submit" variant="secondary" className="w-full md:w-auto">
                        {centerSearchLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                        {centerSearchLoading ? "검색중..." : "검색"}
                      </Button>
                    </form>
                    <p
                      id="centerSearchStatus"
                      data-tone={centerSearchStatus.tone}
                      className={[
                        "text-xs",
                        centerSearchStatus.tone === "ok" ? "text-emerald-600" : "",
                        centerSearchStatus.tone === "warn" ? "text-red-600" : "",
                        centerSearchStatus.tone === "muted" ? "text-muted-foreground" : "",
                      ].join(" ")}
                    >
                      {centerSearchStatus.message}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground" htmlFor="refDate">기준 날짜</label>
                      <Input id="refDate" type="date" value={refDate} onChange={(event) => setRefDate(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground" htmlFor="refTime">기준 시간</label>
                      <Input id="refTime" type="time" step={60} value={refTime} onChange={(event) => setRefTime(event.target.value)} />
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">기준시각 영업 상태</label>
                      <Select value={refOpenMode} onValueChange={setRefOpenMode}>
                        <SelectTrigger id="refOpenMode" className="w-full">
                          <SelectValue placeholder="전체" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">전체</SelectItem>
                          <SelectItem value="open">영업중만</SelectItem>
                          <SelectItem value="break">브레이크타임만</SelectItem>
                          <SelectItem value="closed">영업종료만</SelectItem>
                          <SelectItem value="unknown">계산불가/휴무만</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground">최상위 키워드</label>
                      <Select value={topKeywordFilter} onValueChange={setTopKeywordFilter}>
                        <SelectTrigger id="topKeywordFilter" className="w-full">
                          <SelectValue placeholder="전체" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">전체</SelectItem>
                          {topKeywordCatalog.map((item) => (
                            <SelectItem key={item.keyword} value={item.keyword}>
                              {item.keyword} ({numFmt.format(item.count)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button id="resetBtn" type="button" variant="outline" className="w-full" onClick={resetFilters}>
                    <RotateCcw className="size-4" /> 필터 초기화
                  </Button>

                  <Separator />

                  <div id="sortChips" className="flex flex-wrap gap-2">
                    {sort.map((item, idx) => {
                      const col = columns.find((c) => c.key === item.key)
                      return (
                        <Badge key={item.key} variant="secondary" className="gap-2">
                          {idx + 1}. {col ? col.label : item.key} {item.dir === "asc" ? "▲" : "▼"}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-5 text-destructive hover:text-destructive"
                            onClick={() => setSort((prev) => prev.filter((rule) => rule.key !== item.key))}
                          >
                            <X className="size-3" />
                          </Button>
                        </Badge>
                      )
                    })}
                  </div>

                  <Accordion
                    type="multiple"
                    value={accordionValues}
                    onValueChange={setAccordionValues}
                    className="rounded-lg border bg-muted/30 px-3"
                  >
                    <AccordionItem value="convenience">
                      <AccordionTrigger id="convenienceAccordionTrigger" className="py-3">
                        <div className="flex flex-col gap-1 text-left">
                          <span className="font-semibold">편의시설 및 서비스 필터</span>
                          <span className="text-xs text-muted-foreground">옵션/편의시설 정보를 합쳐 필터합니다.</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent id="convenienceAccordionContent" className="space-y-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-[180px] flex-1 space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground">선택 방식</label>
                            <Select value={convenienceMode} onValueChange={(value: RuleMode) => setConvenienceMode(value)}>
                              <SelectTrigger id="convenienceMode" className="w-full">
                                <SelectValue placeholder="모두 포함" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">모두 포함</SelectItem>
                                <SelectItem value="any">하나 이상 포함</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button id="clearConvenienceBtn" variant="outline" type="button" onClick={clearConvenience}>
                            선택 해제
                          </Button>
                        </div>
                        <div id="convenienceChips" className="flex flex-wrap gap-2">
                          {!convenienceCatalog.length ? (
                            <div className="rounded-md border border-dashed bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                              편의시설 데이터가 없습니다.
                            </div>
                          ) : (
                            convenienceCatalog.map((item) => {
                              const active = selectedConveniences.includes(item.name)
                              return (
                                <Button
                                  key={item.name}
                                  type="button"
                                  size="sm"
                                  variant={active ? "default" : "outline"}
                                  onClick={() => toggleConvenience(item.name)}
                                >
                                  {item.name} ({numFmt.format(item.count)})
                                </Button>
                              )
                            })
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="advanced">
                      <AccordionTrigger id="advancedAccordionTrigger" className="py-3">
                        <div className="flex flex-col gap-1 text-left">
                          <span className="font-semibold">고급 필터</span>
                          <span className="text-xs text-muted-foreground">파생/원본 필드에 규칙 기반 조건을 추가합니다.</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent id="advancedAccordionContent" className="space-y-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-[180px] flex-1 space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground">규칙 결합</label>
                            <Select value={advMode} onValueChange={(value: RuleMode) => setAdvMode(value)}>
                              <SelectTrigger id="advMode" className="w-full">
                                <SelectValue placeholder="모두 일치" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">모두 일치</SelectItem>
                                <SelectItem value="any">하나 이상 일치</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button id="addRuleBtn" type="button" onClick={addAdvancedRule}>규칙 추가</Button>
                          <Button id="clearRulesBtn" type="button" variant="outline" onClick={clearAdvancedRules}>규칙 전체 삭제</Button>
                        </div>

                        <div id="ruleList" className="space-y-2">
                          {!filterFields.length ? (
                            <div className="rounded-md border border-dashed bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                              파일을 먼저 불러오면 필드 목록이 생성됩니다.
                            </div>
                          ) : !advancedRules.length ? (
                            <div className="rounded-md border border-dashed bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                              규칙이 없습니다. 규칙 추가 버튼으로 필터 조건을 추가하세요.
                            </div>
                          ) : (
                            advancedRules.map((rule) => {
                              const def = getFieldDef(rule.field) || filterFields[0]
                              const ops = getOpsForType(def?.type || "text")
                              const inputType = (def?.type || "text") === "number" ? "number" : "text"

                              return (
                                <div
                                  key={rule.id}
                                  className="grid gap-2 rounded-md border bg-background p-2 sm:grid-cols-[minmax(220px,1.3fr)_minmax(132px,0.8fr)_minmax(120px,1fr)_minmax(120px,1fr)_auto]"
                                >
                                  <Select value={rule.field} onValueChange={(value) => updateRuleField(rule.id, value)}>
                                    <SelectTrigger className="w-full">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-80">
                                      {filterFields.map((field) => (
                                        <SelectItem key={field.key} value={field.key}>
                                          {field.label} [{getTypeLabel(field.type)}]
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  <Select value={rule.op} onValueChange={(value) => updateRuleOp(rule.id, value)}>
                                    <SelectTrigger className="w-full">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ops.map((op) => (
                                        <SelectItem key={op.value} value={op.value}>
                                          {op.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  <Input
                                    type={inputType}
                                    step="any"
                                    placeholder="값"
                                    value={rule.value1}
                                    onChange={(event) => updateRuleValue(rule.id, "value1", event.target.value)}
                                    className={!opNeedsValue(rule.op) ? "hidden" : ""}
                                  />

                                  <Input
                                    type={inputType}
                                    step="any"
                                    placeholder="끝값"
                                    value={rule.value2}
                                    onChange={(event) => updateRuleValue(rule.id, "value2", event.target.value)}
                                    className={!opNeedsSecondValue(rule.op) ? "hidden" : ""}
                                  />

                                  <Button type="button" variant="outline" onClick={() => removeAdvancedRule(rule.id)}>
                                    삭제
                                  </Button>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5">
            <CardHeader className="space-y-3">
              <div id="status" className="space-y-2">
                {statusError ? (
                  <div className="text-sm font-medium text-red-600">{statusError}</div>
                ) : (
                  <>
                    <div className="text-sm text-muted-foreground">
                      데이터 <strong>{numFmt.format(viewRows.length)}</strong> / {numFmt.format(rows.length)}개
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {statusBadges.length ? (
                        statusBadges.map((label) => (
                          <Badge key={label} variant="secondary">{label}</Badge>
                        ))
                      ) : (
                        <Badge variant="outline">필터 없음</Badge>
                      )}
                    </div>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <ScrollArea className="h-[min(72vh,860px)] rounded-md border bg-background md:hidden">
                <div className="space-y-2 p-2">
                  {!viewRows.length ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      데이터가 없습니다. 파일을 불러오거나 필터를 완화해 주세요.
                    </div>
                  ) : (
                    viewRows.map((row) => (
                      <div key={`${row.id}-${row._index}`} className="space-y-2 rounded-lg border bg-card p-3">
                        <div className="flex items-start justify-between gap-2">
                          {row.mapUrl ? (
                            <a className="font-semibold text-primary hover:underline" href={row.mapUrl} target="_blank" rel="noreferrer noopener">
                              {row.name || "(이름 없음)"}
                            </a>
                          ) : (
                            <span className="font-semibold">{row.name || "(이름 없음)"}</span>
                          )}
                          <Badge variant="outline">{row.openAtRefLabel || "-"}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="space-y-1">
                            <div className="text-muted-foreground">카테고리</div>
                            <div className="break-words">{row.category || "-"}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-muted-foreground">리뷰수</div>
                            <div className="tabular-nums">{numFmt.format(row.reviewCount)}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-muted-foreground">거리</div>
                            <div className="tabular-nums">{row.distanceM == null ? "-" : `${numFmt.format(row.distanceM)}m`}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-muted-foreground">키워드</div>
                            <div className="break-words">{row.topKeyword || "-"}</div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground break-words">{row.address || "-"}</div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              <ScrollArea className="hidden h-[min(72vh,860px)] rounded-md border bg-background md:block">
                <div className="min-w-[760px]">
                  <Table>
                    <TableHeader id="head" className="sticky top-0 z-10 bg-muted/70 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                      <TableRow>
                        {columns.map((column) => {
                          const marker = getSortMarker(column.key)
                          return (
                            <TableHead key={column.key}>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-auto w-full justify-start px-0 py-0 text-xs font-semibold"
                                onClick={(event) => updateSort(column.key, event.shiftKey)}
                              >
                                <span>{column.label}</span>
                                {marker ? <Badge variant="outline" className="ml-1 text-[10px]">{marker}</Badge> : null}
                              </Button>
                            </TableHead>
                          )
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody id="body">
                      {!viewRows.length ? (
                        <TableRow>
                          <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                            데이터가 없습니다. 파일을 불러오거나 필터를 완화해 주세요.
                          </TableCell>
                        </TableRow>
                      ) : (
                        viewRows.map((row) => (
                          <TableRow key={`${row.id}-${row._index}`}>
                            {columns.map((column) => {
                              const classNames: string[] = []
                              if (column.type === "number") classNames.push("text-right tabular-nums")
                              if (column.key === "petFriendly") {
                                classNames.push(row.petFriendly ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold")
                              }
                              if (column.key === "openAtRefRank") {
                                if (row.openAtRefCode === "open") classNames.push("text-emerald-600 font-semibold")
                                else if (row.openAtRefCode === "break") classNames.push("text-amber-600 font-semibold")
                                else if (row.openAtRefCode === "closed" || row.openAtRefLabel === "휴무") {
                                  classNames.push("text-red-600 font-semibold")
                                } else {
                                  classNames.push("text-muted-foreground font-semibold")
                                }
                              }

                              return (
                                <TableCell key={`${row.id}-${column.key}`} className={classNames.join(" ")}>
                                  {renderCell(row, column)}
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default App
