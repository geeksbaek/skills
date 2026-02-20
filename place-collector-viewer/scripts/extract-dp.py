#!/usr/bin/env python3
"""MCP 임시파일에서 __dp__ JSON을 추출하고 줄 종결자를 정리하여 저장한다.

Usage:
    python3 extract-dp.py <mcp_temp_file> <output_path>

Example:
    python3 scripts/extract-dp.py /tmp/mcp-output-abc123.json ~/Downloads/place-collector-viewer/dp-광교-2026-02-21.json
"""

import json
import re
import sys


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <mcp_temp_file> <output_path>", file=sys.stderr)
        sys.exit(1)

    mcp_path = sys.argv[1]
    output_path = sys.argv[2]

    # 1. MCP 임시파일 읽기
    try:
        with open(mcp_path, "r") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: file not found: {mcp_path}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: invalid JSON in {mcp_path}: {e}", file=sys.stderr)
        sys.exit(1)

    # 2. text 필드에서 JSON 추출
    text = data[0]["text"] if isinstance(data, list) and data else ""

    # 마크다운 코드블록에서 JSON 추출 시도
    match = re.search(r"```json\n(.*?)\n```", text, re.DOTALL)
    if match:
        raw_json = match.group(1)
    else:
        # fallback: text 전체를 JSON으로 파싱 시도
        raw_json = text

    # 3. JSON 파싱 검증
    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError as e:
        print(f"Error: failed to parse extracted JSON: {e}", file=sys.stderr)
        sys.exit(1)

    # 4. 줄 종결자 정리 (U+2028 LS, U+2029 PS → 공백)
    cleaned = json.dumps(parsed, ensure_ascii=False)
    cleaned_count = cleaned.count("\u2028") + cleaned.count("\u2029")
    cleaned = cleaned.replace("\u2028", " ").replace("\u2029", " ")

    # 5. 출력 파일 저장
    with open(output_path, "w") as f:
        f.write(cleaned)

    # 6. 요약 출력
    places = len(parsed) if isinstance(parsed, dict) else 0
    print(json.dumps({"places": places, "cleaned_chars": cleaned_count, "output": output_path}, ensure_ascii=False))


if __name__ == "__main__":
    main()
