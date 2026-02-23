#!/usr/bin/env python3
"""안전신문고 자동차/교통위반 신고 CLI"""

import argparse
import base64
import json
import os
import random
import re
import sqlite3
import sys
import time
import urllib.parse
import uuid
from datetime import datetime
import requests

# ── 상수 ──────────────────────────────────────────────
BASE_URL = "https://www.safetyreport.go.kr"
HANDLER_URL = f"{BASE_URL}/raonkupload/handler/raonkhandler.jsp"
SMS_URL = f"{BASE_URL}/api/v1/portal/common/sms"
SMS_VERIFY_URL = f"{BASE_URL}/api/v1/portal/common/sms/smsCrtfcTy"
REPORT_URL = f"{BASE_URL}/api/v1/portal/safereport/safereport"
IMESSAGE_DB = os.path.expanduser("~/Library/Messages/chat.db")
SMS_SENDER = "+8216007395"
CHUNK_SIZE = 1048576  # 1MB
FF = "\x0c"  # form feed
VT = "\x0b"  # vertical tab

REPORT_TYPES = {
    "1": ("02", "교통위반(고속도로 포함)"),
    "2": ("03", "이륜차 위반"),
    "3": ("10", "난폭/보복운전"),
    "4": ("04", "버스전용차로 위반(고속도로제외)"),
    "5": ("05", "번호판 규정 위반"),
    "6": ("06", "불법등화, 반사판(지) 가림·손상"),
    "7": ("07", "불법 튜닝, 해체, 조작"),
    "8": ("08", "기타 자동차 안전기준 위반"),
}

ALLOWED_EXTENSIONS = {
    "png", "jpg", "jpeg", "gif", "bmp",
    "mp4", "wmv", "avi", "asf", "flv", "mov",
    "mpeg", "mpg", "mkv", "3gp", "m4v",
}


# ── RAONKUpload 암호화 ────────────────────────────────
def raonk_encrypt(plaintext: str) -> str:
    b64 = base64.b64encode(plaintext.encode("utf-8")).decode("ascii")
    if len(b64) >= 10:
        def ins(s, pos, ch):
            return s[:pos] + ch + s[pos:]
        b64 = ins(b64, 8, "r")
        b64 = ins(b64, 6, "a")
        b64 = ins(b64, 9, "o")
        b64 = ins(b64, 7, "n")
        b64 = ins(b64, 8, "w")
        b64 = ins(b64, 6, "i")
        b64 = ins(b64, 9, "z")
    else:
        b64 = "$" + b64[:-1] + "$" + b64[-1:]
    return b64.replace("+", "%2B")


def raonk_decrypt(encrypted: str) -> str:
    s = encrypted.replace(" ", "").replace("\r", "").replace("\n", "")
    s = s.replace("%2B", "+")
    if len(s) >= 15:
        def rm(s, pos):
            return s[:pos] + s[pos + 1:]
        s = rm(s, 9)
        s = rm(s, 6)
        s = rm(s, 8)
        s = rm(s, 7)
        s = rm(s, 9)
        s = rm(s, 6)
        s = rm(s, 8)
    else:
        s = s.replace("#", "").replace("$", "")
    return base64.b64decode(s).decode("utf-8")


def parse_raonk(response_text: str) -> str:
    lower = response_text.lower()
    start = lower.find("<raonk>")
    if start >= 0:
        response_text = response_text[start + 7:]
    end = response_text.lower().find("</raonk>")
    if end >= 0:
        response_text = response_text[:end]
    return response_text


# ── 파일 업로드 ───────────────────────────────────────
def upload_file(session: requests.Session, filepath: str, index: int, is_last: bool):
    filename = os.path.basename(filepath)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"허용되지 않는 확장자: .{ext}")

    with open(filepath, "rb") as f:
        data = f.read()

    file_size = len(data)
    file_guid = uuid.uuid4().hex
    order = str(index) + ("z" if is_last else "")

    # 단계 1: preUpload (c01)
    params = (
        f"kc{FF}c01{VT}k01{FF}1{VT}k05{FF}0{VT}"
        f"k12{FF}{file_guid}{VT}k13{FF}{file_size}{VT}"
        f"k14{FF}{filename}{VT}k15{FF}{VT}k16{FF}{VT}k17{FF}{VT}"
        f"k20{FF}{order}{VT}k21{FF}"
    )
    body = f"k00={raonk_encrypt(params)}"
    resp = session.post(
        HANDLER_URL, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"},
    )
    result = parse_raonk(resp.text)
    if not result.startswith("[OK]"):
        raise RuntimeError(f"preUpload 실패: {result}")

    ok_data = raonk_decrypt(result.replace("[OK]", ""))
    # preUpload 응답은 VT(\x0b)로 구분됨: save_path\x0bfile_size\x0b-\x0b-
    parts = ok_data.split(VT)
    save_path = parts[0] if parts else ""
    if len(parts) >= 4 and parts[3] and parts[3] != "-":
        file_guid = parts[3]
    print(f"  [{index+1}] preUpload 완료 → {save_path}")

    # 단계 2: processUpload (c02) - 청크 전송
    total_chunks = max(1, (file_size + CHUNK_SIZE - 1) // CHUNK_SIZE)
    for ci in range(total_chunks):
        if file_size == 0:
            break
        start_pos = ci * CHUNK_SIZE
        chunk = data[start_pos:start_pos + CHUNK_SIZE]
        chunk_params = (
            f"kc{FF}c02{VT}k01{FF}1{VT}k03{FF}0{VT}k05{FF}0{VT}"
            f"k12{FF}{file_guid}{VT}k19{FF}{start_pos}{VT}"
            f"k26{FF}{save_path}"
        )
        tag = f"urk_{int(time.time()*1000):x}{uuid.uuid4().hex[:20]}"
        resp = session.post(
            f"{HANDLER_URL}?raonk={tag}",
            data={"k00": raonk_encrypt(chunk_params)},
            files={"Slice": ("blob", chunk, "application/octet-stream")},
        )
        result = parse_raonk(resp.text)
        if result != "[OK]":
            raise RuntimeError(f"청크 {ci} 업로드 실패: {result}")
        print(f"  [{index+1}] 청크 {ci+1}/{total_chunks} 전송 완료")

    # 단계 3: endUpload (c03)
    end_cmd = "c03" if file_size > 0 else "c05"
    end_params = (
        f"kc{FF}{end_cmd}{VT}k01{FF}1{VT}"
        f"k12{FF}{file_guid}{VT}k14{FF}{filename}{VT}"
        f"k15{FF}{VT}k16{FF}{VT}k17{FF}{VT}"
        f"k20{FF}{order}{VT}k21{FF}"
    )
    body = f"k00={raonk_encrypt(end_params)}"
    resp = session.post(
        HANDLER_URL, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"},
    )
    result = parse_raonk(resp.text)
    if not result.startswith("[OK]"):
        raise RuntimeError(f"endUpload 실패: {result}")

    ok_data = raonk_decrypt(result.replace("[OK]", ""))
    ok_data = ok_data.strip().rstrip(FF)

    # endUpload 응답 파싱: VT 구분 또는 콜론 구분 형식 모두 지원
    rp = ok_data.split(VT)
    if len(rp) >= 3:
        upload_name = rp[1]
        origin_name = rp[2] if rp[2] else filename
        uploaded_size = rp[3] if len(rp) > 3 else str(file_size)
    elif ":" in ok_data:
        parts = ok_data.split(":", 1)
        origin_name = parts[0] if parts[0] else filename
        save_path_end = parts[1] if len(parts) > 1 else ""
        upload_name = save_path_end.rsplit("/", 1)[-1] if "/" in save_path_end else save_path_end
        uploaded_size = str(file_size)
    else:
        upload_name = ok_data
        origin_name = filename
        uploaded_size = str(file_size)
    print(f"  [{index+1}] 업로드 완료: {origin_name} ({uploaded_size} bytes)")

    return {"uploadName": upload_name, "originName": origin_name, "size": uploaded_size}


# ── iMessage 인증번호 읽기 ─────────────────────────────
def read_auth_code_from_imessage(timeout: int = 60) -> str:
    """iMessage DB를 폴링하여 안전신문고 인증번호를 읽어온다."""
    apple_epoch_offset = 978307200
    start = time.time()
    # 요청 시점 기준 (5초 전부터)
    cutoff_ns = int((start - apple_epoch_offset - 5) * 1_000_000_000)
    print(f"  iMessage에서 인증번호 대기 중... (최대 {timeout}초)")

    while time.time() - start < timeout:
        try:
            db = sqlite3.connect(f"file:{IMESSAGE_DB}?mode=ro", uri=True)
            db.execute("PRAGMA query_only = ON")
            rows = db.execute(
                """
                SELECT m.text, m.attributedBody, h.id
                FROM message m JOIN handle h ON m.handle_id = h.rowid
                WHERE m.date > ? ORDER BY m.date DESC LIMIT 5
                """,
                (cutoff_ns,),
            ).fetchall()
            db.close()

            for text, blob, handle in rows:
                msg = text
                if not msg and blob:
                    try:
                        t = blob.split(b"NSString")[1][5:]
                        idx = t.find(b"NSDictionary")
                        if idx > 0:
                            t = t[:idx]
                        msg = re.sub(r"[\x00-\x08\x0b-\x1f]", "", t.decode("utf-8", errors="ignore")).strip()
                    except Exception:
                        continue

                if not msg:
                    continue

                # 안전신문고 인증번호 패턴 매칭
                if "안전신문고" in msg or handle == SMS_SENDER:
                    m = re.search(r"\[(\d{6})\]", msg)
                    if m:
                        return m.group(1)
        except Exception:
            pass

        time.sleep(2)

    return ""


# ── Kakao API 키 ─────────────────────────────────────
KAKAO_KEY = "KakaoAK 713333cce4ca0c844875ed03dcf5ea31"
KAKAO_KA = "sdk/1.39.6 os/javascript lang/ko-KR device/MacIntel origin/https%3A%2F%2Fwww.safetyreport.go.kr"


# ── 사진 EXIF GPS 추출 ────────────────────────────────
def extract_gps_from_exif(filepath: str) -> tuple[float, float] | None:
    """사진 파일의 EXIF GPS 정보에서 위도/경도를 추출한다."""
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS, GPSTAGS
    except ImportError:
        return None

    try:
        img = Image.open(filepath)
        exif_data = img._getexif()
        if not exif_data:
            return None

        gps_info = {}
        for tag_id, value in exif_data.items():
            if TAGS.get(tag_id) == "GPSInfo":
                for gps_tag_id, gps_value in value.items():
                    gps_info[GPSTAGS.get(gps_tag_id, gps_tag_id)] = gps_value

        if not gps_info or "GPSLatitude" not in gps_info:
            return None

        def dms_to_decimal(dms, ref):
            d, m, s = [float(x) for x in dms]
            decimal = d + m / 60 + s / 3600
            if ref in ("S", "W"):
                decimal = -decimal
            return decimal

        lat = dms_to_decimal(gps_info["GPSLatitude"], gps_info.get("GPSLatitudeRef", "N"))
        lng = dms_to_decimal(gps_info["GPSLongitude"], gps_info.get("GPSLongitudeRef", "E"))
        return (lat, lng)
    except Exception:
        return None


def extract_datetime_from_exif(filepath: str) -> tuple[str, str] | None:
    """사진 파일의 EXIF에서 촬영 일시를 추출한다. (date, time) 튜플 반환."""
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS
    except ImportError:
        return None

    try:
        img = Image.open(filepath)
        exif_data = img._getexif()
        if not exif_data:
            return None

        for tag_id, value in exif_data.items():
            tag = TAGS.get(tag_id)
            if tag == "DateTimeOriginal" or tag == "DateTimeDigitized":
                # EXIF 형식: "2026:02:23 13:16:00"
                dt = datetime.strptime(value, "%Y:%m:%d %H:%M:%S")
                return (dt.strftime("%Y.%m.%d."), dt.strftime("%H:%M"))
        return None
    except Exception:
        return None


def reverse_geocode(lat: float, lng: float) -> dict | None:
    """좌표를 Kakao API로 도로명/지번 주소로 변환한다."""
    headers = {"Authorization": KAKAO_KEY, "KA": KAKAO_KA}
    resp = requests.get(
        "https://dapi.kakao.com/v2/local/geo/coord2address.json",
        params={"x": str(lng), "y": str(lat)},
        headers=headers,
    )
    if resp.status_code == 200 and resp.json().get("documents"):
        d = resp.json()["documents"][0]
        road = d.get("road_address") or {}
        jibun = d.get("address") or {}
        return {
            "lat": str(lat),
            "lng": str(lng),
            "road_address": road.get("address_name", ""),
            "jibun_address": jibun.get("address_name", ""),
            "zip_code": road.get("zone_no", ""),
        }
    return None


# ── 지도 이미지 URL 생성 (Kakao transcoord API) ──────
def build_map_image_url(lat: str, lng: str) -> str:
    """WGS84 좌표를 CONGNAMUL로 변환하여 Kakao Map 정적 이미지 URL을 생성한다."""
    headers = {"Authorization": KAKAO_KEY, "KA": KAKAO_KA}
    try:
        resp = requests.get(
            "https://dapi.kakao.com/v2/local/geo/transcoord.json",
            params={"x": lng, "y": lat, "input_coord": "WGS84", "output_coord": "WCONGNAMUL"},
            headers=headers,
        )
        if resp.status_code == 200:
            docs = resp.json().get("documents", [])
            if docs:
                mx = round(docs[0]["x"])
                my = round(docs[0]["y"])
                return (
                    f"http://map2.daum.net/map/imageservice?"
                    f"IW=704&IH=321&MX={mx}&MY={my}&SCALE=2.5"
                    f"&CX={mx}&CY={my}&service=open"
                )
    except Exception:
        pass
    return ""


# ── 주소 → 좌표 변환 (Kakao API) ─────────────────────


def geocode_address(address: str) -> dict | None:
    """Kakao Local API로 주소를 좌표, 도로명/지번 주소로 변환한다."""
    headers = {"Authorization": KAKAO_KEY, "KA": KAKAO_KA}

    # 1) keyword 검색으로 좌표 얻기
    resp = requests.get(
        "https://dapi.kakao.com/v2/local/search/keyword.json",
        params={"query": address, "size": 1},
        headers=headers,
    )
    if resp.status_code != 200 or not resp.json().get("documents"):
        return None

    doc = resp.json()["documents"][0]
    x, y = doc["x"], doc["y"]

    # 2) 좌표 → 정확한 도로명/지번 역변환
    resp2 = requests.get(
        "https://dapi.kakao.com/v2/local/geo/coord2address.json",
        params={"x": x, "y": y},
        headers=headers,
    )
    road_addr = address
    jibun_addr = address
    zip_code = ""
    if resp2.status_code == 200 and resp2.json().get("documents"):
        d2 = resp2.json()["documents"][0]
        road = d2.get("road_address") or {}
        jibun = d2.get("address") or {}
        road_addr = road.get("address_name") or doc.get("road_address_name") or address
        jibun_addr = jibun.get("address_name") or doc.get("address_name") or address
        zip_code = road.get("zone_no", "")

    return {
        "lat": y,
        "lng": x,
        "road_address": road_addr,
        "jibun_address": jibun_addr,
        "zip_code": zip_code,
    }


# ── 메인 신고 흐름 ────────────────────────────────────
def submit_report(args):
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Referer": f"{BASE_URL}/",
        "Origin": BASE_URL,
        "X-Requested-With": "XMLHttpRequest",
    })

    # 1. 세션 초기화 (JSESSIONID 확보 + safepeople.visitr 쿠키 + pageview 호출)
    print("[1/6] 세션 초기화...")
    session.get(f"{BASE_URL}/")
    session.get(HANDLER_URL)
    # safepeople.visitr 쿠키 설정 (브라우저 JS가 생성하는 세션키)
    now_str = datetime.now().strftime("%Y%m%d%H%M%S")
    rand_digits = "".join([str(random.randint(0,9)) for _ in range(16)])
    visitr_key = now_str + rand_digits
    session.cookies.set("safepeople.visitr",
                        f'{{"sesionKey":"{visitr_key}"}}',
                        domain="www.safetyreport.go.kr", path="/")
    # pageview API 호출 (서버 세션 상태 초기화)
    session.post(f"{BASE_URL}/api/v1/common/pageview",
                 data="viewUrl=%2Fsafereport%2Fsafereport3&realUrl=%2Fsafereport%2FsafeReport3&pageViewSe=list&globals=&inflowCours=1",
                 headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"})

    # 2. 파일 업로드
    stored_names = []
    real_names = []
    if args.files:
        print(f"[2/6] 파일 업로드 ({len(args.files)}개)...")
        for i, fpath in enumerate(args.files):
            fpath = os.path.expanduser(fpath)
            if not os.path.exists(fpath):
                print(f"  파일을 찾을 수 없음: {fpath}", file=sys.stderr)
                sys.exit(1)
            is_last = (i == len(args.files) - 1)
            result = upload_file(session, fpath, i, is_last)
            stored_names.append(result["uploadName"])
            real_names.append(result["originName"])
    else:
        print("[2/6] 첨부 파일 없음 (건너뜀)")

    # 3. 주소 → 좌표 변환
    geo = None
    if args.address:
        print(f"[3/6] 주소 변환: {args.address}")
        geo = geocode_address(args.address)

    # 주소가 없거나 변환 실패 시 첨부 사진 EXIF GPS에서 추출 시도
    if not geo and args.files:
        print("[3/6] 주소 미입력 → 사진 EXIF GPS 추출 시도...")
        for fpath in args.files:
            fpath = os.path.expanduser(fpath)
            coords = extract_gps_from_exif(fpath)
            if coords:
                lat, lng = coords
                print(f"  GPS 발견: ({lat:.6f}, {lng:.6f}) from {os.path.basename(fpath)}")
                geo = reverse_geocode(lat, lng)
                if geo:
                    break

    if not geo:
        print("  주소를 확인할 수 없습니다. -a 옵션으로 주소를 직접 입력하세요.", file=sys.stderr)
        sys.exit(1)
    road_addr = geo["road_address"] or args.address
    jibun_addr = geo["jibun_address"] or args.address
    print(f"  도로명: {road_addr}")
    print(f"  지번: {jibun_addr}")
    print(f"  좌표: ({geo['lat']}, {geo['lng']})")
    # 지도 이미지 URL 생성 (STTEMNT_IMAGE_URL)
    map_image_url = build_map_image_url(geo["lat"], geo["lng"])
    if map_image_url:
        print(f"  지도 이미지: {map_image_url[:60]}...")

    # 4. SMS 인증
    phone = args.phone
    print(f"[4/6] SMS 인증 요청 → {phone}")
    phone_bare = phone.replace("-", "")
    sms_resp = session.post(SMS_URL, data={
        "MOBLPHON_NO": phone_bare,
        "SMS_CRTFC_SE": "01",
        "SMS_CRTFC_TY": "01",
        "CRTFC_TYPE": "M",
    })
    sms_data = sms_resp.json()
    if sms_data.get("result") != "success":
        print(f"  SMS 발송 실패: {sms_data}", file=sys.stderr)
        sys.exit(1)

    sms_crtfc_id = sms_data.get("SMS_CRTFC_ID", "")
    print(f"  인증번호 발송 완료 (ID: {sms_crtfc_id})")

    # 5. iMessage에서 인증번호 자동 읽기
    print("[5/6] 인증번호 자동 읽기...")
    auth_code = read_auth_code_from_imessage(timeout=90)
    if not auth_code:
        print("  자동 읽기 실패. 수동 입력:", file=sys.stderr)
        auth_code = input("  인증번호 6자리: ").strip()

    if len(auth_code) != 6 or not auth_code.isdigit():
        print("  유효하지 않은 인증번호", file=sys.stderr)
        sys.exit(1)

    print(f"  인증번호: {auth_code}")

    # 인증번호 확인
    verify_resp = session.post(SMS_VERIFY_URL, data={
        "SMS_CRTFC_ID": sms_crtfc_id,
        "SMS_CRTFC_NO": auth_code,
        "SMS_CRTFC_TY": "01",
        "MOBLPHON_NO": phone_bare,
    })
    verify_data = verify_resp.json()
    if verify_data.get("result") != "success":
        print(f"  인증 실패: {verify_data}", file=sys.stderr)
        sys.exit(1)
    print("  인증 성공!")

    # 6. 신고서 제출
    print("[6/6] 신고서 제출 중...")

    report_code, report_label = REPORT_TYPES[args.type]
    c_files = "|".join(stored_names) if stored_names else ""
    c_r_files = "|".join(real_names) if real_names else ""
    file_count = len(stored_names)
    # C_FILES_VIEW: 웹사이트는 선행 "1|" + 파일슬롯 4개 = 총 5개 요소
    view_parts = ["1"]  # 선행 슬롯
    for i in range(4):
        view_parts.append("1" if i < file_count else "0")
    c_files_view = "|".join(view_parts)

    # C_R_FILES_TIME: 각 파일의 수정시간 (YYYY/MM/DD HH:MM:SS 형식)
    file_times = []
    if args.files:
        for fpath in args.files:
            fpath_exp = os.path.expanduser(fpath)
            mtime = os.path.getmtime(fpath_exp)
            dt = datetime.fromtimestamp(mtime)
            file_times.append(dt.strftime("%Y/%m/%d %H:%M:%S"))
    c_r_files_time = ""  # 브라우저에서도 빈 문자열로 전송

    # 발생일시 (미입력 시 사진 EXIF에서 추출, 그래도 없으면 현재 시간)
    exif_dt = None
    if (not args.date or not args.time) and args.files:
        for fpath in args.files:
            exif_dt = extract_datetime_from_exif(os.path.expanduser(fpath))
            if exif_dt:
                print(f"  EXIF 촬영일시: {exif_dt[0]} {exif_dt[1]} (from {os.path.basename(fpath)})")
                break

    if args.date:
        devel_date = args.date
    elif exif_dt:
        devel_date = exif_dt[0]
    else:
        devel_date = datetime.now().strftime("%Y.%m.%d.")

    if args.time:
        devel_time = args.time
    elif exif_dt:
        devel_time = exif_dt[1]
    else:
        devel_time = datetime.now().strftime("%H:%M")

    # 신고 내용 메시지 구성 (웹사이트 형식에 맞춤, CRLF 줄바꿈)
    # 브라우저에서는 C_A_CONTENTS에 메타데이터가 2번 반복됨
    NL = "\r\n"
    # 메타데이터 블록 (차량번호~접수경로 안내)
    meta = ""
    meta += f"* 차량번호 : {args.vehicle}{NL}"
    meta += f"* 발생일자 : {devel_date}{NL}"
    meta += f"* 발생시각 : {devel_time}{NL}"
    meta += f"* 위반장소 : {road_addr}{NL}{NL}"
    meta += f"* 안전신문고 신고파일(사진·동영상) 촬영시간 및 경로 안내 *{NL}"
    for i, ft in enumerate(file_times):
        meta += f"* ({i+1}/{len(file_times)}) G: {ft}{NL}"
    meta += f"* 발생지역 위도:{geo['lat']} 경도:{geo['lng']}{NL}"
    meta += f"* G:휴대폰(안전신문고 앱 제외) 또는 PC에 저장된 사진·동영상{NL}"
    meta += f"* C:안전신문고 앱으로 현장에서 촬영 후 바로 신고한 사진·동영상{NL}"
    meta += f"* S:안전신문고 앱으로 촬영 및 저장 후 신고한 사진·동영상{NL}"
    meta += f"* 안전신문고 앱으로 촬영한 사진은 촬영 일시가 자동으로 표기되고, 위·변조 방지기능을 탑재{NL}{NL}"
    meta += f"(( 신고인 개인정보 보호 안내 - 개인정보보호법 제 17조, 민원처리에 관한 법률 제7조 )){NL}"
    meta += f"* 신고인 정보 등 개인정보와 신고내용은 신고처리 및 관리 목적으로만 사용하여야 하며, 정보주체의 동의 없이 무단으로 제3자에게 제공할 수 없으니 처리기관에서는 개인정보 관리에 철저를 기해 주시기 바랍니다.{NL}{NL}"
    meta += f"(( 불법주정차, 교통위반, 불법자동차 신고 제도(처분 기준 및 근거법령 해석 등) 관련 문의 )){NL}"
    meta += f"* 과태료, 범칙금 부과 등 처분 : 각 지자체 및 경찰서{NL}"
    meta += f"* 6대 불법 주정차 : 행정안전부 예방안전제도과, 044-205-4504{NL}"
    meta += f"* 소방차전용구역 불법주차 : 소방청 화재대응조사과, 044-205-7473{NL}"
    meta += f"* 장애인전용구역 불법주차 : 보건복지부 장애인권익지원과, 044-202-3308{NL}"
    meta += f"* 친환경차 충전구역 불법주차 : 산업통상자원부 자동차과, 044-203-4325{NL}"
    meta += f"* 불법자동차 : 국토교통부 자동차운영보험과, 044-201-3861{NL}"
    meta += f"* 교통위반 : 경찰청 교통안전과, 02-3150-2852{NL}{NL}"
    meta += f"(( 신고 접수경로 안내 )){NL}"
    meta += f"본 신고는 안전신문고 포털의 자동차·교통위반 신고-{report_label} 메뉴로 접수된 신고입니다."

    # message = 원본 내용 + 메타데이터 1회 (ORGNL_C_A_CONTENTS 2번째 값)
    message = args.content + NL * 4 + meta
    # c_a_contents = 원본 내용 + 메타데이터 2회 (브라우저 동작 재현)
    c_a_contents = message + NL * 4 + meta

    # 폼 데이터를 튜플 리스트로 구성 (필드 순서 및 중복 키 지원)
    # 브라우저: serialize() 결과 + 끝에 ORGNL_C_A_CONTENTS(2개) + C_PHONE2 + C_TMPFLAG 추가
    form_data = [
        ("ReportTypeSelect", report_code),
        ("C_SSNPC_CD", "TV"),
        ("C_SSNPC_TYPE", report_code),
        ("SMS_CRTFC_ID", sms_crtfc_id),
        ("SMS_CRTFC_AT", "Y"),
        ("C_A_W", geo["lat"]),
        ("C_A_E", geo["lng"]),
        ("C_ZIP", geo["zip_code"]),
        ("C_ZIP_TYPE", "R"),
        ("RN_ADRES", road_addr),
        ("C_A_ADD1", ""),
        ("C_A_ADD2", jibun_addr),
        ("C_ADD1", ""),
        ("C_ADD2", ""),
        ("C_A_TITLE", args.title),
        ("C_A_CONTENTS", c_a_contents),
        ("VHRNO", args.vehicle.replace(" ", "")),
        ("noVhrNo", ""),
        ("DEVEL_DATE", devel_date),
        ("DEVEL_TIME", devel_time),
        ("DEVEL_TIME_HH", devel_time.split(":")[0]),
        ("DEVEL_TIME_MM", devel_time.split(":")[1] if ":" in devel_time else "00"),
        ("AUTH_NUMBER", auth_code),
        ("C_OPEN", "0"),
        ("D_OPEN", "1"),
        ("E_OPEN", "T10000"),
        ("instSearchWord", ""),
        ("C_GROUP_NAME", ""),
        ("C_A_ORG_NAME", ""),
        ("C_A_ORG", ""),
        ("C_CORONA", ""),
        ("C_CORONA_VAL", ""),
        ("C_FILES", c_files),
        ("C_FILES_VIEW", c_files_view),
        ("C_R_FILES", c_r_files),
        ("C_R_FILES_TIME", c_r_files_time),
        ("C_ID", phone_bare),
        ("INSTT_CODE", ""),
        ("SEHIGH_INSTT_CODE", ""),
        ("BEST_INSTT_CODE", ""),
        ("GRP_ENTRPRS_CODE", ""),
        ("C_RELATION2", "1"),
        ("C_RELATION3", ""),
        ("STTEMNT_IMAGE_URL", map_image_url),
        ("NFVNZ_CD", ""),
        ("SIDO_INSTT_CODE", ""),
        ("SIGUNGU_INSTT_CODE", ""),
        ("PROCESS_NTCN_YN", "Y"),
        ("C_TYPE", "0"),
        ("C_NAME", args.name or ""),
        ("C_EMAIL", ""),
        ("emailSelect", "선택하세요"),
        ("agreeUseMyInfo", "Y"),
        # 이하 필드는 브라우저에서 serialize() 이후 추가되는 필드들
        ("ORGNL_C_A_CONTENTS", args.content),       # 1st: 원본 내용만
        ("ORGNL_C_A_CONTENTS", message),             # 2nd: 원본 + 메타데이터
        ("C_PHONE2", phone),
        ("C_TMPFLAG", ""),
    ]

    # jQuery 3.0 호환 인코딩: 공백을 + 대신 %20으로 인코딩
    encoded_body = urllib.parse.urlencode(form_data, quote_via=urllib.parse.quote)

    resp = session.post(REPORT_URL, data=encoded_body,
                        headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"})

    result = resp.json()

    if result.get("result") == "success":
        sttemnt_no = result.get("STTEMNT_NO", "")
        print(f"\n  신고 접수 완료!")
        print(f"  접수번호: {sttemnt_no}")
        print(f"  유형: {report_label}")
        print(f"  차량번호: {args.vehicle}")
        print(f"  발생일시: {devel_date} {devel_time}")
        print(f"  장소: {road_addr}")
    else:
        print(f"\n  신고 실패: {json.dumps(result, ensure_ascii=False)}", file=sys.stderr)
        sys.exit(1)


# ── CLI ───────────────────────────────────────────────
def interactive_mode(phone: str | None = None):
    """대화형 모드로 신고 정보를 입력받는다."""
    print("=" * 55)
    print("  안전신문고 자동차/교통위반 신고 CLI")
    print("=" * 55)
    print()

    # 신고 유형
    print("신고 유형:")
    for k, (_, label) in REPORT_TYPES.items():
        print(f"  {k}. {label}")
    report_type = input("\n유형 번호 [1]: ").strip() or "1"
    if report_type not in REPORT_TYPES:
        print("유효하지 않은 유형", file=sys.stderr)
        sys.exit(1)

    # 차량번호
    vehicle = input("차량번호 (예: 12가3456): ").strip()
    if not vehicle:
        print("차량번호는 필수입니다.", file=sys.stderr)
        sys.exit(1)

    # 발생 일시
    now = datetime.now()
    date_default = now.strftime("%Y.%m.%d.")
    time_default = now.strftime("%H:%M")
    date_input = input(f"발생일자 [{date_default}]: ").strip() or date_default
    time_input = input(f"발생시각 [{time_default}]: ").strip() or time_default

    # 주소
    address = input("발생장소 (주소, 비우면 사진 EXIF에서 추출): ").strip()

    # 제목/내용
    title = input("제목: ").strip()
    if not title:
        _, label = REPORT_TYPES[report_type]
        title = f"{label} 신고 - {vehicle}"

    content = input("신고내용: ").strip()
    if not content:
        content = title

    # 첨부파일
    files_input = input("첨부파일 (쉼표 구분, 최대 4개): ").strip()
    files = [f.strip() for f in files_input.split(",") if f.strip()] if files_input else []

    # 휴대전화
    if not phone:
        phone = input("휴대전화번호 (예: 010-1234-5678): ").strip()
    if not phone:
        print("휴대전화번호는 필수입니다.", file=sys.stderr)
        sys.exit(1)

    # 이름 (선택)
    name = input("신고인 이름 (선택): ").strip()

    # 확인
    _, label = REPORT_TYPES[report_type]
    print(f"\n{'─' * 45}")
    print(f"  유형:     {label}")
    print(f"  차량번호: {vehicle}")
    print(f"  일시:     {date_input} {time_input}")
    print(f"  장소:     {address}")
    print(f"  제목:     {title}")
    print(f"  내용:     {content[:50]}{'...' if len(content) > 50 else ''}")
    print(f"  파일:     {len(files)}개")
    print(f"  전화번호: {phone}")
    print(f"  이름:     {name or '(미입력)'}")
    print(f"{'─' * 45}")

    confirm = input("\n위 내용으로 신고하시겠습니까? [y/N]: ").strip().lower()
    if confirm != "y":
        print("취소됨.")
        sys.exit(0)

    # argparse Namespace 생성
    args = argparse.Namespace(
        type=report_type,
        vehicle=vehicle,
        date=date_input,
        time=time_input,
        address=address,
        title=title,
        content=content,
        files=files,
        phone=phone,
        name=name,
    )
    submit_report(args)


def main():
    parser = argparse.ArgumentParser(
        description="안전신문고 자동차/교통위반 신고 CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
신고 유형:
  1  교통위반(고속도로 포함)     5  번호판 규정 위반
  2  이륜차 위반                 6  불법등화, 반사판(지) 가림·손상
  3  난폭/보복운전               7  불법 튜닝, 해체, 조작
  4  버스전용차로 위반           8  기타 자동차 안전기준 위반

사용 예시:
  %(prog)s -p 010-1234-5678 -t 1 -v 12가3456 -a "서울시 강남구 테헤란로 1" \\
           --title "신호위반" --content "적색신호 직진" -f photo1.jpg photo2.jpg

  # 주소 생략 시 사진 EXIF GPS에서 자동 추출
  %(prog)s -p 010-1234-5678 -v 12가3456 --title "신호위반" -f photo.jpg

  %(prog)s   (대화형 모드)
""",
    )
    parser.add_argument("-t", "--type", choices=list(REPORT_TYPES.keys()),
                        help="신고 유형 번호 (1-8)")
    parser.add_argument("-v", "--vehicle", help="차량번호")
    parser.add_argument("-a", "--address",
                        help="발생장소 (주소, 생략 시 사진 EXIF GPS에서 추출)")
    parser.add_argument("--title", help="신고 제목")
    parser.add_argument("--content", help="신고 내용")
    parser.add_argument("-d", "--date", help="발생일자 (YYYY.MM.DD.)")
    parser.add_argument("--time", help="발생시각 (HH:MM)")
    parser.add_argument("-f", "--files", nargs="+", help="첨부 파일 경로 (최대 4개)")
    parser.add_argument("-p", "--phone",
                        help="휴대전화번호 (예: 010-1234-5678)")
    parser.add_argument("-n", "--name", help="신고인 이름 (선택)")

    args = parser.parse_args()

    # 필수 인자가 없으면 대화형 모드
    if not args.vehicle:
        interactive_mode(args.phone)
        return

    # phone 필수
    if not args.phone:
        print("휴대전화번호(-p)는 필수입니다.", file=sys.stderr)
        sys.exit(1)

    # 기본값 설정
    if not args.type:
        args.type = "1"
    if not args.title:
        _, label = REPORT_TYPES[args.type]
        args.title = f"{label} 신고 - {args.vehicle}"
    if not args.content:
        args.content = args.title

    submit_report(args)


if __name__ == "__main__":
    main()
