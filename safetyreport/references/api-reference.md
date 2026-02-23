# 안전신문고 API 및 프로토콜 레퍼런스

## API 엔드포인트

| 기능 | Method | URL |
|------|--------|-----|
| SMS 인증번호 요청 | POST | `/api/v1/portal/common/sms` |
| SMS 인증번호 확인 | POST | `/api/v1/portal/common/sms/smsCrtfcTy` |
| 신고서 제출 | POST | `/api/v1/portal/safereport/safereport` |
| 임시저장 | POST | `/api/v1/portal/safereport/safereport/tmpsafereport` |
| 처리기관 조회 | POST | `/api/v1/portal/safereport/safereport/agencyList` |
| 파일 업로드 핸들러 | POST | `/raonkupload/handler/raonkhandler.jsp` |

## RAONKUpload 프로토콜

### 개요

RAONKUpload는 3단계 HTTP 기반 파일 업로드 프로토콜이다. 독자 프로토콜이 아닌 표준
`multipart/form-data` POST를 사용하며, 메타데이터 파라미터만 base64+문자삽입 방식으로
난독화한다.

### 보안 설정 (현재 사이트)

| 항목 | 값 | 의미 |
|------|---|------|
| encryptParam | 1 | base64 + "raonwiz" 문자 삽입 (AES 아님) |
| fileEncrypt | 0 | 파일 데이터 암호화 없음 |
| fileIntegrity | 0 | HMAC-SHA256 무결성 검증 없음 |
| resumeUpload | 0 | 이어올리기 비활성화 |

### 암호화 알고리즘 (encryptParam=1)

1. 원본 문자열을 UTF-8 base64 인코딩
2. 인코딩 결과가 10자 이상이면 다음 위치에 문자 삽입:
   - 위치 8에 'r', 6에 'a', 9에 'o', 7에 'n', 8에 'w', 6에 'i', 9에 'z'
   - (삽입 순서대로 적용, 결과적으로 "raonwiz" 7글자 삽입)
3. '+' → '%2B' 치환

복호화는 역순으로 문자 제거 후 base64 디코딩.

### 3단계 업로드

#### 단계 1: preUploadRequest (c01)

- Content-Type: `application/x-www-form-urlencoded; charset=UTF-8`
- 파라미터: `k00=<암호화된_메타데이터>`
- 메타데이터 키: kc(커맨드), k01(암호화레벨), k05(이어올리기), k12(GUID), k13(파일크기), k14(파일명), k20(순서)
- 구분자: form feed(`\x0c`) = 키-값, vertical tab(`\x0b`) = 항목 간
- 응답: `<RAONK>[OK]저장경로\x0C파일크기\x0CGUID</RAONK>`

#### 단계 2: processUpload (c02)

- Content-Type: `multipart/form-data`
- URL: `핸들러URL?raonk=urk_<랜덤ID>`
- FormData: `k00`(암호화된 청크 메타데이터) + `Slice`(파일 청크 Blob)
- 청크 크기: 1MB (1,048,576 bytes)
- 메타데이터 키: kc(c02), k01, k03(무결성), k05, k12(GUID), k19(시작위치), k26(저장경로)
- 응답: `<RAONK>[OK]</RAONK>`

#### 단계 3: endUploadRequest (c03)

- Content-Type: `application/x-www-form-urlencoded; charset=UTF-8`
- 파라미터: `k00=<암호화된_메타데이터>`
- 메타데이터 키: kc(c03), k01, k12(GUID), k14(파일명), k20(순서)
- 응답: `<RAONK>[OK]저장경로\x0B업로드파일명\x0B원본파일명\x0B파일크기</RAONK>`

## 신고서 제출 폼 필드

### 필수 필드

| 필드명 | 설명 | 예시 |
|--------|------|------|
| C_SSNPC_CD | 신고 채널 코드 | `TV` (포털) |
| C_SSNPC_TYPE | 신고 유형 코드 | `02`(교통위반), `03`(이륜차), `10`(난폭/보복) |
| C_A_TITLE | 제목 | 신호위반 신고 |
| C_A_CONTENTS | 신고 내용 (메타정보 포함) | 본문 + 차량번호 + 일시 + 장소 |
| VHRNO | 차량번호 | 12가3456 |
| DEVEL_DATE | 발생일자 | 2026.02.23. |
| DEVEL_TIME | 발생시각 | 13:16 |
| C_PHONE2 | 휴대전화 (하이픈 포함) | 010-1234-5678 |
| SMS_CRTFC_ID | SMS 인증 ID | (서버 응답값) |
| SMS_CRTFC_AT | SMS 인증 완료 여부 | Y |
| C_A_W | 위도 | 37.5003271 |
| C_A_E | 경도 | 127.0343891 |
| RN_ADRES | 도로명 주소 | 서울특별시 강남구 테헤란로 152 |
| C_A_ADD2 | 지번 주소 | 서울 강남구 역삼동 737 |
| C_ZIP | 우편번호 | 06236 |
| agreeUseMyInfo | 개인정보 수집 동의 | Y |

### 파일 관련 필드

| 필드명 | 설명 | 형식 |
|--------|------|------|
| C_FILES | 업로드된 파일명 | 파이프(`\|`) 구분 |
| C_R_FILES | 원본 파일명 | 파이프(`\|`) 구분 |
| C_FILES_VIEW | 파일 공개 여부 | `1\|1\|0\|0` (4자리, 1=있음/0=없음) |

### 선택 필드

| 필드명 | 설명 | 기본값 |
|--------|------|--------|
| C_NAME | 신고인 이름 | (빈 문자열) |
| C_EMAIL | 이메일 | (빈 문자열) |
| C_TYPE | 구분 | `0`(개인), `3`(기관), `1`(단체/기업) |
| C_OPEN | 신고내용 공유 | `0`(예), `1`(아니요) |
| C_ID | 식별자 | 전화번호(하이픈 제거) |
| PROCESS_NTCN_YN | 처리 통보 여부 | Y |

## SMS 인증 API

### 인증번호 요청

```
POST /api/v1/portal/common/sms
MOBLPHON_NO=01012345678
SMS_CRTFC_SE=01        # 포털
SMS_CRTFC_TY=01        # 공통코드
CRTFC_TYPE=M           # M=문자, K=카카오톡
```

응답: `{"result":"success","SMS_CRTFC_ID":"..."}`

### 인증번호 확인

```
POST /api/v1/portal/common/sms/smsCrtfcTy
SMS_CRTFC_ID=...       # 요청 시 받은 ID
SMS_CRTFC_NO=488676    # 6자리 인증번호
SMS_CRTFC_TY=01
MOBLPHON_NO=01012345678
```

응답: `{"result":"success"}` / `{"result":"fail"}`

### 발신번호

안전신문고 SMS 발신번호: `1600-7395` (iMessage에서 `+8216007395`)

## Kakao API 주소 변환

사이트에 노출된 JavaScript SDK 키를 KA 헤더와 함께 사용한다.

```
Authorization: KakaoAK 713333cce4ca0c844875ed03dcf5ea31
KA: sdk/1.39.6 os/javascript lang/ko-KR device/MacIntel origin/https%3A%2F%2Fwww.safetyreport.go.kr
```

### 키워드 검색 → 좌표

```
GET https://dapi.kakao.com/v2/local/search/keyword.json?query=주소&size=1
```

### 좌표 → 도로명/지번 주소 역변환

```
GET https://dapi.kakao.com/v2/local/geo/coord2address.json?x=경도&y=위도
```

## 사이트 기술 스택

- **프레임워크**: Backbone.js + jQuery 3.0 + Handlebars + RequireJS (SPA)
- **URL 패턴**: `https://www.safetyreport.go.kr/#safereport/safereport3` (자동차/교통위반)
- **파일 업로드**: RAONKUpload 2018.1610833.1315.01
- **지도**: Kakao Map API + Naver Map API
- **보안**: TouchEn 키보드 보안 (미설치 시에도 동작)
