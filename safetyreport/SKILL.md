---
name: safetyreport
description: >
  File traffic violation reports on 안전신문고(safetyreport.go.kr). Use when asked to "교통위반 신고",
  "안전신문고 신고", "자동차 신고해줘", "신호위반 신고", "이륜차 신고", "난폭운전 신고",
  "보복운전 신고", "번호판 위반 신고", "불법 튜닝 신고", "교통 위반 접수", "차량 신고",
  "traffic violation report". Automates photo/video upload via RAONKUpload, SMS verification
  with iMessage auto-read, and Kakao API address conversion.
---

# 안전신문고 자동차/교통위반 신고

안전신문고(safetyreport.go.kr) 웹사이트에 자동차/교통위반 신고를 CLI로 접수하는 skill이다.
RAONKUpload 파일 업로드 프로토콜, Kakao API 주소 변환, SMS 인증번호 iMessage 자동 읽기를
포함한 전체 프로세스를 `scripts/safetyreport.py` 스크립트로 자동화한다.

## 전제 조건

- Python 3.10+, `requests`, `Pillow` 패키지
- macOS의 iMessage가 활성화되어 있어야 SMS 인증번호 자동 읽기 가능
- Ghostty(또는 사용 중인 터미널)에 **전체 디스크 접근 권한** 부여 필요 (iMessage DB 접근)
- 의존성 설치: `pip3 install --break-system-packages requests Pillow`

## 신고 유형

| 번호 | 유형 | 소관 |
|------|------|------|
| 1 | 교통위반(고속도로 포함) | 경찰청 |
| 2 | 이륜차 위반 | 경찰청 |
| 3 | 난폭/보복운전 | 경찰청 |
| 4 | 버스전용차로 위반(고속도로 제외) | 지자체 |
| 5 | 번호판 규정 위반 | 지자체 |
| 6 | 불법등화, 반사판(지) 가림/손상 | 지자체 |
| 7 | 불법 튜닝, 해체, 조작 | 지자체 |
| 8 | 기타 자동차 안전기준 위반 | 지자체 |

## 사용법

### 원라이너 모드

```bash
python3 scripts/safetyreport.py \
  -p 010-XXXX-XXXX \
  -t 1 \
  -v "12가3456" \
  -a "서울시 강남구 테헤란로 152" \
  --title "신호위반" \
  --content "적색신호에 직진 위반" \
  -f photo1.jpg photo2.jpg
```

### 주소 생략 (사진 EXIF GPS 자동 추출)

```bash
python3 scripts/safetyreport.py \
  -p 010-XXXX-XXXX \
  -v "12가3456" \
  --title "신호위반" \
  -f photo_with_gps.jpg
```

### 대화형 모드

```bash
python3 scripts/safetyreport.py
```

## CLI 인자

| 인자 | 필수 | 설명 |
|------|------|------|
| `-p`, `--phone` | O | 휴대전화번호 (예: 010-1234-5678) |
| `-t`, `--type` | - | 신고 유형 번호 1-8 (기본: 1) |
| `-v`, `--vehicle` | O | 차량번호 (예: 12가3456) |
| `-a`, `--address` | - | 발생장소 주소 (생략 시 EXIF GPS 추출) |
| `--title` | - | 신고 제목 (기본: 자동 생성) |
| `--content` | - | 신고 내용 (기본: 제목과 동일) |
| `-d`, `--date` | - | 발생일자 YYYY.MM.DD. (기본: 오늘) |
| `--time` | - | 발생시각 HH:MM (기본: 현재) |
| `-f`, `--files` | - | 첨부파일 경로 (최대 4개, 사진 30MB/동영상 130MB) |
| `-n`, `--name` | - | 신고인 이름 |

## 동작 흐름 (6단계)

1. **세션 초기화** - safetyreport.go.kr 접속하여 쿠키 획득
2. **파일 업로드** - RAONKUpload 3단계 프로토콜(preUpload→청크전송→endUpload)로 업로드
3. **주소 변환** - Kakao API로 주소→좌표/도로명/지번 변환 (또는 EXIF GPS→역지오코딩). 발생일시 미입력 시 사진 EXIF 촬영일시도 자동 추출
4. **SMS 인증 요청** - `/api/v1/portal/common/sms`로 인증번호 발송 (문자)
5. **인증번호 자동 읽기** - iMessage DB(`~/Library/Messages/chat.db`)에서 발신번호 `1600-7395`의 인증번호 자동 추출 (최대 90초 대기, 실패 시 수동 입력 fallback)
6. **신고서 제출** - `/api/v1/portal/safereport/safereport`로 폼 데이터 POST

## 신고 접수 워크플로우

사용자가 신고를 요청하면 다음 절차를 따른다:

1. 사용자로부터 필수 정보 수집: **전화번호**, **차량번호**, **발생장소**(또는 GPS가 포함된 사진)
2. 선택 정보 확인: 신고 유형, 제목, 내용, 발생일시, 신고인 이름
3. 증거 사진/동영상 파일 경로 확인
4. 수집된 정보로 스크립트 실행 명령어 구성
5. 사용자에게 최종 확인 후 실행
6. SMS 인증 단계에서 iMessage 자동 읽기가 실패할 경우(비macOS, 전체 디스크 접근 권한 미부여, iMessage 미설정 등), 스크립트가 수동 입력 모드로 전환된다. 이때 사용자에게 휴대전화로 수신된 6자리 인증번호를 직접 입력하도록 안내한다.

## 주의사항

- **불법 주정차 신고는 앱 전용**: 안전신문고 포털(웹)에서는 불법 주정차 신고를 접수하지 않음
- **사진 EXIF GPS/일시**: 실내 촬영 사진이나 위치 정보가 제거된 사진에서는 GPS 추출 불가. 촬영일시(DateTimeOriginal)도 EXIF에서 자동 추출
- **허용 파일 형식**: png, jpg, jpeg, gif, bmp, mp4, wmv, avi, asf, flv, mov, mpeg, mpg, mkv, 3gp, m4v
- **파일 크기 제한**: 사진/문서 각 30MB, 동영상 각 130MB, 총합 180MB, 최대 4개 파일
- **인증 유효시간**: SMS 인증번호는 5분간 유효

## 추가 리소스

### Reference Files

RAONKUpload 프로토콜, API 엔드포인트, 폼 필드 상세 정보:
- **`references/api-reference.md`** - API 엔드포인트, RAONKUpload 프로토콜 상세, 폼 필드 목록
