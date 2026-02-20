# Chrome DevTools MCP 트러블슈팅

## "The browser is already running" 오류 자동 복구

이전 세션의 Chrome/MCP 프로세스가 남아있는 경우 발생. 아래 순서로 자동 복구 시도:

```bash
# 1단계: 이전 Chrome DevTools MCP의 Chrome 프로세스만 종료
#   (chrome-profile 디렉토리를 사용하는 Chrome 프로세스 식별)
ps aux | grep 'chrome.*chrome-devtools-mcp/chrome-profile' | grep -v grep | awk '{print $2}' | xargs kill 2>/dev/null

# 2단계: 이전 MCP 노드 프로세스 종료 (현재 세션의 MCP는 유지)
#   (현재 MCP의 PID를 제외하고, 오래된 MCP 프로세스만 종료)
ps aux | grep 'chrome-devtools-mcp' | grep -v grep
#   → 여러 개가 보이면, 시작 시간이 오래된 프로세스들의 PID를 kill

# 3단계: 2~3초 대기 후 list_pages 재시도
sleep 3
list_pages
```

## 자동 복구 실패 시 사용자 안내 메시지

```
⚠️ Chrome DevTools MCP를 사용할 수 없어 플레이스 수집 스킬을 실행할 수 없습니다.

이 스킬은 네이버 플레이스 실시간 데이터를 기반으로 동작합니다.
MCP가 없으면 데이터 수집/검증을 수행할 수 없습니다.

[해결 방법]

• 터미널에서 아래 명령어로 모든 관련 프로세스를 종료하세요:
  ps aux | grep 'chrome.*chrome-devtools-mcp/chrome-profile' | grep -v grep | awk '{print $2}' | xargs kill
  pkill -f "chrome-devtools-mcp"

• 그 후 Claude Code를 재시작하세요.

• Chrome DevTools MCP 서버가 설정되어 있지 않은 경우:
  /settings → MCP Servers에서 chrome-devtools MCP를 추가하세요.
```
