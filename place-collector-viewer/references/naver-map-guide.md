# Naver Place Collection Guide

Chrome DevTools MCP `evaluate_script`로 네이버 플레이스 데이터를 수집하는 최소 실행 가이드.

## 핵심 원칙

- 기본 수집은 `bounds` 타일 분할 + 페이지네이션 + `placeId` 중복 제거를 사용한다.
- 단일 큰 `bounds`는 비교/검증 용도로만 사용한다.
- 모든 데이터는 `localStorage.__dp__`(key=`placeId`)에 누적한다.

## Step 0: 초기화

```javascript
() => {
  localStorage.removeItem('__dp__');
  localStorage.removeItem('__dp_ids_tile__');
  localStorage.removeItem('__dp_ids_wide__');
  return 'cleared';
}
```

## Step 1A: 타일 분할 + 페이지네이션 수집 (기본)

- `pcmap.place.naver.com` 탭에서 실행한다.
- 고밀도 지역은 `gridSize=6~8`을 권장한다.
- 비교 실험으로 단일 `bounds`를 만들려면 동일 스크립트에서 `gridSize=1`로 실행한다.

```javascript
async (...args) => {
  const input = args?.[0] || {};

  const center = input.center || { x: 127.0426576, y: 37.5151681 };
  const queryTexts = input.queryTexts || ['강남역 음식점', '강남역 카페'];
  const radiusMeters = Number(input.radiusMeters ?? 300);
  const gridSize = Number(input.gridSize ?? 6);
  const display = Number(input.display ?? 70);
  const maxPages = Number(input.maxPages ?? 30);
  const delayMs = Number(input.delayMs ?? 15);

  const endpoint = 'https://pcmap-api.place.naver.com/graphql';
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const latDelta = radiusMeters / 111320;
  const lonDelta = radiusMeters / (111320 * Math.cos(center.y * Math.PI / 180));
  const outer = {
    minX: center.x - lonDelta,
    minY: center.y - latDelta,
    maxX: center.x + lonDelta,
    maxY: center.y + latDelta
  };
  const stepX = (outer.maxX - outer.minX) / gridSize;
  const stepY = (outer.maxY - outer.minY) / gridSize;

  const gql = `query getRestaurants($restaurantListInput: RestaurantListInput) {
    restaurants: restaurantList(input: $restaurantListInput) {
      total
      items {
        id
        name
        category
        businessCategory
        x
        y
        commonAddress
        roadAddress
        visitorReviewCount
        visitorReviewScore
        blogCafeReviewCount
        saveCount
        options
        newBusinessHours { status description }
        newOpening
        priceCategory
        microReview
        broadcastInfo { program }
      }
    }
  }`;

  const formatBounds = (b) =>
    `${b.minX.toFixed(7)};${b.minY.toFixed(7)};${b.maxX.toFixed(7)};${b.maxY.toFixed(7)}`;

  async function fetchPage(params) {
    const body = [{
      operationName: 'getRestaurants',
      variables: {
        restaurantListInput: {
          query: params.queryText,
          x: params.x.toFixed(7),
          y: params.y.toFixed(7),
          bounds: params.bounds,
          start: params.start,
          display,
          isCurrentLocationSearch: true,
          deviceType: 'pcmap',
          isPcmap: true
        }
      },
      query: gql
    }];

    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'accept': '*/*' },
      body: JSON.stringify(body)
    });

    if (!res.ok) return { error: `HTTP ${res.status}` };
    const json = await res.json();
    const payload = json?.[0];
    if (payload?.errors?.length) return { error: payload.errors[0]?.message || 'GraphQL error' };
    return {
      total: Number(payload?.data?.restaurants?.total || 0),
      items: payload?.data?.restaurants?.items || []
    };
  }

  async function fetchWithRetry(params, retry = 3) {
    let lastError = null;
    for (let i = 1; i <= retry; i++) {
      try {
        const out = await fetchPage(params);
        if (!out.error) return { ...out, attempts: i };
        lastError = out.error;
      } catch (err) {
        lastError = String(err);
      }
      await sleep(Math.min(1200, 120 * i));
    }
    return { error: lastError || 'unknown', attempts: retry };
  }

  const existing = JSON.parse(localStorage.getItem('__dp__') || '{}');
  const stats = { requests: 0, retries: 0, rawFetched: 0, errors: [] };

  for (const queryText of queryTexts) {
    for (let ix = 0; ix < gridSize; ix++) {
      for (let iy = 0; iy < gridSize; iy++) {
        const tile = {
          minX: outer.minX + stepX * ix,
          minY: outer.minY + stepY * iy,
          maxX: outer.minX + stepX * (ix + 1),
          maxY: outer.minY + stepY * (iy + 1)
        };
        const bounds = formatBounds(tile);
        const cx = (tile.minX + tile.maxX) / 2;
        const cy = (tile.minY + tile.maxY) / 2;

        for (let page = 0; page < maxPages; page++) {
          const start = 1 + page * display;
          const r = await fetchWithRetry({ queryText, bounds, start, x: cx, y: cy });
          stats.requests += 1;
          stats.retries += (r.attempts || 1) - 1;

          if (r.error) {
            stats.errors.push({ queryText, ix, iy, start, error: r.error });
            break;
          }

          const items = r.items || [];
          stats.rawFetched += items.length;
          for (const it of items) {
            const id = String(it.id || '');
            if (!id) continue;
            const prev = existing[id] || {};
            existing[id] = {
              ...prev,
              id,
              name: it.name ?? prev.name,
              category: it.category ?? prev.category,
              x: it.x ?? prev.x,
              y: it.y ?? prev.y,
              commonAddress: it.commonAddress ?? prev.commonAddress,
              roadAddress: it.roadAddress ?? prev.roadAddress,
              visitorReviewCount: it.visitorReviewCount ?? prev.visitorReviewCount,
              visitorReviewScore: it.visitorReviewScore ?? prev.visitorReviewScore,
              blogCafeReviewCount: it.blogCafeReviewCount ?? prev.blogCafeReviewCount,
              saveCount: it.saveCount ?? prev.saveCount,
              options: it.options ?? prev.options,
              newBusinessHours: it.newBusinessHours ?? prev.newBusinessHours,
              newOpening: it.newOpening ?? prev.newOpening,
              priceCategory: it.priceCategory ?? prev.priceCategory,
              microReview: it.microReview ?? prev.microReview,
              broadcastInfo: it.broadcastInfo?.program ?? prev.broadcastInfo
            };
          }

          if (items.length < display || start - 1 + items.length >= (r.total || 0)) break;
          await sleep(delayMs);
        }
      }
    }
  }

  localStorage.setItem('__dp__', JSON.stringify(existing));

  return {
    method: gridSize === 1 ? 'wide-pagination-dedupe' : 'tile-pagination-dedupe',
    queryTexts,
    radiusMeters,
    gridSize,
    requests: stats.requests,
    retries: stats.retries,
    rawFetched: stats.rawFetched,
    totalUnique: Object.keys(existing).length,
    errorCount: stats.errors.length,
    errors: stats.errors.slice(0, 10)
  };
}
```

실행 예시:

```javascript
{
  "center": { "x": 127.0426576, "y": 37.5151681 },
  "queryTexts": ["강남역 음식점", "강남역 카페"],
  "radiusMeters": 300,
  "gridSize": 6,
  "display": 70,
  "maxPages": 30
}
```

## Step 1B: 방식 비교용 스냅샷 저장/비교

- Step 1A 실행 후 각 방식의 ID 세트를 저장한다.
- 권장 키: `tile`, `wide`.

```javascript
(...args) => {
  const key = String(args?.[0]?.key || 'tile');
  const ids = Object.keys(JSON.parse(localStorage.getItem('__dp__') || '{}'));
  localStorage.setItem(`__dp_ids_${key}__`, JSON.stringify(ids));
  return { key, count: ids.length };
}
```

```javascript
(...args) => {
  const a = String(args?.[0]?.a || 'tile');
  const b = String(args?.[0]?.b || 'wide');
  const setA = new Set(JSON.parse(localStorage.getItem(`__dp_ids_${a}__`) || '[]'));
  const setB = new Set(JSON.parse(localStorage.getItem(`__dp_ids_${b}__`) || '[]'));
  const onlyA = [];
  const onlyB = [];
  for (const id of setA) if (!setB.has(id)) onlyA.push(id);
  for (const id of setB) if (!setA.has(id)) onlyB.push(id);
  return {
    a,
    b,
    countA: setA.size,
    countB: setB.size,
    intersection: [...setA].filter(id => setB.has(id)).length,
    onlyA: onlyA.length,
    onlyB: onlyB.length,
    onlyASample: onlyA.slice(0, 20),
    onlyBSample: onlyB.slice(0, 20)
  };
}
```

## Step 2: 리뷰 통계 배치 보강

```javascript
async () => {
  const all = JSON.parse(localStorage.getItem('__dp__') || '{}');
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const missingIds = Object.keys(all).filter(id => !all[id]?.keywords);
  let reviewRetryCount = 0;
  let reviewFailed = false;

  if (missingIds.length > 0) {
    const makeQueries = (ids) => ids.map(id => ({
      operationName: 'getVisitorReviewStats',
      variables: { businessType: 'restaurant', id },
      query: 'query getVisitorReviewStats($id: String, $businessType: String = "place") { visitorReviewStats(input: {businessId: $id, businessType: $businessType}) { id review { avgRating totalCount } analysis { votedKeyword { reviewCount details { code displayName count } } } } }'
    }));

    const BATCH = 50;
    for (let cursor = 0; cursor < missingIds.length; cursor += BATCH) {
      const batch = missingIds.slice(cursor, cursor + BATCH);
      let retries = 0;
      while (retries < 3) {
        try {
          const res = await fetch('https://pcmap-api.place.naver.com/graphql', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(makeQueries(batch))
          });
          if (!res.ok) {
            if ((res.status === 429 || res.status >= 500) && retries < 3) {
              retries++;
              reviewRetryCount++;
              await sleep(Math.min(3200, 450 * (2 ** retries)) + Math.floor(Math.random() * 250));
              continue;
            }
            reviewFailed = true;
            break;
          }
          const rows = await res.json();
          rows.forEach(row => {
            const s = row?.data?.visitorReviewStats;
            if (!s?.id) return;
            const details = s?.analysis?.votedKeyword?.details || [];
            const keywords = {};
            details.forEach(d => { keywords[d.code] = d.count || 0; });
            const id = String(s.id);
            if (all[id]) {
              all[id].reviewCount = s?.analysis?.votedKeyword?.reviewCount || s?.review?.totalCount || 0;
              all[id].avgRating = s?.review?.avgRating || 0;
              all[id].keywords = keywords;
              all[id].details = details;
            }
          });
          localStorage.setItem('__dp__', JSON.stringify(all));
          await sleep(150);
          break;
        } catch {
          retries++;
          reviewRetryCount++;
          if (retries >= 3) { reviewFailed = true; break; }
          await sleep(300 * retries);
        }
      }
    }
  }

  return {
    totalPlaces: Object.keys(all).length,
    reviewsFetched: missingIds.length,
    reviewsCached: Object.keys(all).length - missingIds.length,
    reviewRetryCount,
    reviewFailed
  };
}
```

## Step 3: 상세 정보 배치 보강

```javascript
async () => {
  const all = JSON.parse(localStorage.getItem('__dp__') || '{}');
  const targetIds = Object.keys(all).filter(id => !all[id]?.detailHours);
  if (targetIds.length === 0) return { detailFetched: 0, source: 'allCached' };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const query = "query getPlaceDetail($input: PlaceDetailInput) { placeDetail(input: $input) { base { id name phone virtualPhone roadAddress address category conveniences coordinate { x y } } newBusinessHours(format: restaurant) { name businessStatusDescription { status description } businessHours { day businessHours { start end } breakHours { start end } lastOrderTimes { type time } } comingRegularClosedDays } informationTab(providerSource: [pbp]) { parkingInfo { description } } } }";

  let fetched = 0;
  let failed = 0;
  const BATCH = 50;

  for (let cursor = 0; cursor < targetIds.length; cursor += BATCH) {
    const batch = targetIds.slice(cursor, cursor + BATCH);
    const wtmHeader = btoa(JSON.stringify({ arg: batch[0], type: 'restaurant', source: 'place' }));
    let retries = 0;

    while (retries < 3) {
      try {
        const res = await fetch('https://pcmap-api.place.naver.com/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-wtm-graphql': wtmHeader },
          body: JSON.stringify(batch.map(id => ({
            operationName: 'getPlaceDetail',
            variables: { input: { deviceType: 'pcmap', id, isNx: false } },
            query
          })))
        });

        if (!res.ok) {
          if ((res.status === 429 || res.status >= 500) && retries < 2) {
            retries++;
            await sleep(Math.min(3200, 450 * (2 ** retries)) + Math.floor(Math.random() * 250));
            continue;
          }
          failed += batch.length;
          break;
        }

        const rows = await res.json();
        rows.forEach((row) => {
          const d = row?.data?.placeDetail;
          if (!d?.base?.id) return;
          const id = String(d.base.id);
          if (!all[id]) return;
          const bh = d.newBusinessHours?.[0];
          all[id].detailHours = bh?.businessHours || [];
          all[id].detailStatus = bh?.businessStatusDescription || null;
          all[id].regularClosedDays = bh?.comingRegularClosedDays || '';
          all[id].parkingDetail = d.informationTab?.parkingInfo?.description || null;
          all[id].detailPhone = d.base.phone || d.base.virtualPhone || null;
          all[id].detailConveniences = d.base.conveniences || [];
          fetched++;
        });

        localStorage.setItem('__dp__', JSON.stringify(all));
        await sleep(150);
        break;
      } catch {
        retries++;
        if (retries >= 3) { failed += batch.length; break; }
        await sleep(300 * retries);
      }
    }
  }

  return { detailFetched: fetched, detailFailed: failed, targetCount: targetIds.length };
}
```

## Step 4: 소식(Feeds) 배치 보강

```javascript
async () => {
  const all = JSON.parse(localStorage.getItem('__dp__') || '{}');
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const missingIds = Object.keys(all).filter(id => !all[id]?.feeds);
  if (missingIds.length === 0) return { feedsFetched: 0, source: 'allCached' };

  let fetched = 0;
  let failed = 0;
  let usedFallback = false;
  const BATCH = 50;

  for (let cursor = 0; cursor < missingIds.length; cursor += BATCH) {
    const batchIds = missingIds.slice(cursor, cursor + BATCH);
    let retries = 0;
    let batchSuccess = false;

    while (retries < 3 && !batchSuccess) {
      try {
        const batch = batchIds.map(id => ({
          operationName: 'getFeeds',
          variables: { businessId: String(id), feedOffset: 0, type: 'all' },
          query: "query getFeeds($businessId: String!, $feedOffset: Int, $type: String) { feeds(businessId: $businessId feedOffset: $feedOffset type: $type) { feeds { feedId title desc relativeCreated isPinned } hasMore } }"
        }));

        const res = await fetch('https://pcmap-api.place.naver.com/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(batch)
        });

        if (!res.ok) {
          if ((res.status === 429 || res.status >= 500) && retries < 2) {
            retries++;
            await sleep(Math.min(3200, 450 * (2 ** retries)) + Math.floor(Math.random() * 250));
            continue;
          }
          usedFallback = true;
          break;
        }

        const rows = await res.json();
        const fetchedAt = new Date().toISOString();
        rows.forEach((row, i) => {
          const feedsData = row?.data?.feeds;
          const id = batchIds[i];
          if (all[id] && feedsData) {
            all[id].feeds = feedsData.feeds || [];
            all[id].feedsHasMore = feedsData.hasMore || false;
            all[id].feedsFetchedAt = fetchedAt;
            fetched++;
          }
        });

        localStorage.setItem('__dp__', JSON.stringify(all));
        await sleep(150);
        batchSuccess = true;
      } catch {
        retries++;
        if (retries >= 3) { usedFallback = true; break; }
        await sleep(300 * retries);
      }
    }

    if (usedFallback) break;
  }

  if (usedFallback) {
    const remainingIds = Object.keys(all).filter(id => !all[id]?.feeds);
    for (let i = 0; i < remainingIds.length; i++) {
      const id = remainingIds[i];
      try {
        const res = await fetch('https://pcmap-api.place.naver.com/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify([{
            operationName: 'getFeeds',
            variables: { businessId: String(id), feedOffset: 0, type: 'all' },
            query: "query getFeeds($businessId: String!, $feedOffset: Int, $type: String) { feeds(businessId: $businessId feedOffset: $feedOffset type: $type) { feeds { feedId title desc relativeCreated isPinned } hasMore } }"
          }])
        });
        if (res.ok) {
          const json = await res.json();
          const page = json?.[0]?.data?.feeds;
          if (all[id] && page) {
            all[id].feeds = page.feeds || [];
            all[id].feedsHasMore = page.hasMore || false;
            all[id].feedsFetchedAt = new Date().toISOString();
            fetched++;
          }
        } else {
          failed++;
        }
      } catch {
        failed++;
      }

      if (i % 10 === 9) localStorage.setItem('__dp__', JSON.stringify(all));
      await sleep(300);
    }
    localStorage.setItem('__dp__', JSON.stringify(all));
  }

  return { feedsFetched: fetched, feedsFailed: failed, usedFallback, targetCount: missingIds.length };
}
```

## Step 5: JSON 추출

```javascript
() => JSON.parse(localStorage.getItem('__dp__') || '{}')
```

반환 payload가 크면 MCP 임시파일 경로가 제공될 수 있다. 그 경우 `scripts/extract-dp.py`로 정리 저장한다.

```bash
python3 /Users/jongyeol/.claude/skills/place-collector-viewer/scripts/extract-dp.py <mcp_temp_file> <output_path>
```

## 권장 실행 순서

1. Step 0
2. Step 1A (`gridSize=6~8`) 기본 풀 수집
3. 필요 시 Step 1A를 `gridSize=1`로 재실행 후 Step 1B로 방식 비교
4. Step 2, Step 3, Step 4 보강
5. Step 5 추출
