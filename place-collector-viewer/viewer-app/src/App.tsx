import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  ChevronsUpDown,
  ExternalLink,
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
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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

interface EmbeddedDataset {
  id: string
  label: string
  filename: string
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
  keywordStats: Array<{ label: string; count: number; pct: number }>
  keywordLabels: string[]
  keywordText: string
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
  keywordStats: { label: "키워드 통계", type: "text" },
  keywordLabels: { label: "전체 키워드 목록", type: "text" },
  keywordText: { label: "전체 키워드 텍스트", type: "text" },
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

const REF_OPEN_MODE_PRESETS = [
  { label: "전체", value: "all" },
  { label: "영업중만", value: "open" },
  { label: "브레이크타임만", value: "break" },
  { label: "영업종료만", value: "closed" },
  { label: "계산불가/휴무만", value: "unknown" },
]
const PET_FEED_KEYWORDS = [
  "반려동물",
  "반려견",
  "강아지",
  "애견",
  "반려묘",
  "고양이",
  "펫",
]
const TAKEOUT_FEED_KEYWORDS = ["포장", "테이크아웃", "takeout"]
const TOOLTIP_INDICATOR_CLASS = "cursor-help underline decoration-dotted underline-offset-4 decoration-slate-400/80"
const TOOLTIP_TRIGGER_BUTTON_CLASS = "appearance-none border-0 bg-transparent p-0 font-inherit text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm"

const DEFAULT_MIN_REVIEW = 50
const DEFAULT_MAX_DISTANCE: number | null = null

const INIT_PARAMS = new URLSearchParams(window.location.search)
const ACTIVE_FIELD_CLASS = "h-8"
const APP_SURFACE_CLASS = "h-dvh overflow-hidden bg-[radial-gradient(circle_at_0%_0%,rgba(15,118,110,0.14),transparent_42%),radial-gradient(circle_at_100%_0%,rgba(59,130,246,0.14),transparent_40%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-4 md:p-6"
const APP_CONTENT_CLASS = "mx-auto flex h-full min-h-0 min-w-0 w-full max-w-[1600px] flex-col gap-4"
const APP_GRID_CLASS = "grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] gap-4 xl:grid-cols-[360px_minmax(0,1fr)]"
const CARD_HEADER_CLASS = "space-y-2 px-4 py-0 md:px-5"
const CARD_CONTENT_CLASS = "min-w-0 flex min-h-0 flex-1 px-4 py-0 md:px-5"
const PANEL_STACK_CLASS = "min-w-0 w-full max-w-full gap-4"
const FIELD_STACK_CLASS = "min-w-0 flex flex-col gap-2"
const CHIP_ROW_CLASS = "flex flex-wrap gap-2"
const TWO_COL_GRID_CLASS = "grid gap-3 xl:grid-cols-2"
const ACTION_ROW_CLASS = "flex flex-wrap items-end gap-3"
const CENTER_SEARCH_MIN_QUERY = 2
const CENTER_SEARCH_DEBOUNCE_MS = 320
const CENTER_SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search"
const CENTER_SEARCH_FALLBACK_ENDPOINT = "https://photon.komoot.io/api/"
const CENTER_SEARCH_LIMIT = 8
const EMBEDDED_DATASETS: EmbeddedDataset[] = [
  {
    id: "gwanggyo-2026-02-20",
    label: "광교 (2026-02-20)",
    filename: "gwanggyo-2026-02-20.json",
  },
  {
    id: "pangyo-2026-02-20",
    label: "판교 (2026-02-20)",
    filename: "pangyo-2026-02-20.json",
  },
  {
    id: "haenggung-2026-02-26",
    label: "행궁동 (2026-02-26)",
    filename: "haenggung-2026-02-26.json",
  },
  {
    id: "daebudo-pension-2026-02-26",
    label: "대부도 펜션 (2026-02-26)",
    filename: "daebudo-pension-2026-02-26.json",
  },
  {
    id: "seoul-partyroom-2026-02-26",
    label: "서울 파티룸 (2026-02-26)",
    filename: "seoul-partyroom-2026-02-26.json",
  },
  {
    id: "pet-friendly-seoul-2026-03-14",
    label: "서울 반려동물 동반 (2026-03-14)",
    filename: "pet-friendly-seoul-2026-03-14.json",
  },
  {
    id: "songdo-convensia-2026-04-28",
    label: "송도 컨벤시아 3km (2026-04-28)",
    filename: "songdo-convensia-2026-04-28.json",
  },
  {
    id: "uiwang-baekun-2026-06-16",
    label: "의왕 백운밸리 1.5km (2026-06-16)",
    filename: "uiwang-baekun-2026-06-16.json",
  },
]

const numFmt = new Intl.NumberFormat("ko-KR")

// iPadOS Safari는 데스크톱(Macintosh) UA로 위장하므로 터치 포인트로 보강 감지한다.
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return (
    /iPhone|iPad|iPod|Android/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))
  )
}

// 모바일에서는 네이버맵 앱을 URL scheme으로 직접 띄우고, 앱이 없으면 웹으로 fallback한다.
// 데스크톱은 기존처럼 새 탭에서 웹 지도를 연다.
//
// iOS에서 앱이 열리면 페이지가 백그라운드로 가는데, 이때 setTimeout이 지연됐다가
// 다시 Safari로 돌아올 때 밀린 fallback이 실행되어 두 번째 호출부터 웹이 열리는 문제가 있다.
// 이를 막기 위해 (1) blur/visibilitychange/pagehide 어느 것이든 앱 전환이 감지되면
// 타이머를 즉시 취소하고, (2) 타이머가 뒤늦게 깨어나더라도 숨김 상태이거나 예정 시각을
// 크게 넘겼으면(=백그라운드에서 밀림) fallback을 건너뛴다.
function openNaverPlace(placeId: number | string, webUrl: string): void {
  if (!isMobileDevice()) {
    window.open(webUrl, "_blank", "noopener,noreferrer")
    return
  }
  const appname = window.location.hostname || "place-snapshot"
  const scheme = `nmap://place?id=${placeId}&appname=${encodeURIComponent(appname)}`
  const FALLBACK_MS = 1200
  const start = Date.now()
  let timer = 0
  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    window.clearTimeout(timer)
    document.removeEventListener("visibilitychange", onVisibility)
    window.removeEventListener("pagehide", cleanup)
    window.removeEventListener("blur", cleanup)
  }
  const onVisibility = () => {
    if (document.hidden) cleanup()
  }
  // 앱 전환 신호(어느 것이든)가 오면 fallback을 취소한다.
  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener("pagehide", cleanup)
  window.addEventListener("blur", cleanup)
  timer = window.setTimeout(() => {
    const drifted = Date.now() - start > FALLBACK_MS * 2
    cleanup()
    // 숨김 상태이거나 타이머가 크게 밀렸으면 앱이 열린 것으로 보고 웹 fallback을 막는다.
    if (document.hidden || drifted) return
    window.location.href = webUrl
  }, FALLBACK_MS)
  window.location.href = scheme
}

function formatBytesToLabel(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B"
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

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

function toPriceCategoryEmoji(text: unknown): string {
  const normalized = normalizePriceCategory(text)
  if (!normalized) return "-"

  const matched = normalized.match(/(\d+)/)
  const value = matched ? Number(matched[1]) : Number.NaN

  if (!Number.isFinite(value) || value <= 1) return "💰"
  if (value <= 3) return "💰💰"
  if (value <= 5) return "💰💰💰"
  return "💰💰💰💰"
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
  const normalized = text
    .trim()
    .replace(/[：﹕]/g, ":")
  if (!normalized) return null
  const m = normalized.match(/^(\d{1,2})\s*:\s*(\d{2})(?::\d{2})?$/)
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

function hasClosedKeyword(text: unknown): boolean {
  const normalized = toText(text).toLowerCase().replace(/\s+/g, "")
  return normalized.includes("휴무") || normalized.includes("정기휴무")
}

function matchesRegularClosedDay(regularClosedDays: unknown, dayKo: string): boolean {
  const normalized = toText(regularClosedDays).toLowerCase().replace(/\s+/g, "")
  if (!normalized || !hasClosedKeyword(normalized)) return false

  const dayMap: Record<string, string> = {
    일: "일요일",
    월: "월요일",
    화: "화요일",
    수: "수요일",
    목: "목요일",
    금: "금요일",
    토: "토요일",
  }

  const fullDay = dayMap[dayKo] ?? `${dayKo}요일`
  return normalized.includes(fullDay) || normalized.includes(`${dayKo}요일`)
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
    if (matchesRegularClosedDay(row.regularClosedDays, dayKo) || hasClosedKeyword(row.openDesc)) {
      return { label: "휴무", rank: 1, code: "unknown" }
    }
    return { label: fallback, rank: 0, code: "unknown" }
  }

  const businessHours = (byDay.businessHours as { start?: string; end?: string } | undefined) ?? undefined
  const start = parseTimeToMinutes(businessHours?.start)
  const end = parseTimeToMinutes(businessHours?.end)
  const dayText = toText(byDay.day)
  const dayStatusText = [
    dayText,
    toText((byDay as { description?: unknown }).description),
    toText((byDay as { status?: unknown }).status),
    toText((byDay as { note?: unknown }).note),
  ]
    .join(" ")
    .toLowerCase()

  if (start == null || end == null) {
    const missingBusinessHours = !businessHours || (!toText(businessHours.start).trim() && !toText(businessHours.end).trim())
    if (missingBusinessHours || hasClosedKeyword(dayStatusText) || hasClosedKeyword(row.openDesc) || matchesRegularClosedDay(row.regularClosedDays, dayKo)) {
      return { label: "휴무", rank: 1, code: "unknown" }
    }
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

function extractKeywordStats(details: unknown, reviewCount: number): Array<{ label: string; count: number; pct: number }> {
  if (!Array.isArray(details) || !details.length) return []

  const countByKeyword = new Map<string, number>()
  for (const item of details) {
    if (!item || typeof item !== "object") continue
    const label = toText((item as { displayName?: unknown }).displayName).trim()
    const count = toNumOrNull((item as { count?: unknown }).count)
    if (!label || count == null || count <= 0) continue
    countByKeyword.set(label, (countByKeyword.get(label) || 0) + count)
  }

  return [...countByKeyword.entries()]
    .map(([label, count]) => ({
      label,
      count,
      pct: reviewCount > 0 ? (count / reviewCount) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"))
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

function extractFeedTooltipByKeywords(
  raw: RawRecord | undefined,
  keywords: string[],
  limit: number = 3
): string {
  if (!raw || !keywords.length) return ""

  const feeds = Array.isArray((raw as { feeds?: unknown }).feeds)
    ? ((raw as { feeds: Array<Record<string, unknown>> }).feeds ?? [])
    : []

  if (!feeds.length) return ""

  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase())
  const rows: string[] = []
  const seen = new Set<string>()

  for (const feed of feeds) {
    const title = toText(feed.title).replace(/\s+/g, " ").trim()
    const desc = toText(feed.desc).replace(/\s+/g, " ").trim()
    const haystack = `${title} ${desc}`.toLowerCase()
    if (!normalizedKeywords.some((keyword) => haystack.includes(keyword))) continue

    const snippet = title ? `${title}${desc ? `\n${desc}` : ""}` : desc
    if (!snippet || seen.has(snippet)) continue

    seen.add(snippet)
    rows.push(snippet)
    if (rows.length >= limit) break
  }

  return rows.join("\n\n")
}

function normalizeRecord(raw: RawRecord, fallbackId: string, index: number): PlaceRow {
  const reviewCount = toNum(raw.reviewCount)
  const avgRating = toNum(raw.avgRating)
  const parsedDistance = parseDistanceMeters(raw.distance)
  const keywordStats = extractKeywordStats(raw.details, reviewCount)
  const topKeyword = keywordStats[0] || { label: "", count: 0, pct: 0 }
  const keywordLabels = keywordStats.map((item) => item.label)
  const keywordText = keywordLabels.join(", ")
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

  const roadAddress = toText(raw.roadAddress)
  const commonAddress = toText(raw.commonAddress)
  const microReview = toText(raw.microReview)
  const feedsText = Array.isArray(raw.feeds)
    ? raw.feeds.map((f: unknown) => {
        const fd = f as { title?: string; desc?: string }
        return [fd.title, fd.desc].filter(Boolean).join(" ")
      }).join(" ")
    : ""
  const keywordDisplayNames = Array.isArray(raw.details)
    ? raw.details.map((d: unknown) => (d as { displayName?: string }).displayName || "").join(" ")
    : ""

  const _searchText = [
    placeId, name, category, roadAddress, commonAddress, options, phone,
    topKeyword.label, keywordText, keywordDisplayNames,
    openDescText, priceCategoryText,
    parkingDetail, detailConveniences, conveniencesTextVal,
    broadcastInfo, microReview, regularClosedDays, feedsText,
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
    keywordStats,
    keywordLabels,
    keywordText,
    openDesc: openDescText,
    openAtRefLabel: "",
    openAtRefRank: 0,
    openAtRefCode: "unknown",
    address,
    roadAddress,
    commonAddress,
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

function buildTopKeywordCatalog(rows: PlaceRow[]): Array<{ keyword: string; placeCount: number; mentionCount: number }> {
  const counts = new Map<string, { placeCount: number; mentionCount: number }>()
  for (const row of rows) {
    const seenInRow = new Set<string>()
    for (const stat of row.keywordStats) {
      const keyword = toText(stat.label).trim()
      const mentionCount = toNumOrNull(stat.count) ?? 0
      if (!keyword) continue

      const item = counts.get(keyword) || { placeCount: 0, mentionCount: 0 }
      if (!seenInRow.has(keyword)) {
        item.placeCount += 1
        seenInRow.add(keyword)
      }
      item.mentionCount += mentionCount > 0 ? mentionCount : 0
      counts.set(keyword, item)
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1].placeCount - a[1].placeCount || b[1].mentionCount - a[1].mentionCount || a[0].localeCompare(b[0], "ko"))
    .map(([keyword, value]) => ({ keyword, placeCount: value.placeCount, mentionCount: value.mentionCount }))
}

function buildPriceEmojiCatalog(rows: PlaceRow[]): Array<{ emoji: string; count: number; categories: string[] }> {
  const buckets = new Map<string, { count: number; categories: Set<string> }>()

  for (const row of rows) {
    const category = normalizePriceCategory(row.priceCategory)
    if (!category) continue

    const emoji = toPriceCategoryEmoji(category)
    if (emoji === "-") continue

    const existing = buckets.get(emoji)
    if (existing) {
      existing.count += 1
      existing.categories.add(category)
      continue
    }

    buckets.set(emoji, { count: 1, categories: new Set([category]) })
  }

  return [...buckets.entries()]
    .map(([emoji, bucket]) => ({
      emoji,
      count: bucket.count,
      categories: [...bucket.categories].sort((a, b) => a.localeCompare(b, "ko")),
    }))
    .sort((a, b) => a.emoji.length - b.emoji.length)
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
  const [sorting, setSorting] = useState<SortingState>(() => {
    const v = INIT_PARAMS.get("sort")
    if (!v) return []
    return v.split(",").map((s) => {
      const [id, dir] = s.split(":")
      return { id, desc: dir === "desc" }
    }).filter((s) => s.id)
  })

  const [searchInput, setSearchInput] = useState(() => INIT_PARAMS.get("q") ?? "")
  const [minReviewPreset, setMinReviewPreset] = useState(() => {
    const v = INIT_PARAMS.get("minReview")
    return v != null ? Number(v) : DEFAULT_MIN_REVIEW
  })
  const [maxDistancePreset, setMaxDistancePreset] = useState<number | null>(() => {
    const v = INIT_PARAMS.get("maxDist")
    return v != null ? Number(v) : DEFAULT_MAX_DISTANCE
  })

  const [centerSearchInput, setCenterSearchInput] = useState("")
  const [centerSearchResults, setCenterSearchResults] = useState<CenterSearchResult[]>([])
  const [selectedCenterSearchResultId, setSelectedCenterSearchResultId] = useState("")
  const [centerSearchSelectOpen, setCenterSearchSelectOpen] = useState(false)
  const [centerSearchLoading, setCenterSearchLoading] = useState(false)
  const [distanceCenter, setDistanceCenter] = useState<{ x: number; y: number } | null>(() => {
    const v = INIT_PARAMS.get("center")
    if (!v) return null
    const [xs, ys] = v.split(",")
    const x = Number(xs), y = Number(ys)
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
  })
  const [centerSearchStatus, setCenterSearchStatus] = useState<{ message: string; tone: CenterStatusTone }>(() => {
    if (distanceCenter) return { message: `URL에서 좌표 복원: (${distanceCenter.x.toFixed(5)}, ${distanceCenter.y.toFixed(5)})`, tone: "ok" as const }
    return { message: "주소/건물명을 검색하고 옵션에서 선택하면 거리를 계산합니다.", tone: "muted" as const }
  })

  const [refDate, setRefDate] = useState(() => INIT_PARAMS.get("date") ?? toInputDate(now))
  const [refTime, setRefTime] = useState(() => INIT_PARAMS.get("time") ?? toInputTime(now))
  const [refOpenMode, setRefOpenMode] = useState(() => INIT_PARAMS.get("openMode") ?? "all")
  const [topKeywordFilter, setTopKeywordFilter] = useState(() => INIT_PARAMS.get("keyword") ?? "all")
  const [priceCategoryFilter, setPriceCategoryFilter] = useState(() => INIT_PARAMS.get("price") ?? "all")

  const [convenienceMode, setConvenienceMode] = useState<RuleMode>(() => {
    const v = INIT_PARAMS.get("convMode")
    return v === "any" ? "any" : "all"
  })
  const [selectedConveniences, setSelectedConveniences] = useState<string[]>(() => {
    const v = INIT_PARAMS.get("conv")
    return v ? v.split(",").filter(Boolean) : []
  })

  const [advMode, setAdvMode] = useState<RuleMode>(() => {
    const v = INIT_PARAMS.get("advMode")
    return v === "any" ? "any" : "all"
  })
  const [advancedRules, setAdvancedRules] = useState<AdvancedRule[]>(() => {
    const v = INIT_PARAMS.get("rules")
    if (!v) return []
    try { return JSON.parse(v) } catch { return [] }
  })
  const [nextRuleId, setNextRuleId] = useState(() => {
    const v = INIT_PARAMS.get("rules")
    if (!v) return 1
    try {
      const rules: AdvancedRule[] = JSON.parse(v)
      return rules.length ? Math.max(...rules.map((r) => r.id)) + 1 : 1
    } catch { return 1 }
  })

  const [statusError, setStatusError] = useState<string | null>(null)
  const [convenienceDialogOpen, setConvenienceDialogOpen] = useState(false)
  const [advancedDialogOpen, setAdvancedDialogOpen] = useState(false)
  const [mobileFilterDialogOpen, setMobileFilterDialogOpen] = useState(false)
  const [isCompactViewport, setIsCompactViewport] = useState(
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 1279px)").matches
      : false
  )
  const [isTabletViewport, setIsTabletViewport] = useState(
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(min-width: 768px) and (max-width: 1279px)").matches
      : false
  )
  const [loading, setLoading] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState(() => INIT_PARAMS.get("q") ?? "")
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [selectedEmbeddedDatasetId, setSelectedEmbeddedDatasetId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search)
    const datasetParam = params.get("dataset")
    if (datasetParam && EMBEDDED_DATASETS.some((d) => d.id === datasetParam)) return datasetParam
    return EMBEDDED_DATASETS[0]?.id ?? ""
  })

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const centerSearchSeqRef = useRef(0)
  const rawMapRef = useRef<Map<number, RawRecord>>(new Map())

  const desktopScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 200)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const compactQuery = window.matchMedia("(max-width: 1279px)")
    const tabletQuery = window.matchMedia("(min-width: 768px) and (max-width: 1279px)")
    const syncViewportState = () => {
      setIsCompactViewport(compactQuery.matches)
      setIsTabletViewport(tabletQuery.matches)
    }

    syncViewportState()

    if (typeof compactQuery.addEventListener === "function" && typeof tabletQuery.addEventListener === "function") {
      compactQuery.addEventListener("change", syncViewportState)
      tabletQuery.addEventListener("change", syncViewportState)
      return () => {
        compactQuery.removeEventListener("change", syncViewportState)
        tabletQuery.removeEventListener("change", syncViewportState)
      }
    }

    compactQuery.addListener(syncViewportState)
    tabletQuery.addListener(syncViewportState)
    return () => {
      compactQuery.removeListener(syncViewportState)
      tabletQuery.removeListener(syncViewportState)
    }
  }, [])

  useEffect(() => {
    if (!isCompactViewport && mobileFilterDialogOpen) {
      setMobileFilterDialogOpen(false)
    }
  }, [isCompactViewport, mobileFilterDialogOpen])

  const convenienceCatalog = useMemo(() => buildConvenienceCatalog(rows), [rows])
  const topKeywordCatalog = useMemo(() => buildTopKeywordCatalog(rows), [rows])
  const priceEmojiCatalog = useMemo(() => buildPriceEmojiCatalog(rows), [rows])
  const filterFields = useMemo(() => buildFilterFields(rows, rawMapRef.current), [rows])
  const filterFieldMap = useMemo(() => new Map(filterFields.map((field) => [field.key, field])), [filterFields])
  const selectedEmbeddedDataset = useMemo(
    () => EMBEDDED_DATASETS.find((dataset) => dataset.id === selectedEmbeddedDatasetId) ?? null,
    [selectedEmbeddedDatasetId]
  )

  useEffect(() => {
    if (rows.length > 0 && topKeywordFilter !== "all" && !topKeywordCatalog.some((item) => item.keyword === topKeywordFilter)) {
      setTopKeywordFilter("all")
    }
  }, [rows.length, topKeywordCatalog, topKeywordFilter])

  useEffect(() => {
    if (rows.length > 0 && priceCategoryFilter !== "all" && !priceEmojiCatalog.some((item) => item.emoji === priceCategoryFilter)) {
      setPriceCategoryFilter("all")
    }
  }, [rows.length, priceEmojiCatalog, priceCategoryFilter])

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
      if (topKeywordFilter !== "all" && !row.keywordLabels.includes(topKeywordFilter)) return false
      if (priceCategoryFilter !== "all" && toPriceCategoryEmoji(row.priceCategory) !== priceCategoryFilter) return false

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
    if (topKeywordFilter !== "all") list.push(`키워드 ${topKeywordFilter}`)
    if (priceCategoryFilter !== "all") list.push(`가격대 ${priceCategoryFilter}`)
    if (selectedConveniences.length > 0) list.push(`편의시설 ${selectedConveniences.length}`)
    if (advancedRules.length > 0) list.push(`고급규칙 ${advancedRules.length}`)
    if (sorting.length > 0) list.push(`정렬 ${sorting.length}`)
    return list
  }, [keywords.length, minReviewPreset, maxDistancePreset, topKeywordFilter, priceCategoryFilter, selectedConveniences.length, advancedRules.length, sorting.length])

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

  const loadJsonText = useCallback((text: string, preserveFilters = false) => {
    setLoading(true)
    setTimeout(() => {
      try {
        const payload = JSON.parse(text)
        const { rows: nextRows, rawMap } = parseJsonToRows(payload)

        rawMapRef.current = rawMap
        setRows(nextRows)
        if (!preserveFilters) {
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
        }
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

  const loadEmbeddedDataset = useCallback(async () => {
    if (!selectedEmbeddedDataset || loading) return
    setSelectedFileName(`${selectedEmbeddedDataset.filename} (로딩중...)`)
    setLoading(true)
    try {
      const base = import.meta.env.BASE_URL || "/"
      const url = `${base}data/${selectedEmbeddedDataset.filename}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      setSelectedFileName(selectedEmbeddedDataset.filename)
      loadJsonText(text)
    } catch (e) {
      setSelectedFileName(`${selectedEmbeddedDataset.filename} (로드 실패)`)
      setLoading(false)
    }
  }, [loadJsonText, loading, selectedEmbeddedDataset])

  const autoLoadDoneRef = useRef(false)
  useEffect(() => {
    if (autoLoadDoneRef.current || loading) return
    const params = new URLSearchParams(window.location.search)
    const datasetParam = params.get("dataset")
    if (!datasetParam) return
    const target = EMBEDDED_DATASETS.find((d) => d.id === datasetParam)
    if (!target) return
    autoLoadDoneRef.current = true
    setSelectedFileName(`${target.filename} (로딩중...)`)
    setLoading(true)
    const base = import.meta.env.BASE_URL || "/"
    fetch(`${base}data/${target.filename}`)
      .then((res) => res.text())
      .then((text) => {
        setSelectedFileName(target.filename)
        loadJsonText(text, true)
      })
      .catch(() => {
        setSelectedFileName(`${target.filename} (로드 실패)`)
        setLoading(false)
      })
  }, [loading, loadJsonText])

  useEffect(() => {
    const p = new URLSearchParams()
    const defaultDatasetId = EMBEDDED_DATASETS[0]?.id ?? ""
    if (selectedEmbeddedDatasetId && selectedEmbeddedDatasetId !== defaultDatasetId) p.set("dataset", selectedEmbeddedDatasetId)
    if (searchInput) p.set("q", searchInput)
    if (minReviewPreset !== DEFAULT_MIN_REVIEW) p.set("minReview", String(minReviewPreset))
    if (maxDistancePreset != null) p.set("maxDist", String(maxDistancePreset))
    if (distanceCenter) p.set("center", `${distanceCenter.x},${distanceCenter.y}`)
    if (refDate !== toInputDate(now)) p.set("date", refDate)
    if (refTime !== toInputTime(now)) p.set("time", refTime)
    if (refOpenMode !== "all") p.set("openMode", refOpenMode)
    if (topKeywordFilter !== "all") p.set("keyword", topKeywordFilter)
    if (priceCategoryFilter !== "all") p.set("price", priceCategoryFilter)
    if (convenienceMode !== "all") p.set("convMode", convenienceMode)
    if (selectedConveniences.length) p.set("conv", selectedConveniences.join(","))
    if (advMode !== "all") p.set("advMode", advMode)
    if (advancedRules.length) p.set("rules", JSON.stringify(advancedRules))
    if (sorting.length) p.set("sort", sorting.map((s) => `${s.id}:${s.desc ? "desc" : "asc"}`).join(","))
    const qs = p.toString()
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname)
  }, [selectedEmbeddedDatasetId, searchInput, minReviewPreset, maxDistancePreset, distanceCenter, refDate, refTime, refOpenMode, topKeywordFilter, priceCategoryFilter, convenienceMode, selectedConveniences, advMode, advancedRules, sorting, now])

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      event.preventDefault()
    }

    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      const file = event.dataTransfer?.files?.[0]
      if (!file || !file.name.toLowerCase().endsWith(".json")) return
      setSelectedFileName(file.name)
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
    setSelectedFileName(null)
  }

  const getSortMarker = (columnId: string): string => {
    const idx = sorting.findIndex((item) => item.id === columnId)
    if (idx < 0) return ""
    const item = sorting[idx]
    return `${idx + 1}${item.desc ? "▼" : "▲"}`
  }

  const getActiveKeywordMetric = useCallback((row: PlaceRow): { label: string; pct: number; count: number } => {
    if (topKeywordFilter !== "all") {
      const stat = row.keywordStats.find((item) => item.label === topKeywordFilter)
      if (stat) {
        return {
          label: stat.label,
          pct: Number(stat.pct.toFixed(1)),
          count: stat.count,
        }
      }
      return { label: topKeywordFilter, pct: 0, count: 0 }
    }

    return {
      label: row.topKeyword,
      pct: Number(row.topKeywordPct.toFixed(1)),
      count: row.topKeywordCount,
    }
  }, [topKeywordFilter])

  const renderCell = (row: PlaceRow, column: ColumnDef) => {
    if (column.key === "name") {
      const name = row.name || "(이름 없음)"
      if (row.mapUrl) {
        return (
          <a
            data-ui="a-001"
            className="inline-flex items-center gap-1 font-semibold text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/90 hover:decoration-primary"
            href={row.mapUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => {
              if (isMobileDevice()) {
                e.preventDefault()
                openNaverPlace(row.id, row.mapUrl)
              }
            }}
          >
            <span data-ui={`table-name-link-label-${uiToken(row.id)}`} className="truncate">{name}</span>
            <ExternalLink data-ui={`table-name-link-icon-${uiToken(row.id)}`} className="size-3 shrink-0 opacity-70" />
          </a>
        )
      }
      return name
    }

    if (column.key === "reviewCount") return numFmt.format(row.reviewCount)
    if (column.key === "distanceM") return row.distanceM == null ? "-" : numFmt.format(row.distanceM)

    if (column.key === "topKeywordPct") {
      const metric = getActiveKeywordMetric(row)
      if (!metric.label && metric.pct <= 0) return "-"
      const pct = `${metric.pct.toFixed(1)}%`
      const key = metric.label ? ` (${metric.label})` : ""
      return `${pct}${key}`
    }

    if (column.key === "openAtRefRank") return row.openAtRefLabel || "-"
    if (column.key === "petFriendly") return row.petFriendly ? "🐾" : "-"
    if (column.key === "hasParkingOption") return row.hasParkingOption ? "🅿️" : "-"
    if (column.key === "hasTakeoutOption") return row.hasTakeoutOption ? "🥡" : "-"
    if (column.key === "priceCategory") return toPriceCategoryEmoji(row.priceCategory)

    return toText(row[column.key]) || "-"
  }

  const renderResponsiveTableHint = (
    trigger: ReactNode,
    content: ReactNode,
    {
      side = "top",
      className,
      dataUiSuffix,
    }: {
      side?: "top" | "bottom" | "left" | "right"
      className: string
      dataUiSuffix: string
    }
  ) => {
    if (isCompactViewport) {
      const compactSide = side === "left" || side === "right" ? "top" : side
      return (
        <Popover data-ui={`popover-table-hint-root-${dataUiSuffix}`}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            data-ui={`popover-table-hint-content-${dataUiSuffix}`}
            side={compactSide}
            className={className}
          >
            {content}
          </PopoverContent>
        </Popover>
      )
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent data-ui={`tooltip-table-hint-content-${dataUiSuffix}`} side={side} className={className}>
          {content}
        </TooltipContent>
      </Tooltip>
    )
  }

  const desktopTableColumns: TanstackColumnDef<PlaceRow>[] = visibleColumns.map((column) => ({
    id: String(column.key),
    accessorFn: (row) => {
      if (column.key === "topKeywordPct") return getActiveKeywordMetric(row).pct
      return row[column.key as keyof PlaceRow]
    },
    enableSorting: true,
    header: ({ column: tableColumn }) => {
      const marker = getSortMarker(tableColumn.id)
      const centerHeaderKeys = ["petFriendly", "hasParkingOption", "hasTakeoutOption", "openAtRefRank", "priceCategory"]
      const justify = centerHeaderKeys.includes(column.key as string) ? "justify-center" : "justify-start"
      const headerLabel = column.key === "topKeywordPct"
        ? (topKeywordFilter === "all" ? "최상위 키워드%" : `키워드% (${topKeywordFilter})`)
        : column.label
      return (
        <Button data-ui={`table-header-sort-button-${uiToken(tableColumn.id)}`}
          type="button"
          variant="ghost"
          className={`h-auto w-full ${justify} px-0 py-0 text-xs font-semibold`}
          onClick={tableColumn.getToggleSortingHandler()}
        >
          <span data-ui={`table-header-label-${uiToken(tableColumn.id)}`}>{headerLabel}</span>
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
      const cellValue = renderCell(row.original, column)
      const inlineClassNames = classNames.filter((className) => className !== "block" && className !== "text-center")
      const cellContent = <span data-ui={`table-cell-content-${uiToken(row.id)}-${uiToken(column.key)}`} className={classNames.join(" ")}>{cellValue}</span>
      const tooltipAnchorContent = (
        <button
          type="button"
          data-ui={`table-cell-tooltip-anchor-${uiToken(row.id)}-${uiToken(column.key)}`}
          className={["block w-fit max-w-full mx-auto", ...inlineClassNames, "cursor-help", TOOLTIP_TRIGGER_BUTTON_CLASS].join(" ")}
        >
          {cellValue}
        </button>
      )
      const tooltipIndicatorContent = (
        <button
          type="button"
          data-ui={`table-cell-tooltip-indicator-${uiToken(row.id)}-${uiToken(column.key)}`}
          className={["block w-fit max-w-full mx-auto", ...inlineClassNames, TOOLTIP_INDICATOR_CLASS, TOOLTIP_TRIGGER_BUTTON_CLASS].join(" ")}
        >
          {cellValue}
        </button>
      )

      if (column.key === "openAtRefRank") {
        const tooltipLines = formatDetailHours(rawMapRef.current.get(row.original._index))
        if (tooltipLines.length) {
          return (
            renderResponsiveTableHint(tooltipAnchorContent, tooltipLines.join("\n"), {
              side: "left",
              className: "w-fit max-w-sm whitespace-pre text-left font-mono text-[11px] leading-relaxed px-3 py-1.5",
              dataUiSuffix: `open-at-ref-${uiToken(row.id)}-${uiToken(column.key)}`,
            })
          )
        }
      }

      if (column.key === "priceCategory" && row.original.priceCategory) {
        return (
          renderResponsiveTableHint(tooltipAnchorContent, row.original.priceCategory, {
            side: "top",
            className: "w-fit max-w-sm text-xs px-3 py-1.5",
            dataUiSuffix: `price-category-${uiToken(row.id)}-${uiToken(column.key)}`,
          })
        )
      }

      if (column.key === "petFriendly") {
        const petTip = extractFeedTooltipByKeywords(rawMapRef.current.get(row.original._index), PET_FEED_KEYWORDS, 4)
        if (petTip) {
          return (
            renderResponsiveTableHint(tooltipIndicatorContent, petTip, {
              side: "top",
              className: "w-fit max-w-sm whitespace-pre-wrap text-left text-xs leading-relaxed px-3 py-1.5",
              dataUiSuffix: `pet-friendly-${uiToken(row.id)}-${uiToken(column.key)}`,
            })
          )
        }
      }

      if (column.key === "hasTakeoutOption" && row.original.hasTakeoutOption) {
        let takeoutTip = extractFeedTooltipByKeywords(rawMapRef.current.get(row.original._index), TAKEOUT_FEED_KEYWORDS, 1)
        if (!takeoutTip && row.original.options.includes("포장")) {
          takeoutTip = "옵션 정보: 포장"
        }
        if (takeoutTip) {
          return (
            renderResponsiveTableHint(tooltipIndicatorContent, takeoutTip, {
              side: "top",
              className: "w-fit max-w-sm whitespace-pre-wrap text-left text-xs leading-relaxed px-3 py-1.5",
              dataUiSuffix: `takeout-${uiToken(row.id)}-${uiToken(column.key)}`,
            })
          )
        }
      }

      if (column.key === "hasParkingOption" && row.original.hasParkingOption) {
        let parkingTip = row.original.parkingDetail
        if (!parkingTip) {
          parkingTip = extractFeedTooltipByKeywords(rawMapRef.current.get(row.original._index), ["주차"], 1)
        }
        if (parkingTip) {
          return (
            renderResponsiveTableHint(tooltipIndicatorContent, parkingTip, {
              side: "top",
              className: "w-fit max-w-sm whitespace-pre-wrap text-left text-xs leading-relaxed px-3 py-1.5",
              dataUiSuffix: `parking-${uiToken(row.id)}-${uiToken(column.key)}`,
            })
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

  const renderPrimaryFilterPanel = () => (
    <FieldGroup data-ui="field-group-022" className={PANEL_STACK_CLASS}>
      <Field data-ui="field-023" className={FIELD_STACK_CLASS}>
        <FieldLabel data-ui="field-label-024" className="text-xs font-semibold text-muted-foreground">JSON 파일</FieldLabel>
        <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />
        <Button data-ui="input-025" variant="outline" size="sm" className="w-full justify-start gap-2 text-left font-normal" onClick={() => fileInputRef.current?.click()}>
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{selectedFileName ?? "파일을 선택하세요..."}</span>
        </Button>
      </Field>

      <Field data-ui="field-embedded-dataset-301" className={FIELD_STACK_CLASS}>
        <FieldLabel data-ui="field-label-embedded-dataset-302" className="text-xs font-semibold text-muted-foreground">내장 데이터셋</FieldLabel>
        <div data-ui="embedded-dataset-row-303" className="flex items-center gap-2">
          <Select
            data-ui="embedded-dataset-select-304"
            value={selectedEmbeddedDatasetId}
            onValueChange={setSelectedEmbeddedDatasetId}
          >
            <SelectTrigger data-ui="embedded-dataset-trigger-305" className={`min-w-0 flex-1 ${ACTIVE_FIELD_CLASS}`}>
              <SelectValue data-ui="embedded-dataset-value-306" placeholder="데이터셋 선택" />
            </SelectTrigger>
            <SelectContent data-ui="embedded-dataset-content-307">
              {EMBEDDED_DATASETS.map((dataset, idx) => (
                <SelectItem
                  data-ui={`embedded-dataset-option-308-${idx}-${uiToken(dataset.id)}`}
                  key={dataset.id}
                  value={dataset.id}
                >
                  {dataset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            data-ui="embedded-dataset-load-button-309"
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={loadEmbeddedDataset}
            disabled={!selectedEmbeddedDataset || loading}
          >
            불러오기
          </Button>
        </div>
        <FieldDescription data-ui="embedded-dataset-desc-310" className="text-[11px] text-muted-foreground">
          청담/광교/판교 JSON이 앱에 내장되어 있습니다.
        </FieldDescription>
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

      <Field data-ui="field-price-category-201" className={FIELD_STACK_CLASS}>
        <FieldLabel data-ui="field-label-price-category-202" className="text-xs font-semibold text-muted-foreground">가격대</FieldLabel>
        <div data-ui="div-price-category-203" id="priceCategoryChips" className={CHIP_ROW_CLASS}>
          <Button
            data-ui="price-category-chip-all-204"
            type="button"
            size="sm"
            variant={priceCategoryFilter === "all" ? "default" : "outline"}
            onClick={() => setPriceCategoryFilter("all")}
          >
            전체
          </Button>
          {priceEmojiCatalog.map((item, idx) => (
            <Button
              data-ui={`price-category-chip-${idx}-${uiToken(item.emoji)}`}
              key={item.emoji}
              type="button"
              size="sm"
              variant={item.emoji === priceCategoryFilter ? "default" : "outline"}
              onClick={() => setPriceCategoryFilter(item.emoji)}
              title={item.categories.join(", ")}
            >
              {item.emoji} ({numFmt.format(item.count)})
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
          <Input data-ui="input-055" className={`w-full ${ACTIVE_FIELD_CLASS}`} id="refDate" type="date" value={refDate} onChange={(event) => setRefDate(event.target.value)} />
        </Field>
        <Field data-ui="field-056" className={FIELD_STACK_CLASS}>
          <FieldLabel data-ui="field-label-057" className="text-xs font-semibold text-muted-foreground" htmlFor="refTime">기준 시간</FieldLabel>
          <Input data-ui="input-058" className={`w-full ${ACTIVE_FIELD_CLASS}`} id="refTime" type="time" step={60} value={refTime} onChange={(event) => setRefTime(event.target.value)} />
        </Field>
      </div>

      <div data-ui="div-059" className="grid gap-3">
        <Field data-ui="field-060" className={FIELD_STACK_CLASS}>
          <FieldLabel data-ui="field-label-061" className="text-xs font-semibold text-muted-foreground">기준시각 영업 상태</FieldLabel>
          <div data-ui="div-ref-open-mode-062" id="refOpenModeChips" className={CHIP_ROW_CLASS}>
            {REF_OPEN_MODE_PRESETS.map((preset, idx) => (
              <Button
                data-ui={`ref-open-mode-chip-${idx}-${preset.value}`}
                key={preset.value}
                type="button"
                size="sm"
                variant={preset.value === refOpenMode ? "default" : "outline"}
                onClick={() => setRefOpenMode(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </Field>
      </div>

      {!isTabletViewport ? (
        <Field data-ui="field-071" className={FIELD_STACK_CLASS}>
          <FieldLabel data-ui="field-label-072" className="text-xs font-semibold text-muted-foreground">키워드 필터</FieldLabel>
          <Select data-ui="select-073" value={topKeywordFilter} onValueChange={setTopKeywordFilter}>
            <SelectTrigger data-ui="select-trigger-074" id="topKeywordFilter" className={`w-full ${ACTIVE_FIELD_CLASS}`}>
              <SelectValue data-ui="select-value-075" placeholder="전체" />
            </SelectTrigger>
            <SelectContent data-ui="select-content-076">
              <SelectItem data-ui="select-item-077" value="all">전체</SelectItem>
              {topKeywordCatalog.map((item, idx) => (
                <SelectItem data-ui={`top-keyword-option-${idx}-${uiToken(item.keyword)}`} key={item.keyword} value={item.keyword}>
                  {item.keyword} (가게 {numFmt.format(item.placeCount)} / 언급 {numFmt.format(item.mentionCount)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription data-ui="field-desc-top-keyword-078" className="text-[11px] text-muted-foreground">
            최상위 키워드가 아니어도 해당 키워드가 있으면 포함합니다.
          </FieldDescription>
        </Field>
      ) : null}

      <Button data-ui="button-079" id="resetBtn" type="button" variant="outline" size="sm" className="w-full" onClick={resetFilters}>
        <RotateCcw data-ui="rotate-ccw-080" className="size-4" /> 필터 초기화
      </Button>
    </FieldGroup>
  )

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
          {!isCompactViewport ? (
            <Card data-ui="card-019" className="min-w-0 border-slate-200/80 shadow-xl shadow-slate-900/5 xl:flex xl:h-full xl:min-h-0 xl:flex-col">
              <CardContent data-ui="card-content-020" className={CARD_CONTENT_CLASS}>
                <ScrollArea
                  data-ui="scroll-area-021"
                  className="h-full w-full min-w-0"
                  viewportClassName="[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0"
                >
                  {renderPrimaryFilterPanel()}
                </ScrollArea>
              </CardContent>
            </Card>
          ) : null}

          <Card data-ui="card-140" className="min-w-0 border-slate-200/80 shadow-xl shadow-slate-900/5 flex h-full min-h-0 flex-col">
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
                      {!isCompactViewport ? (
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
                      ) : null}
                    </>
                  )}
                </div>

                <div data-ui="dialog-filter-trigger-group" className="flex flex-wrap gap-2">
                  {isTabletViewport ? (
                    <div data-ui="tablet-top-keyword-inline-401" className="flex min-w-[260px] items-center gap-2">
                      <span data-ui="tablet-top-keyword-inline-label-402" className="shrink-0 text-xs font-semibold text-muted-foreground">
                        키워드
                      </span>
                      <Select data-ui="select-tablet-top-keyword-403" value={topKeywordFilter} onValueChange={setTopKeywordFilter}>
                        <SelectTrigger data-ui="select-trigger-tablet-top-keyword-404" className="h-8 min-w-0 flex-1">
                          <SelectValue data-ui="select-value-tablet-top-keyword-405" placeholder="전체" />
                        </SelectTrigger>
                        <SelectContent data-ui="select-content-tablet-top-keyword-406">
                          <SelectItem data-ui="select-item-tablet-top-keyword-all-407" value="all">전체</SelectItem>
                          {topKeywordCatalog.map((item, idx) => (
                            <SelectItem
                              data-ui={`top-keyword-option-tablet-${idx}-${uiToken(item.keyword)}`}
                              key={item.keyword}
                              value={item.keyword}
                            >
                              {item.keyword} (가게 {numFmt.format(item.placeCount)} / 언급 {numFmt.format(item.mentionCount)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {isCompactViewport ? (
                    <Dialog data-ui="dialog-mobile-filter-root" open={mobileFilterDialogOpen} onOpenChange={setMobileFilterDialogOpen}>
                      <DialogTrigger data-ui="dialog-mobile-filter-trigger-wrap" asChild>
                        <Button data-ui="dialog-mobile-filter-trigger" type="button" variant="outline" className="gap-2">
                          <SlidersHorizontal data-ui="dialog-mobile-filter-trigger-icon" className="size-4" />
                          필터
                        </Button>
                      </DialogTrigger>
                      <DialogContent
                        data-ui="dialog-mobile-filter-content"
                        className="max-h-[calc(100dvh-2rem)] w-[min(96vw,760px)] max-w-[760px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden gap-0 p-0"
                      >
                        <DialogHeader data-ui="dialog-mobile-filter-header" className="space-y-2 border-b px-5 py-4">
                          <DialogTitle data-ui="dialog-mobile-filter-title">필터</DialogTitle>
                          <DialogDescription data-ui="dialog-mobile-filter-description">
                            검색/거리/시간 기준 필터를 설정합니다.
                          </DialogDescription>
                        </DialogHeader>
                        <ScrollArea
                          data-ui="dialog-mobile-filter-scroll-area"
                          className="h-full min-h-0 px-5 py-4"
                          viewportClassName="[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0"
                        >
                          {renderPrimaryFilterPanel()}
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                  ) : null}

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
                    <DialogContent
                      data-ui="dialog-convenience-content"
                      className="max-h-[calc(100dvh-2rem)] w-[min(96vw,760px)] max-w-[760px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden gap-0 p-0"
                    >
                      <DialogHeader data-ui="dialog-convenience-header" className="space-y-2 border-b px-5 py-4">
                        <DialogTitle data-ui="dialog-convenience-title">편의시설 및 서비스 필터</DialogTitle>
                        <DialogDescription data-ui="dialog-convenience-description">
                          옵션/편의시설 정보를 합쳐 필터합니다.
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea data-ui="dialog-convenience-scroll-area" className="h-full min-h-0 px-5 py-4">
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
                    <DialogContent
                      data-ui="dialog-advanced-content"
                      className="max-h-[calc(100dvh-2rem)] w-[min(96vw,1080px)] max-w-[1080px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden gap-0 p-0"
                    >
                      <DialogHeader data-ui="dialog-advanced-header" className="space-y-2 border-b px-5 py-4">
                        <DialogTitle data-ui="dialog-advanced-title">고급 필터</DialogTitle>
                        <DialogDescription data-ui="dialog-advanced-description">
                          파생/원본 필드에 규칙 기반 조건을 추가합니다.
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea data-ui="dialog-advanced-scroll-area" className="h-full min-h-0 px-5 py-4">
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
              <div data-ui="scroll-area-172" ref={desktopScrollRef} className="h-full min-h-0 w-full overflow-auto rounded-lg border bg-background">
                <div data-ui="div-173" className="min-w-full w-max">
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
