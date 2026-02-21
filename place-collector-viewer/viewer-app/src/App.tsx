import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  ChevronsUpDown,
  FolderOpen,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react"
import {
  type ColumnDef as TanstackColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type ColumnType = "text" | "number" | "boolean"
type RawRecord = Record<string, unknown>
type RuleMode = "all" | "any"
type CenterStatusTone = "muted" | "ok" | "warn"

type Primitive = string | number | boolean | null | undefined

interface ColumnDef {
  key: keyof PlaceRow | "openAtRefRank"
  label: string
  type: ColumnType
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
  _searchText: string
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
  hasTakeoutOption: boolean
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
  { key: "priceCategory", label: "가격대", type: "text" },
  { key: "hasParkingOption", label: "주차", type: "boolean" },
  { key: "hasTakeoutOption", label: "포장", type: "boolean" },
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
  hasTakeoutOption: { label: "옵션:포장", type: "boolean" },
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
const ACTIVE_FIELD_CLASS = "h-8"
const APP_SURFACE_CLASS = "min-h-screen bg-[radial-gradient(circle_at_0%_0%,rgba(15,118,110,0.14),transparent_42%),radial-gradient(circle_at_100%_0%,rgba(59,130,246,0.14),transparent_40%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-4 md:p-6 xl:h-dvh xl:overflow-hidden"
const APP_CONTENT_CLASS = "mx-auto flex w-full max-w-[1600px] flex-col gap-4 xl:h-full xl:min-h-0"
const APP_GRID_CLASS = "grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[360px_minmax(0,1fr)]"
const CARD_HEADER_CLASS = "space-y-2 px-4 py-0 md:px-5"
const CARD_CONTENT_CLASS = "min-w-0 px-4 py-0 md:px-5 xl:flex xl:min-h-0 xl:flex-1"
const PANEL_STACK_CLASS = "min-w-0 w-full max-w-full gap-4"
const FIELD_STACK_CLASS = "min-w-0 flex flex-col gap-2"
const CHIP_ROW_CLASS = "flex flex-wrap gap-2"
const TWO_COL_GRID_CLASS = "grid gap-3 sm:grid-cols-2"
const ACTION_ROW_CLASS = "flex flex-wrap items-end gap-3"
const MOBILE_ROW_CARD_CLASS = "space-y-3 rounded-lg border bg-card p-3"
const CENTER_SEARCH_MIN_QUERY = 2
const CENTER_SEARCH_DEBOUNCE_MS = 320
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

function uiToken(value: unknown): string {
  const base = toText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || "na"
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

function normalizePriceCategory(text: unknown): string {
  return toText(text).replace(/\s+/g, " ").trim()
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

function computeReferenceOpenState(row: PlaceRow, refDateTime: Date, rawMap: Map<number, RawRecord>): OpenState {
  const fallback = row.openDesc ? `계산불가 · ${row.openDesc}` : "계산불가"
  if (!(refDateTime instanceof Date) || Number.isNaN(refDateTime.getTime())) {
    return { label: fallback, rank: 0, code: "unknown" }
  }

  const raw = rawMap.get(row._index)
  const details = raw && Array.isArray((raw as { detailHours?: unknown }).detailHours)
    ? ((raw as { detailHours: Array<Record<string, unknown>> }).detailHours ?? [])
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

function formatDetailHours(raw: RawRecord | undefined): string[] {
  if (!raw) return []
  const details = Array.isArray((raw as { detailHours?: unknown }).detailHours)
    ? ((raw as { detailHours: Array<Record<string, unknown>> }).detailHours ?? [])
    : []
  if (!details.length) return []

  const lines: string[] = []
  for (const entry of details) {
    const day = toText(entry.day)
    const bh = entry.businessHours as { start?: string; end?: string } | null | undefined
    if (!bh || !bh.start) {
      lines.push(`${day}  휴무`)
      continue
    }
    let line = `${day}  ${bh.start}–${bh.end}`
    const breaks = Array.isArray(entry.breakHours) ? (entry.breakHours as Array<{ start?: string; end?: string }>) : []
    if (breaks.length) {
      line += `  (브레이크 ${breaks.map((b) => `${b.start}–${b.end}`).join(", ")})`
    }
    const lastOrders = Array.isArray(entry.lastOrderTimes) ? (entry.lastOrderTimes as Array<{ time?: string }>) : []
    if (lastOrders.length) {
      const times = lastOrders.map((lo) => lo.time).filter(Boolean)
      if (times.length) line += `  L.O ${times.join(", ")}`
    }
    lines.push(line)
  }
  return lines
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

  const name = toText(raw.name)
  const category = toText(raw.category)
  const address = toText(raw.roadAddress || raw.commonAddress || "")
  const phone = toText(raw.detailPhone)
  const openDescText = toText((raw.detailStatus as { description?: Primitive } | undefined)?.description || (raw.newBusinessHours as { description?: Primitive } | undefined)?.description || "")
  const priceCategoryText = normalizePriceCategory(raw.priceCategory)
  const conveniencesTextVal = conveniences.join(", ")

  const _searchText = [
    name, category, address, options, phone,
    topKeyword.label, openDescText, priceCategoryText,
    parkingDetail, detailConveniences, conveniencesTextVal,
    broadcastInfo,
  ].join(" ").toLowerCase()

  return {
    _index: index,
    _searchText,
    id: placeId,
    name,
    category,
    reviewCount,
    avgRating,
    rawDistanceM: parsedDistance,
    distanceM: parsedDistance,
    petFriendly: options.includes("반려동물 동반"),
    topKeyword: topKeyword.label,
    topKeywordCount: topKeyword.count,
    topKeywordPct: Number(topKeyword.pct.toFixed(1)),
    openDesc: openDescText,
    openAtRefLabel: "",
    openAtRefRank: 0,
    openAtRefCode: "unknown",
    address,
    roadAddress: toText(raw.roadAddress),
    commonAddress: toText(raw.commonAddress),
    phone,
    options,
    conveniences,
    conveniencesText: conveniencesTextVal,
    priceCategory: priceCategoryText,
    newOpening: Boolean(raw.newOpening),
    broadcastInfo,
    hasBroadcast: broadcastInfo.trim() !== "",
    parkingDetail,
    hasParkingDetail: parkingDetail.trim() !== "",
    hasParkingOption: options.includes("주차"),
    hasValetOption: options.includes("발렛"),
    hasReservationOption: options.includes("예약"),
    hasTakeoutOption: options.includes("포장"),
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

function parseJsonToRows(payload: unknown): { rows: PlaceRow[]; rawMap: Map<number, RawRecord> } {
  let entries: Array<[string, RawRecord]> = []

  if (Array.isArray(payload)) {
    entries = payload.map((record, i) => [String((record as RawRecord)?.id || i), (record as RawRecord) || {}])
  } else if (payload && typeof payload === "object") {
    entries = Object.entries(payload as Record<string, RawRecord>)
  } else {
    throw new Error("JSON 루트는 객체 또는 배열이어야 합니다.")
  }

  const rawMap = new Map<number, RawRecord>()
  const rows = entries.map(([id, record], i) => {
    const raw = record || {}
    rawMap.set(i, raw)
    return normalizeRecord(raw, id, i)
  })
  return { rows, rawMap }
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

function buildPriceCategoryCatalog(rows: PlaceRow[]): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const category = normalizePriceCategory(row.priceCategory)
    if (!category) continue
    counts.set(category, (counts.get(category) || 0) + 1)
  }

  const readLeadingNumber = (value: string): number | null => {
    const matched = value.match(/(\d+(?:\.\d+)?)/)
    if (!matched) return null
    const parsed = Number(matched[1])
    return Number.isFinite(parsed) ? parsed : null
  }

  return [...counts.entries()]
    .sort(([categoryA, countA], [categoryB, countB]) => {
      if (countA !== countB) return countB - countA
      const numberA = readLeadingNumber(categoryA)
      const numberB = readLeadingNumber(categoryB)
      if (numberA != null && numberB != null && numberA !== numberB) return numberA - numberB
      if (numberA != null && numberB == null) return -1
      if (numberA == null && numberB != null) return 1
      return categoryA.localeCompare(categoryB, "ko")
    })
    .map(([category, count]) => ({ category, count }))
}

function inferTypeFromRows(rows: PlaceRow[], fieldKey: string, rawMap?: Map<number, RawRecord>): ColumnType {
  const isRaw = fieldKey.startsWith("raw.")
  if (fieldKey === "raw.id") return "text"

  for (const row of rows) {
    const rowRecord = row as unknown as Record<string, unknown>
    let value: unknown
    if (isRaw) {
      const raw = rawMap?.get(row._index)
      value = raw ? (raw as Record<string, unknown>)[fieldKey.slice(4)] : undefined
    } else {
      value = rowRecord[fieldKey]
    }
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

function buildFilterFields(rows: PlaceRow[], rawMap: Map<number, RawRecord>): FieldDef[] {
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
    .filter((key) => !["_index", "_searchText"].includes(key))
    .forEach((key) => {
      const meta = DERIVED_FIELD_META[key]
      const type = meta?.type || inferTypeFromRows(rows, key, rawMap)
      const label = meta?.label || key
      pushField(key, label, type, "derived")
      derivedKeys.add(key)
    })

  const rawKeys = new Set<string>()
  for (const row of rows) {
    const raw = rawMap.get(row._index)
    if (raw) Object.keys(raw).forEach((key) => rawKeys.add(key))
  }

  Array.from(rawKeys)
    .sort((a, b) => a.localeCompare(b, "ko"))
    .forEach((rawKey) => {
      const mappedDerivedKey = RAW_TO_DERIVED_FIELD[rawKey] || rawKey
      if (derivedKeys.has(mappedDerivedKey)) return
      const key = `raw.${rawKey}`
      const type = inferTypeFromRows(rows, key, rawMap)
      const label = RAW_FIELD_LABELS[rawKey] || rawKey
      pushField(key, label, type, "raw")
    })

  return defs.sort((a, b) => {
    const labelOrder = a.label.localeCompare(b.label, "ko", { sensitivity: "base", numeric: true })
    if (labelOrder !== 0) return labelOrder
    return a.key.localeCompare(b.key, "ko", { sensitivity: "base", numeric: true })
  })
}

function getFieldValue(row: PlaceRow, fieldKey: string, rawMap?: Map<number, RawRecord>): unknown {
  if (fieldKey.startsWith("raw.")) {
    const raw = rawMap?.get(row._index)
    return raw ? (raw as Record<string, unknown>)[fieldKey.slice(4)] : undefined
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

function evaluateRule(row: PlaceRow, rule: AdvancedRule, filterFieldMap: Map<string, FieldDef>, rawMap?: Map<number, RawRecord>): boolean {
  const def = filterFieldMap.get(rule.field)
  if (!def) return true

  const leftRaw = getFieldValue(row, rule.field, rawMap)
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

function passAdvancedFilters(row: PlaceRow, rules: AdvancedRule[], mode: RuleMode, filterFieldMap: Map<string, FieldDef>, rawMap?: Map<number, RawRecord>): boolean {
  if (!rules.length) return true
  const results = rules.map((rule) => evaluateRule(row, rule, filterFieldMap, rawMap))
  return mode === "any" ? results.some(Boolean) : results.every(Boolean)
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
  const [sorting, setSorting] = useState<SortingState>([])

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
  const [priceCategoryFilter, setPriceCategoryFilter] = useState("all")

  const [convenienceMode, setConvenienceMode] = useState<RuleMode>("all")
  const [selectedConveniences, setSelectedConveniences] = useState<string[]>([])

  const [advMode, setAdvMode] = useState<RuleMode>("all")
  const [advancedRules, setAdvancedRules] = useState<AdvancedRule[]>([])
  const [nextRuleId, setNextRuleId] = useState(1)

  const [statusError, setStatusError] = useState<string | null>(null)
  const [convenienceDialogOpen, setConvenienceDialogOpen] = useState(false)
  const [advancedDialogOpen, setAdvancedDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const centerSearchSeqRef = useRef(0)
  const rawMapRef = useRef<Map<number, RawRecord>>(new Map())

  const desktopScrollRef = useRef<HTMLDivElement | null>(null)
  const mobileScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 200)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const convenienceCatalog = useMemo(() => buildConvenienceCatalog(rows), [rows])
  const topKeywordCatalog = useMemo(() => buildTopKeywordCatalog(rows), [rows])
  const priceCategoryCatalog = useMemo(() => buildPriceCategoryCatalog(rows), [rows])
  const filterFields = useMemo(() => buildFilterFields(rows, rawMapRef.current), [rows])
  const filterFieldMap = useMemo(() => new Map(filterFields.map((field) => [field.key, field])), [filterFields])

  useEffect(() => {
    if (topKeywordFilter !== "all" && !topKeywordCatalog.some((item) => item.keyword === topKeywordFilter)) {
      setTopKeywordFilter("all")
    }
  }, [topKeywordCatalog, topKeywordFilter])

  useEffect(() => {
    if (priceCategoryFilter !== "all" && !priceCategoryCatalog.some((item) => item.category === priceCategoryFilter)) {
      setPriceCategoryFilter("all")
    }
  }, [priceCategoryCatalog, priceCategoryFilter])

  const referenceDateTime = useMemo(() => getReferenceDateTime(refDate, refTime), [refDate, refTime])
  const keywords = useMemo(() => parseSearchKeywords(debouncedSearch), [debouncedSearch])

  const distanceMap = useMemo(() => {
    if (!distanceCenter) return null
    const map = new Map<number, number | null>()
    for (const row of rows) {
      map.set(row._index, distanceFromXYMeters(row.x, row.y, distanceCenter.x, distanceCenter.y))
    }
    return map
  }, [rows, distanceCenter])

  const openStateMap = useMemo(() => {
    const map = new Map<number, OpenState>()
    for (const row of rows) {
      map.set(row._index, computeReferenceOpenState(row, referenceDateTime, rawMapRef.current))
    }
    return map
  }, [rows, referenceDateTime])

  const rowsWithComputed = useMemo(() => {
    return rows.map((row) => {
      const runtimeDistance = distanceMap ? (distanceMap.get(row._index) ?? null) : null
      const openState = openStateMap.get(row._index) || { label: "계산불가", rank: 0, code: "unknown" }
      return {
        ...row,
        distanceM: runtimeDistance,
        openAtRefLabel: openState.label,
        openAtRefRank: openState.rank,
        openAtRefCode: openState.code,
      }
    })
  }, [rows, distanceMap, openStateMap])

  const showDistanceColumn = distanceCenter !== null
  const visibleColumns = useMemo(
    () => (showDistanceColumn ? columns : columns.filter((column) => column.key !== "distanceM")),
    [showDistanceColumn]
  )

  useEffect(() => {
    if (showDistanceColumn) return
    setSorting((prev) => {
      const next = prev.filter((item) => item.id !== "distanceM")
      return next.length === prev.length ? prev : next
    })
  }, [showDistanceColumn])

  const effectiveMaxDistance = distanceCenter && maxDistancePreset != null ? maxDistancePreset : null

  const filteredRows = useMemo(() => {
    return rowsWithComputed.filter((row) => {
      if (row.reviewCount < minReviewPreset) return false

      if (effectiveMaxDistance != null) {
        if (row.distanceM == null || row.distanceM > effectiveMaxDistance) return false
      }

      if (refOpenMode !== "all" && row.openAtRefCode !== refOpenMode) return false
      if (topKeywordFilter !== "all" && row.topKeyword !== topKeywordFilter) return false
      if (priceCategoryFilter !== "all" && normalizePriceCategory(row.priceCategory) !== priceCategoryFilter) return false

      if (selectedConveniences.length) {
        if (convenienceMode === "all") {
          if (!selectedConveniences.every((item) => row.conveniences.includes(item))) return false
        } else if (!selectedConveniences.some((item) => row.conveniences.includes(item))) {
          return false
        }
      }

      if (keywords.length) {
        const openRefLower = row.openAtRefLabel.toLowerCase()
        if (!keywords.some((keyword) => row._searchText.includes(keyword) || openRefLower.includes(keyword))) return false
      }

      if (!passAdvancedFilters(row, advancedRules, advMode, filterFieldMap, rawMapRef.current)) return false

      return true
    })
  }, [rowsWithComputed, minReviewPreset, effectiveMaxDistance, refOpenMode, topKeywordFilter, priceCategoryFilter, selectedConveniences, convenienceMode, keywords, advancedRules, advMode, filterFieldMap])

  const viewRows = filteredRows

  const statusBadges = useMemo(() => {
    const list: string[] = []
    if (keywords.length > 0) list.push(`검색 ${keywords.length}`)
    if (minReviewPreset > 0) list.push(`최소 리뷰 ${numFmt.format(minReviewPreset)}+`)
    if (maxDistancePreset != null) list.push(`최대 거리 ${numFmt.format(maxDistancePreset)}m`)
    if (priceCategoryFilter !== "all") list.push(`가격대 ${priceCategoryFilter}`)
    if (selectedConveniences.length > 0) list.push(`편의시설 ${selectedConveniences.length}`)
    if (advancedRules.length > 0) list.push(`고급규칙 ${advancedRules.length}`)
    if (sorting.length > 0) list.push(`정렬 ${sorting.length}`)
    return list
  }, [keywords.length, minReviewPreset, maxDistancePreset, priceCategoryFilter, selectedConveniences.length, advancedRules.length, sorting.length])

  const selectedCenterSearchResult = useMemo(
    () => centerSearchResults.find((item) => item.id === selectedCenterSearchResultId) ?? null,
    [centerSearchResults, selectedCenterSearchResultId]
  )
  const centerComboboxLabel = selectedCenterSearchResult?.label || centerSearchInput.trim() || "주소/건물명을 입력해 검색하세요"

  const getFieldDef = (fieldKey: string): FieldDef | undefined => filterFieldMap.get(fieldKey)

  const clearDistanceCenter = useCallback(() => {
    setDistanceCenter(null)
    setSelectedCenterSearchResultId("")
    setCenterSearchSelectOpen(false)
  }, [])

  const applyCenterSearchResultById = useCallback((resultId: string): boolean => {
    const selected = centerSearchResults.find((item) => item.id === resultId)
    if (!selected) return false

    setDistanceCenter({ x: selected.x, y: selected.y })
    setSelectedCenterSearchResultId(resultId)
    setCenterSearchSelectOpen(false)
    setCenterSearchInput(selected.label)

    return true
  }, [centerSearchResults])

  const searchDistanceCenter = useCallback(async (queryInput?: string) => {
    const query = (queryInput ?? centerSearchInput).trim()
    if (!query) {
      setCenterSearchStatus({ message: "검색어를 입력하세요. 예: 상현역, 광교호수공원", tone: "warn" })
      return
    }

    const seq = centerSearchSeqRef.current + 1
    centerSearchSeqRef.current = seq
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
      setSelectedCenterSearchResultId((prevId) =>
        nextResults.some((item) => item.id === prevId) ? prevId : ""
      )

      if (!nextResults.length) {
        const suffix = lastErrorMessage ? ` (${lastErrorMessage})` : ""
        setCenterSearchStatus({ message: `검색 결과가 없습니다. 다른 키워드로 시도하세요.${suffix}`, tone: "warn" })
        return
      }

      setCenterSearchStatus({
        message: `${nextResults.length}건 검색됨 (${providerLabel})`,
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
  }, [centerSearchInput])

  useEffect(() => {
    if (!centerSearchSelectOpen) return
    const query = centerSearchInput.trim()

    if (!query) {
      setCenterSearchResults([])
      setCenterSearchStatus({ message: "주소/건물명을 입력하면 자동으로 검색됩니다.", tone: "muted" })
      return
    }

    if (query.length < CENTER_SEARCH_MIN_QUERY) {
      setCenterSearchResults([])
      setCenterSearchStatus({ message: `${CENTER_SEARCH_MIN_QUERY}글자 이상 입력해 주세요.`, tone: "muted" })
      return
    }

    const timer = window.setTimeout(() => {
      void searchDistanceCenter(query)
    }, CENTER_SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [centerSearchInput, centerSearchSelectOpen, searchDistanceCenter])

  const loadJsonText = useCallback((text: string) => {
    setLoading(true)
    setTimeout(() => {
      try {
        const payload = JSON.parse(text)
        const { rows: nextRows, rawMap } = parseJsonToRows(payload)

        rawMapRef.current = rawMap
        setRows(nextRows)
        setSorting([])
        setSelectedConveniences([])
        setAdvancedRules([])
        setNextRuleId(1)
        clearDistanceCenter()
        setCenterSearchResults([])
        setCenterSearchInput("")
        setCenterSearchStatus({ message: "주소/건물명을 검색하고 옵션에서 선택하면 거리를 계산합니다.", tone: "muted" })
        setTopKeywordFilter("all")
        setPriceCategoryFilter("all")
        setStatusError(null)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes("JSON")) {
          setStatusError(`JSON 파싱 실패: ${message}`)
        } else {
          setStatusError(`데이터 변환 실패: ${message}`)
        }
      } finally {
        setLoading(false)
      }
    }, 0)
  }, [clearDistanceCenter])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setSelectedFileName(file.name)
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
    setDebouncedSearch("")
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
    setPriceCategoryFilter("all")
    setConvenienceMode("all")
    setAdvMode("all")
    setSorting([])
    setSelectedConveniences([])
    setAdvancedRules([])
    setStatusError(null)
  }

  const getSortMarker = (columnId: string): string => {
    const idx = sorting.findIndex((item) => item.id === columnId)
    if (idx < 0) return ""
    const item = sorting[idx]
    return `${idx + 1}${item.desc ? "▼" : "▲"}`
  }

  const renderCell = (row: PlaceRow, column: ColumnDef) => {
    if (column.key === "name") {
      const name = row.name || "(이름 없음)"
      if (row.mapUrl) {
        return (
          <a data-ui="a-001" className="text-primary hover:underline" href={row.mapUrl} target="_blank" rel="noreferrer noopener">
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
    if (column.key === "petFriendly") return row.petFriendly ? "🐾" : "-"
    if (column.key === "hasParkingOption") return row.hasParkingOption ? "🅿️" : "-"
    if (column.key === "hasTakeoutOption") return row.hasTakeoutOption ? "🥡" : "-"
    if (column.key === "priceCategory") {
      if (!row.priceCategory) return "-"
      const m = row.priceCategory.match(/(\d+)/)
      const n = m ? Number(m[1]) : 0
      if (n <= 1) return "💰"
      if (n <= 3) return "💰💰"
      if (n <= 5) return "💰💰💰"
      return "💰💰💰💰"
    }

    return toText(row[column.key]) || "-"
  }

  const desktopTableColumns: TanstackColumnDef<PlaceRow>[] = visibleColumns.map((column) => ({
    id: String(column.key),
    accessorFn: (row) => row[column.key as keyof PlaceRow],
    enableSorting: true,
    header: ({ column: tableColumn }) => {
      const marker = getSortMarker(tableColumn.id)
      const centerHeaderKeys = ["petFriendly", "hasParkingOption", "hasTakeoutOption", "openAtRefRank", "priceCategory"]
      const justify = centerHeaderKeys.includes(column.key as string) ? "justify-center" : "justify-start"
      return (
        <Button data-ui={`table-header-sort-button-${uiToken(tableColumn.id)}`}
          type="button"
          variant="ghost"
          className={`h-auto w-full ${justify} px-0 py-0 text-xs font-semibold`}
          onClick={tableColumn.getToggleSortingHandler()}
        >
          <span data-ui={`table-header-label-${uiToken(tableColumn.id)}`}>{column.label}</span>
          {marker ? <Badge data-ui={`table-header-sort-marker-${uiToken(tableColumn.id)}`} variant="outline" className="ml-1 text-[10px]">{marker}</Badge> : null}
        </Button>
      )
    },
    cell: ({ row }) => {
      const centerKeys = ["petFriendly", "hasParkingOption", "hasTakeoutOption", "openAtRefRank", "priceCategory"]
      const classNames: string[] = ["block"]
      if (centerKeys.includes(column.key as string)) classNames.push("text-center")
      else if (column.type === "number") classNames.push("text-right tabular-nums")
      if (column.key === "petFriendly") {
        if (row.original.petFriendly) classNames.push("text-emerald-600 font-semibold")
        else classNames.push("text-muted-foreground")
      }
      if (column.key === "hasParkingOption") {
        if (row.original.hasParkingOption) classNames.push("text-emerald-600 font-semibold")
        else classNames.push("text-muted-foreground")
      }
      if (column.key === "hasTakeoutOption") {
        if (row.original.hasTakeoutOption) classNames.push("text-emerald-600 font-semibold")
        else classNames.push("text-muted-foreground")
      }
      if (column.key === "openAtRefRank") {
        if (row.original.openAtRefCode === "open") classNames.push("text-emerald-600 font-semibold")
        else if (row.original.openAtRefCode === "break") classNames.push("text-amber-600 font-semibold")
        else if (row.original.openAtRefCode === "closed" || row.original.openAtRefLabel === "휴무") {
          classNames.push("text-red-600 font-semibold")
        } else {
          classNames.push("text-muted-foreground font-semibold")
        }
      }
      const cellContent = <span data-ui={`table-cell-content-${uiToken(row.id)}-${uiToken(column.key)}`} className={classNames.join(" ")}>{renderCell(row.original, column)}</span>

      if (column.key === "openAtRefRank") {
        const tooltipLines = formatDetailHours(rawMapRef.current.get(row.original._index))
        if (tooltipLines.length) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">{cellContent}</span>
              </TooltipTrigger>
              <TooltipContent side="left" className="whitespace-pre text-left font-mono text-[11px] leading-relaxed">
                {tooltipLines.join("\n")}
              </TooltipContent>
            </Tooltip>
          )
        }
      }

      if (column.key === "priceCategory" && row.original.priceCategory) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">{cellContent}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {row.original.priceCategory}
            </TooltipContent>
          </Tooltip>
        )
      }

      if (column.key === "hasParkingOption" && row.original.hasParkingOption) {
        let parkingTip = row.original.parkingDetail
        if (!parkingTip) {
          const raw = rawMapRef.current.get(row.original._index)
          const feeds = raw && Array.isArray((raw as { feeds?: unknown }).feeds)
            ? ((raw as { feeds: Array<Record<string, unknown>> }).feeds)
            : []
          for (const f of feeds) {
            const title = toText(f.title)
            const desc = toText(f.desc)
            if (title.includes("주차") || desc.includes("주차")) {
              parkingTip = title + (desc ? `\n${desc}` : "")
              break
            }
          }
        }
        if (parkingTip) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">{cellContent}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap text-left text-xs leading-relaxed">
                {parkingTip}
              </TooltipContent>
            </Tooltip>
          )
        }
      }

      return cellContent
    },
  }))

  const table = useReactTable({
    data: viewRows,
    columns: desktopTableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: true,
  })

  const tableRows = table.getRowModel().rows

  const desktopVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => desktopScrollRef.current,
    estimateSize: () => 40,
    overscan: 20,
  })

  const mobileVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => mobileScrollRef.current,
    estimateSize: () => 140,
    overscan: 10,
  })

  return (
    <TooltipProvider>
    <div data-ui="div-006" className={APP_SURFACE_CLASS}>
      {loading && (
        <div data-ui="loading-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-10 animate-spin text-primary" />
            <span className="text-sm font-medium text-muted-foreground">데이터 처리 중...</span>
          </div>
        </div>
      )}
      <div data-ui="div-007" className={APP_CONTENT_CLASS}>
        <div data-ui="div-018" className={APP_GRID_CLASS}>
          <Card data-ui="card-019" className="border-slate-200/80 shadow-xl shadow-slate-900/5 xl:flex xl:h-full xl:min-h-0 xl:flex-col">
            <CardHeader data-ui="card-019-header" className={CARD_HEADER_CLASS}>
              <CardTitle data-ui="card-019-title" className="text-xl font-semibold">Place Datagrid</CardTitle>
            </CardHeader>
            <CardContent data-ui="card-content-020" className={CARD_CONTENT_CLASS}>
              <ScrollArea
                data-ui="scroll-area-021"
                className="h-[min(72vh,860px)] w-full min-w-0 xl:h-full"
                viewportClassName="[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0"
              >
                <FieldGroup data-ui="field-group-022" className={PANEL_STACK_CLASS}>
                  <Field data-ui="field-023" className={FIELD_STACK_CLASS}>
                    <FieldLabel data-ui="field-label-024" className="text-xs font-semibold text-muted-foreground">JSON 파일</FieldLabel>
                    <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />
                    <Button data-ui="input-025" variant="outline" size="sm" className="w-full justify-start gap-2 text-left font-normal" onClick={() => fileInputRef.current?.click()}>
                      <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{selectedFileName ?? "파일을 선택하세요..."}</span>
                    </Button>
                  </Field>

                  <Field data-ui="field-026" className={FIELD_STACK_CLASS}>
                    <FieldLabel data-ui="field-label-027" className="text-xs font-semibold text-muted-foreground" htmlFor="searchInput">통합 검색</FieldLabel>
                    <Input data-ui="input-028"
                      className={ACTIVE_FIELD_CLASS}
                      id="searchInput"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="예: 파스타, 주차, 광교중앙역"
                    />
                    <FieldDescription data-ui="field-desc-029" className="text-[11px] text-muted-foreground">
                      콤마(,)로 여러 키워드를 입력하면 OR 조건으로 검색합니다.
                    </FieldDescription>
                  </Field>

                  <Field data-ui="field-030" className={FIELD_STACK_CLASS}>
                    <FieldLabel data-ui="field-label-031" className="text-xs font-semibold text-muted-foreground">최소 리뷰 수</FieldLabel>
                    <div data-ui="div-032" className={CHIP_ROW_CLASS} id="minReviewsChips">
                      {MIN_REVIEW_PRESETS.map((preset) => (
                        <Button data-ui={`min-review-chip-${preset.value}`}
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
                  </Field>

                  <Field data-ui="field-034" className={FIELD_STACK_CLASS}>
                    <FieldLabel data-ui="field-label-035" className="text-xs font-semibold text-muted-foreground">최대 거리(m)</FieldLabel>
                    <div data-ui="div-036" className={CHIP_ROW_CLASS} id="maxDistanceChips">
                      {MAX_DISTANCE_PRESETS.map((preset) => (
                        <Button data-ui={`max-distance-chip-${preset.value ?? "none"}`}
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
                  </Field>

                  <Field data-ui="field-038" className={FIELD_STACK_CLASS}>
                    <FieldLabel data-ui="field-label-039" className="text-xs font-semibold text-muted-foreground" htmlFor="centerSearchSelectTrigger">
                      거리 기준 주소/건물명
                    </FieldLabel>
                    <Popover
                      data-ui="center-combobox-root"
                      open={centerSearchSelectOpen}
                      onOpenChange={(open) => {
                        setCenterSearchSelectOpen(open)
                        if (open && !centerSearchInput.trim()) {
                          setCenterSearchStatus({ message: "주소/건물명을 입력하면 자동으로 검색됩니다.", tone: "muted" })
                        }
                      }}
                    >
                      <PopoverTrigger data-ui="center-combobox-trigger-wrapper" asChild>
                        <Button
                          data-ui="center-combobox-trigger"
                          id="centerSearchSelectTrigger"
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={centerSearchSelectOpen}
                          className={`w-full min-w-0 max-w-full justify-between gap-2 overflow-hidden text-left ${ACTIVE_FIELD_CLASS}`}
                        >
                          <span
                            data-ui="center-combobox-trigger-label"
                            className={`block min-w-0 max-w-full flex-1 truncate ${selectedCenterSearchResult || centerSearchInput.trim() ? "" : "text-muted-foreground"}`}
                            title={centerComboboxLabel}
                          >
                            {centerComboboxLabel}
                          </span>
                          {centerSearchLoading ? (
                            <Loader2 data-ui="center-combobox-loading-icon" className="size-4 animate-spin opacity-70" />
                          ) : (
                            <ChevronsUpDown data-ui="center-combobox-toggle-icon" className="size-4 opacity-50" />
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        data-ui="center-combobox-content"
                        id="centerSearchOptions"
                        align="start"
                        className="w-[var(--radix-popover-trigger-width)] p-0"
                      >
                        <Command data-ui="center-combobox-command" shouldFilter={false}>
                          <CommandInput
                            data-ui="center-combobox-input"
                            id="centerSearchInput"
                            value={centerSearchInput}
                            onValueChange={setCenterSearchInput}
                            placeholder="예: 상현역, 광교호수공원"
                          />
                          <CommandList data-ui="center-combobox-list">
                            <CommandEmpty data-ui="center-combobox-empty">
                              {centerSearchLoading
                                ? "검색 중입니다..."
                                : centerSearchInput.trim().length < CENTER_SEARCH_MIN_QUERY
                                  ? `${CENTER_SEARCH_MIN_QUERY}글자 이상 입력해 주세요.`
                                  : "검색 결과가 없습니다."}
                            </CommandEmpty>
                            <CommandGroup data-ui="center-combobox-group" heading={centerSearchResults.length ? "검색 결과" : undefined}>
                              {centerSearchResults.map((item, idx) => (
                                <CommandItem
                                  data-ui={`center-search-option-${uiToken(item.id)}`}
                                  key={item.id}
                                  value={item.id}
                                  onSelect={(value) => {
                                    if (applyCenterSearchResultById(value)) {
                                      setCenterSearchSelectOpen(false)
                                    }
                                  }}
                                >
                                  <span data-ui={`center-search-option-label-${uiToken(item.id)}`} className="truncate">
                                    {toCenterSearchOptionText(item, idx)}
                                  </span>
                                  <Check
                                    data-ui={`center-search-option-check-${uiToken(item.id)}`}
                                    className={`ml-auto size-4 ${selectedCenterSearchResultId === item.id ? "opacity-100" : "opacity-0"}`}
                                  />
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FieldDescription
                      data-ui="field-desc-center-status-208"
                      data-tone={centerSearchStatus.tone}
                      className={[
                        "text-[11px]",
                        centerSearchStatus.tone === "ok" ? "text-emerald-600" : "",
                        centerSearchStatus.tone === "warn" ? "text-red-600" : "",
                        centerSearchStatus.tone === "muted" ? "text-muted-foreground" : "",
                      ].join(" ")}
                    >
                      {centerSearchStatus.message}
                    </FieldDescription>
                  </Field>

                  <div data-ui="div-052" className={TWO_COL_GRID_CLASS}>
                    <Field data-ui="field-053" className={FIELD_STACK_CLASS}>
                      <FieldLabel data-ui="field-label-054" className="text-xs font-semibold text-muted-foreground" htmlFor="refDate">기준 날짜</FieldLabel>
                      <Input data-ui="input-055" className={ACTIVE_FIELD_CLASS} id="refDate" type="date" value={refDate} onChange={(event) => setRefDate(event.target.value)} />
                    </Field>
                    <Field data-ui="field-056" className={FIELD_STACK_CLASS}>
                      <FieldLabel data-ui="field-label-057" className="text-xs font-semibold text-muted-foreground" htmlFor="refTime">기준 시간</FieldLabel>
                      <Input data-ui="input-058" className={ACTIVE_FIELD_CLASS} id="refTime" type="time" step={60} value={refTime} onChange={(event) => setRefTime(event.target.value)} />
                    </Field>
                  </div>

                  <div data-ui="div-059" className={TWO_COL_GRID_CLASS}>
                    <Field data-ui="field-060" className={FIELD_STACK_CLASS}>
                      <FieldLabel data-ui="field-label-061" className="text-xs font-semibold text-muted-foreground">기준시각 영업 상태</FieldLabel>
                      <Select data-ui="select-062" value={refOpenMode} onValueChange={setRefOpenMode}>
                        <SelectTrigger data-ui="select-trigger-063" id="refOpenMode" className={`w-full ${ACTIVE_FIELD_CLASS}`}>
                          <SelectValue data-ui="select-value-064" placeholder="전체" />
                        </SelectTrigger>
                        <SelectContent data-ui="select-content-065">
                          <SelectItem data-ui="select-item-066" value="all">전체</SelectItem>
                          <SelectItem data-ui="select-item-067" value="open">영업중만</SelectItem>
                          <SelectItem data-ui="select-item-068" value="break">브레이크타임만</SelectItem>
                          <SelectItem data-ui="select-item-069" value="closed">영업종료만</SelectItem>
                          <SelectItem data-ui="select-item-070" value="unknown">계산불가/휴무만</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field data-ui="field-071" className={FIELD_STACK_CLASS}>
                      <FieldLabel data-ui="field-label-072" className="text-xs font-semibold text-muted-foreground">최상위 키워드</FieldLabel>
                      <Select data-ui="select-073" value={topKeywordFilter} onValueChange={setTopKeywordFilter}>
                        <SelectTrigger data-ui="select-trigger-074" id="topKeywordFilter" className={`w-full ${ACTIVE_FIELD_CLASS}`}>
                          <SelectValue data-ui="select-value-075" placeholder="전체" />
                        </SelectTrigger>
                        <SelectContent data-ui="select-content-076">
                          <SelectItem data-ui="select-item-077" value="all">전체</SelectItem>
                          {topKeywordCatalog.map((item, idx) => (
                            <SelectItem data-ui={`top-keyword-option-${idx}-${uiToken(item.keyword)}`} key={item.keyword} value={item.keyword}>
                              {item.keyword} ({numFmt.format(item.count)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field data-ui="field-price-category-201" className={FIELD_STACK_CLASS}>
                      <FieldLabel data-ui="field-label-price-category-202" className="text-xs font-semibold text-muted-foreground">가격대</FieldLabel>
                      <Select data-ui="select-price-category-203" value={priceCategoryFilter} onValueChange={setPriceCategoryFilter}>
                        <SelectTrigger data-ui="select-trigger-price-category-204" id="priceCategoryFilter" className={`w-full ${ACTIVE_FIELD_CLASS}`}>
                          <SelectValue data-ui="select-value-price-category-205" placeholder="전체" />
                        </SelectTrigger>
                        <SelectContent data-ui="select-content-price-category-206">
                          <SelectItem data-ui="select-item-price-category-all-207" value="all">전체</SelectItem>
                          {priceCategoryCatalog.map((item, idx) => (
                            <SelectItem data-ui={`price-category-option-${idx}-${uiToken(item.category)}`} key={item.category} value={item.category}>
                              {item.category} ({numFmt.format(item.count)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <Button data-ui="button-079" id="resetBtn" type="button" variant="outline" size="sm" className="w-full" onClick={resetFilters}>
                    <RotateCcw data-ui="rotate-ccw-080" className="size-4" /> 필터 초기화
                  </Button>

                </FieldGroup>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card data-ui="card-140" className="border-slate-200/80 shadow-xl shadow-slate-900/5 xl:flex xl:h-full xl:min-h-0 xl:flex-col">
            <CardHeader data-ui="card-header-141" className={CARD_HEADER_CLASS}>
              <div data-ui="card-140-header-row" className="flex flex-wrap items-start justify-between gap-3">
                <div data-ui="div-142" id="status" className={FIELD_STACK_CLASS}>
                  {statusError ? (
                    <div data-ui="div-143" className="text-sm font-medium text-red-600">{statusError}</div>
                  ) : (
                    <>
                      <div data-ui="div-144" className="text-sm text-muted-foreground">
                        데이터 <strong data-ui="strong-145">{numFmt.format(viewRows.length)}</strong> / {numFmt.format(rows.length)}개
                      </div>
                      <div data-ui="div-146" className={CHIP_ROW_CLASS}>
                        {statusBadges.length ? (
                          statusBadges.map((label, idx) => (
                            <Badge data-ui={`status-badge-${idx}-${uiToken(label)}`} key={label} variant="secondary">{label}</Badge>
                          ))
                        ) : (
                          <Badge data-ui="badge-148" variant="outline">필터 없음</Badge>
                        )}
                        {sorting.map((item, idx) => {
                          const col = visibleColumns.find((c) => String(c.key) === item.id)
                          return (
                            <Badge data-ui={`sort-chip-${idx}-${uiToken(item.id)}`} key={item.id} variant="secondary" className="gap-2">
                              {idx + 1}. {col ? col.label : item.id} {item.desc ? "▼" : "▲"}
                              <Button data-ui={`sort-chip-remove-${idx}-${uiToken(item.id)}`}
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-5 text-destructive hover:text-destructive"
                                onClick={() => setSorting((prev) => prev.filter((rule) => rule.id !== item.id))}
                              >
                                <X data-ui={`sort-chip-remove-icon-${idx}-${uiToken(item.id)}`} className="size-3" />
                              </Button>
                            </Badge>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                <div data-ui="dialog-filter-trigger-group" className="flex flex-wrap gap-2">
                  <Dialog data-ui="dialog-convenience-root" open={convenienceDialogOpen} onOpenChange={setConvenienceDialogOpen}>
                    <DialogTrigger data-ui="dialog-convenience-trigger-wrap" asChild>
                      <Button data-ui="dialog-convenience-trigger" type="button" variant="outline" className="gap-2">
                        <SlidersHorizontal data-ui="dialog-convenience-trigger-icon" className="size-4" />
                        편의시설 필터
                        {selectedConveniences.length > 0 ? (
                          <Badge data-ui="dialog-convenience-trigger-badge" variant="secondary" className="rounded-sm px-1.5 py-0 text-[11px]">
                            {selectedConveniences.length}
                          </Badge>
                        ) : null}
                      </Button>
                    </DialogTrigger>
                    <DialogContent data-ui="dialog-convenience-content" className="w-[min(96vw,760px)] max-w-[760px] p-0">
                      <DialogHeader data-ui="dialog-convenience-header" className="space-y-2 border-b px-5 py-4">
                        <DialogTitle data-ui="dialog-convenience-title">편의시설 및 서비스 필터</DialogTitle>
                        <DialogDescription data-ui="dialog-convenience-description">
                          옵션/편의시설 정보를 합쳐 필터합니다.
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea data-ui="dialog-convenience-scroll-area" className="max-h-[72vh] px-5 py-4">
                        <FieldSet data-ui="dialog-convenience-field-set" className="min-w-0 gap-3">
                          <div data-ui="dialog-convenience-action-row" className={ACTION_ROW_CLASS}>
                            <Field data-ui="dialog-convenience-mode-field" className={`min-w-[180px] flex-1 ${FIELD_STACK_CLASS}`}>
                              <FieldLabel data-ui="dialog-convenience-mode-label" className="text-xs font-semibold text-muted-foreground">
                                선택 방식
                              </FieldLabel>
                              <Select data-ui="dialog-convenience-mode-select" value={convenienceMode} onValueChange={(value: RuleMode) => setConvenienceMode(value)}>
                                <SelectTrigger data-ui="dialog-convenience-mode-trigger" id="convenienceMode" className={`w-full ${ACTIVE_FIELD_CLASS}`}>
                                  <SelectValue data-ui="dialog-convenience-mode-value" placeholder="모두 포함" />
                                </SelectTrigger>
                                <SelectContent data-ui="dialog-convenience-mode-content">
                                  <SelectItem data-ui="dialog-convenience-mode-item-all" value="all">모두 포함</SelectItem>
                                  <SelectItem data-ui="dialog-convenience-mode-item-any" value="any">하나 이상 포함</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>

                            <Button data-ui="dialog-convenience-clear-button" id="clearConvenienceBtn" variant="outline" type="button" onClick={clearConvenience}>
                              선택 해제
                            </Button>
                          </div>

                          <div data-ui="dialog-convenience-chip-row" id="convenienceChips" className={CHIP_ROW_CLASS}>
                            {!convenienceCatalog.length ? (
                              <div data-ui="dialog-convenience-empty" className="rounded-md border border-dashed bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                                편의시설 데이터가 없습니다.
                              </div>
                            ) : (
                              convenienceCatalog.map((item, idx) => {
                                const active = selectedConveniences.includes(item.name)
                                return (
                                  <Button data-ui={`convenience-chip-${idx}-${uiToken(item.name)}`}
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
                        </FieldSet>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>

                  <Dialog data-ui="dialog-advanced-root" open={advancedDialogOpen} onOpenChange={setAdvancedDialogOpen}>
                    <DialogTrigger data-ui="dialog-advanced-trigger-wrap" asChild>
                      <Button data-ui="dialog-advanced-trigger" type="button" variant="outline" className="gap-2">
                        <SlidersHorizontal data-ui="dialog-advanced-trigger-icon" className="size-4" />
                        고급 필터
                        {advancedRules.length > 0 ? (
                          <Badge data-ui="dialog-advanced-trigger-badge" variant="secondary" className="rounded-sm px-1.5 py-0 text-[11px]">
                            {advancedRules.length}
                          </Badge>
                        ) : null}
                      </Button>
                    </DialogTrigger>
                    <DialogContent data-ui="dialog-advanced-content" className="w-[min(96vw,1080px)] max-w-[1080px] p-0">
                      <DialogHeader data-ui="dialog-advanced-header" className="space-y-2 border-b px-5 py-4">
                        <DialogTitle data-ui="dialog-advanced-title">고급 필터</DialogTitle>
                        <DialogDescription data-ui="dialog-advanced-description">
                          파생/원본 필드에 규칙 기반 조건을 추가합니다.
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea data-ui="dialog-advanced-scroll-area" className="max-h-[72vh] px-5 py-4">
                        <FieldSet data-ui="dialog-advanced-field-set" className="min-w-0 gap-3">
                          <div data-ui="dialog-advanced-action-row" className={ACTION_ROW_CLASS}>
                            <Field data-ui="dialog-advanced-mode-field" className={`min-w-[180px] flex-1 ${FIELD_STACK_CLASS}`}>
                              <FieldLabel data-ui="dialog-advanced-mode-label" className="text-xs font-semibold text-muted-foreground">
                                규칙 결합
                              </FieldLabel>
                              <Select data-ui="dialog-advanced-mode-select" value={advMode} onValueChange={(value: RuleMode) => setAdvMode(value)}>
                                <SelectTrigger data-ui="dialog-advanced-mode-trigger" id="advMode" className={`w-full ${ACTIVE_FIELD_CLASS}`}>
                                  <SelectValue data-ui="dialog-advanced-mode-value" placeholder="모두 일치" />
                                </SelectTrigger>
                                <SelectContent data-ui="dialog-advanced-mode-content">
                                  <SelectItem data-ui="dialog-advanced-mode-item-all" value="all">모두 일치</SelectItem>
                                  <SelectItem data-ui="dialog-advanced-mode-item-any" value="any">하나 이상 일치</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                            <Button data-ui="dialog-advanced-add-rule-button" id="addRuleBtn" type="button" onClick={addAdvancedRule}>규칙 추가</Button>
                            <Button data-ui="dialog-advanced-clear-rules-button" id="clearRulesBtn" type="button" variant="outline" onClick={clearAdvancedRules}>규칙 전체 삭제</Button>
                          </div>

                          <div data-ui="dialog-advanced-rule-list" id="ruleList" className="space-y-2">
                            {!filterFields.length ? (
                              <div data-ui="dialog-advanced-empty-fields" className="rounded-md border border-dashed bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                                파일을 먼저 불러오면 필드 목록이 생성됩니다.
                              </div>
                            ) : !advancedRules.length ? (
                              <div data-ui="dialog-advanced-empty-rules" className="rounded-md border border-dashed bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                                규칙이 없습니다. 규칙 추가 버튼으로 필터 조건을 추가하세요.
                              </div>
                            ) : (
                              advancedRules.map((rule) => {
                                const def = getFieldDef(rule.field) || filterFields[0]
                                const ops = getOpsForType(def?.type || "text")
                                const inputType = (def?.type || "text") === "number" ? "number" : "text"

                                return (
                                  <div data-ui={`advanced-rule-row-${rule.id}`}
                                    key={rule.id}
                                    className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-3"
                                  >
                                    <Select data-ui={`advanced-rule-field-select-${rule.id}`} value={rule.field} onValueChange={(value) => updateRuleField(rule.id, value)}>
                                      <SelectTrigger data-ui={`advanced-rule-field-trigger-${rule.id}`} className={`min-w-[160px] flex-[2] ${ACTIVE_FIELD_CLASS}`}>
                                        <SelectValue data-ui={`advanced-rule-field-value-${rule.id}`} />
                                      </SelectTrigger>
                                      <SelectContent data-ui={`advanced-rule-field-content-${rule.id}`} className="max-h-80">
                                        {filterFields.map((field, fieldIdx) => (
                                          <SelectItem data-ui={`advanced-rule-field-option-${rule.id}-${fieldIdx}-${uiToken(field.key)}`} key={field.key} value={field.key}>
                                            {field.label} [{getTypeLabel(field.type)}]
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>

                                    <Select data-ui={`advanced-rule-op-select-${rule.id}`} value={rule.op} onValueChange={(value) => updateRuleOp(rule.id, value)}>
                                      <SelectTrigger data-ui={`advanced-rule-op-trigger-${rule.id}`} className={`min-w-[100px] flex-1 ${ACTIVE_FIELD_CLASS}`}>
                                        <SelectValue data-ui={`advanced-rule-op-value-${rule.id}`} />
                                      </SelectTrigger>
                                      <SelectContent data-ui={`advanced-rule-op-content-${rule.id}`}>
                                        {ops.map((op, opIdx) => (
                                          <SelectItem data-ui={`advanced-rule-op-option-${rule.id}-${opIdx}-${uiToken(op.value)}`} key={op.value} value={op.value}>
                                            {op.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>

                                    <Input data-ui={`advanced-rule-value1-input-${rule.id}`}
                                      type={inputType}
                                      step="any"
                                      placeholder="값"
                                      value={rule.value1}
                                      onChange={(event) => updateRuleValue(rule.id, "value1", event.target.value)}
                                      className={`min-w-[80px] flex-1 ${ACTIVE_FIELD_CLASS} ${!opNeedsValue(rule.op) ? "hidden" : ""}`}
                                    />

                                    <Input data-ui={`advanced-rule-value2-input-${rule.id}`}
                                      type={inputType}
                                      step="any"
                                      placeholder="끝값"
                                      value={rule.value2}
                                      onChange={(event) => updateRuleValue(rule.id, "value2", event.target.value)}
                                      className={`min-w-[80px] flex-1 ${ACTIVE_FIELD_CLASS} ${!opNeedsSecondValue(rule.op) ? "hidden" : ""}`}
                                    />

                                    <Button data-ui={`advanced-rule-delete-${rule.id}`} type="button" variant="outline" size="sm" className="shrink-0" onClick={() => removeAdvancedRule(rule.id)}>
                                      삭제
                                    </Button>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </FieldSet>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent data-ui="card-content-149" className={`${CARD_CONTENT_CLASS} xl:flex-col`}>
              <ScrollArea data-ui="scroll-area-150" viewportRef={mobileScrollRef} className="h-[min(72vh,860px)] rounded-lg border bg-background md:hidden xl:h-full">
                {!tableRows.length ? (
                  <div data-ui="div-152" className="py-8 text-center text-sm text-muted-foreground">
                    데이터가 없습니다. 파일을 불러오거나 필터를 완화해 주세요.
                  </div>
                ) : (
                  <div
                    data-ui="div-151"
                    style={{ height: `${mobileVirtualizer.getTotalSize()}px`, position: "relative" }}
                    className="p-3"
                  >
                    {mobileVirtualizer.getVirtualItems().map((virtualItem) => {
                      const rowModel = tableRows[virtualItem.index]
                      const row = rowModel.original
                      return (
                        <div
                          data-ui={`mobile-row-card-${uiToken(rowModel.id)}`}
                          key={rowModel.id}
                          ref={mobileVirtualizer.measureElement}
                          data-index={virtualItem.index}
                          className={MOBILE_ROW_CARD_CLASS}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 12,
                            right: 12,
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                        >
                          <div data-ui={`mobile-row-header-${uiToken(rowModel.id)}`} className="flex items-start justify-between gap-2">
                            {row.mapUrl ? (
                              <a data-ui={`mobile-row-name-link-${uiToken(rowModel.id)}`} className="font-semibold text-primary hover:underline" href={row.mapUrl} target="_blank" rel="noreferrer noopener">
                                {row.name || "(이름 없음)"}
                              </a>
                            ) : (
                              <span data-ui={`mobile-row-name-text-${uiToken(rowModel.id)}`} className="font-semibold">{row.name || "(이름 없음)"}</span>
                            )}
                            <Badge data-ui={`mobile-row-open-badge-${uiToken(rowModel.id)}`} variant="outline">{row.openAtRefLabel || "-"}</Badge>
                          </div>
                          <div data-ui={`mobile-row-grid-${uiToken(rowModel.id)}`} className="grid grid-cols-2 gap-2 text-xs">
                            <div data-ui={`mobile-row-category-${uiToken(rowModel.id)}`} className="space-y-1">
                              <div data-ui={`mobile-row-category-label-${uiToken(rowModel.id)}`} className="text-muted-foreground">카테고리</div>
                              <div data-ui={`mobile-row-category-value-${uiToken(rowModel.id)}`} className="break-words">{row.category || "-"}</div>
                            </div>
                            <div data-ui={`mobile-row-reviews-${uiToken(rowModel.id)}`} className="space-y-1">
                              <div data-ui={`mobile-row-reviews-label-${uiToken(rowModel.id)}`} className="text-muted-foreground">리뷰수</div>
                              <div data-ui={`mobile-row-reviews-value-${uiToken(rowModel.id)}`} className="tabular-nums">{numFmt.format(row.reviewCount)}</div>
                            </div>
                            {showDistanceColumn ? (
                              <div data-ui={`mobile-row-distance-${uiToken(rowModel.id)}`} className="space-y-1">
                                <div data-ui={`mobile-row-distance-label-${uiToken(rowModel.id)}`} className="text-muted-foreground">거리</div>
                                <div data-ui={`mobile-row-distance-value-${uiToken(rowModel.id)}`} className="tabular-nums">{row.distanceM == null ? "-" : `${numFmt.format(row.distanceM)}m`}</div>
                              </div>
                            ) : null}
                            <div data-ui={`mobile-row-keyword-${uiToken(rowModel.id)}`} className="space-y-1">
                              <div data-ui={`mobile-row-keyword-label-${uiToken(rowModel.id)}`} className="text-muted-foreground">키워드</div>
                              <div data-ui={`mobile-row-keyword-value-${uiToken(rowModel.id)}`} className="break-words">{row.topKeyword || "-"}</div>
                            </div>
                          </div>
                          <div data-ui={`mobile-row-address-${uiToken(rowModel.id)}`} className="text-xs text-muted-foreground break-words">{row.address || "-"}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>

              <div data-ui="scroll-area-172" ref={desktopScrollRef} className="hidden h-[min(72vh,860px)] overflow-auto rounded-lg border bg-background md:block xl:h-full">
                <div data-ui="div-173" className="min-w-[760px]">
                  <Table data-ui="table-174" containerClassName="!overflow-visible">
                    <TableHeader data-ui="table-header-175" id="head" className="sticky top-0 z-10 bg-muted/70 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                      {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow data-ui={`table-header-row-${uiToken(headerGroup.id)}`} key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <TableHead data-ui={`table-header-cell-${uiToken(header.id)}`} key={header.id}>
                              {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody data-ui="table-body-178" id="body">
                      {!tableRows.length ? (
                        <TableRow data-ui="table-row-179">
                          <TableCell data-ui="table-cell-180" colSpan={visibleColumns.length} className="py-8 text-center text-muted-foreground">
                            데이터가 없습니다. 파일을 불러오거나 필터를 완화해 주세요.
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {desktopVirtualizer.getVirtualItems().length > 0 && (
                            <tr><td style={{ height: `${desktopVirtualizer.getVirtualItems()[0].start}px`, padding: 0, border: "none" }} colSpan={visibleColumns.length} /></tr>
                          )}
                          {desktopVirtualizer.getVirtualItems().map((virtualItem) => {
                            const row = tableRows[virtualItem.index]
                            return (
                              <TableRow data-ui={`table-body-row-${uiToken(row.id)}`} key={row.id} ref={desktopVirtualizer.measureElement} data-index={virtualItem.index}>
                                {row.getVisibleCells().map((cell) => (
                                  <TableCell data-ui={`table-body-cell-${uiToken(cell.id)}`} key={cell.id}>
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </TableCell>
                                ))}
                              </TableRow>
                            )
                          })}
                          {desktopVirtualizer.getVirtualItems().length > 0 && (
                            <tr><td style={{ height: `${desktopVirtualizer.getTotalSize() - (desktopVirtualizer.getVirtualItems().at(-1)?.end ?? 0)}px`, padding: 0, border: "none" }} colSpan={visibleColumns.length} /></tr>
                          )}
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </TooltipProvider>
  )
}

export default App
