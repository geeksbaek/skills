---
name: place-collector-viewer
description: >
  Collect Naver place datasets and inspect them in a local web datagrid. Use when asked to gather
  places from Naver Maps, maximize coverage in dense areas with bounds tile split + pagination +
  placeId dedupe, export JSON, compare collection methods, or view/filter place lists in
  place-datagrid-view.html. Triggers include "플레이스 수집", "장소 데이터 추출", "네이버 지도 데이터 모으기",
  "bounds 타일 분할", "placeId 중복 제거", "json 조회", "웹 데이터그리드로 장소 보기".
---

# Place Collector Viewer

Use Chrome DevTools MCP to collect Naver place data, save it as JSON, then auto-open and auto-import it in the local datagrid viewer.

## Goal

1. Collect a high-coverage place pool.
2. Open the viewer and import the JSON automatically.
3. Browse/filter/sort the imported pool.

## Scope

- Include: place collection, coverage comparison, JSON export, viewer auto-loading.
- Exclude: weather, date-course planning, budget itinerary generation.

## Preconditions

- Use Chrome DevTools MCP.
- Keep `/Users/jongyeol/.claude/skills/place-collector-viewer/assets/place-datagrid-view.html` available.

## Non-negotiable Rules

1. Use `bounds` tile split + pagination + `placeId` dedupe as the default collection method.
2. Do not claim full coverage from one wide `bounds` query alone.
3. Retry failed MCP/script calls up to 3 times.
4. Do not report places that are not in the exported JSON.
5. When a JSON file path exists and user does not opt out, auto-open viewer and auto-import JSON (do not ask user to upload manually).

## Workflow

### 1) Verify MCP

- Call `list_pages`.
- If unavailable, follow `references/troubleshooting.md` and stop if recovery fails.

### 2) Lock collection parameters

- `queryTexts`: e.g. `강남역 음식점`, `강남역 카페`
- `center`: `{x, y}` for the target place/area
- `radiusMeters`: default `300` (increase for validation runs)
- `gridSize`: default `6` (`6~8` for dense zones)
- `display`: default `70`
- output path: `~/Downloads/place-collector-viewer/dp-{area}-{YYYY-MM-DD}.json`

### 3) Build base pool (required)

- Read `references/naver-map-guide.md`.
- Run:
1. `Step 0` to clear `localStorage.__dp__`
2. `Step 1A` (tile split GraphQL collection with pagination)
- Expand `queryTexts` and rerun Step 1A when needed.

### 4) Compare coverage methods (when requested)

- Method A: tile split + pagination + dedupe (Step 1A baseline)
- Method B: one wide bounds + pagination + dedupe
- Compare `placeId` sets and report overlap/missing counts.

### 5) Enrich data (default on)

- Run `Step 2` (`getVisitorReviewStats`, batch 50)
- Run `Step 3` (`getPlaceDetail`, batch 50)
- Run `Step 4` (`getFeeds`, batch 50 with sequential fallback)

### 6) Export JSON

- Run `Step 5` to export `__dp__`.
- Ensure output directory exists (`mkdir -p ~/Downloads/place-collector-viewer`).
- If MCP output is wrapped or broken, clean with `scripts/extract-dp.py`.
- Save final path as `outputJsonPath`.

### 7) Auto-open viewer + auto-import JSON (default)

Run this automatically when `outputJsonPath` exists.

1. Open viewer page:
- `file:///Users/jongyeol/.claude/skills/place-collector-viewer/assets/place-datagrid-view.html`
2. Find file input with snapshot (`#fileInput`).
3. Upload file by MCP `upload_file` using `outputJsonPath`.
4. Verify load state by reading `#status` text (`데이터 X / Y개`).
5. If total count is `0` or parse fails, retry upload once.

Status check script:

```javascript
() => {
  const text = document.querySelector('#status')?.innerText || '';
  const m = text.match(/데이터\s*([\d,]+)\s*\/\s*([\d,]+)개/);
  const toNum = (v) => Number(String(v || '').replace(/,/g, ''));
  return {
    statusText: text,
    shown: m ? toNum(m[1]) : null,
    total: m ? toNum(m[2]) : null
  };
}
```

### 8) Report

- Include parameters (`queryTexts`, `center`, `radiusMeters`, `gridSize`, `display`)
- Include counts (`totalUnique`, retry/error summary, enrichment status)
- Include `outputJsonPath`
- Include viewer load result (`shown/total`)

## Fast Paths

- If user already provides a JSON path, skip collection and run only Step 7 + Step 8.
- If user asks extraction only, skip Step 7 and return JSON path + stats.

## Resources

- `references/naver-map-guide.md`: collection/enrichment/export scripts
- `references/troubleshooting.md`: MCP recovery steps
- `scripts/extract-dp.py`: JSON cleanup helper for MCP output
- `assets/place-datagrid-view.html`: local datagrid viewer
