> **Historical document — not current implementation status.**
> Kept for the reasoning it records. It was accurate when written and has not
> been maintained since. For what the repository actually contains today, see
> [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md).

---

# MASTER SCOPE ROADMAP

> 원칙: 한 번에 한 scope. Scope 1(파이프라인)이 서야 Scope 2(옷장 UI)가 그 위에서
> 돌아간다. Scope 3은 의도적 보류 — 꺼내려면 명시적 결정 필요.
> 관련 문서: DUAL_AGENT_PIPELINE_PLAN.md(파이프라인 상세), WARDROBE_FLOW_PLAN.md(옷장 이력)

---

## Scope 0 — 선행 준비물 (전부 사용자 몫, 지금)

- [ ] OpenAI API 키 발급 완료 + 파이프라인 repo `.env`에 저장
- [ ] Claude CLI non-interactive 실행 명령 형식 확인
- [ ] `jq`/`curl` 설치 확인
- [ ] 파이프라인 전용 repo 생성 (옷장 repo와 분리)

**이게 안 끝나면 Scope 1 착수 불가.**

---

## Scope 1 — 파이프라인 하네스 + 에이전트 ★지금 만들 것

> = DUAL_AGENT_PIPELINE_PLAN.md의 Phase 1~2. 여기서 "하네스"는 사이클 스크립트
> 자체를 말한다. **Hermes는 하네스가 아니라 Phase 4의 배관 위임** — 순서 뒤집기 금지.

### 1.1 벌거벗은 사이클 스크립트 (하네스 뼈대)
- Claude 구현 → 객관적 게이트(먼저) → Codex 검수(Do NOT rewrite) → 관찰 리포트
- 자동 판정 0줄. §0 절대 원칙(게이트>모델, 검수자 불수정) 준수.
- 커밋: `feat(pipeline): bare observation cycle script`

### 1.2 관찰 라운드 — ★옷장 UI 소작업을 관찰 task로 사용
- 장난감 task 대신 **Scope 2 백로그에서 가장 작은 항목**을 task.md로 사용.
  (예: 빈 시세 상태 안내 문구 한 줄 추가 수준)
- 조건: 관찰 task는 "작고 결과 명확"해야 함. 백로그 중 큰 항목(UX 재설계 등)은
  관찰용으로 쓰지 말 것 — 그건 파이프라인 검증 후.
- 3~5회 실행, observations.md에 누적. 최소 1회는 게이트가 깨질 만한 task 포함.
- **🚩 종료 후 멈춤** — 관찰 결과로 사용자와 정책 설계.

### 1.3 검수 루프 정책 (에이전트 역할 확정)
- 🔶 사용자 결정: 종료 조건(최대 N회) / 충돌 해소 규칙 / severity 처리
- 구현: 루프 + 최대 회수 강제 + 게이트 우선 유지
- 이 시점에서 "에이전트"의 정의 완성: 구현자(Claude) / 검수자(Codex) / 판정(정책 코드)

### 1.4 이후 (별도 착수 결정): Discord 단방향 → Hermes 이식 → 폰 양방향
- DUAL_AGENT plan Phase 3~5 그대로. Scope 1 완료 조건엔 미포함.

**Scope 1 완료 기준: 정책 루프까지 돌고, 옷장 소작업 1개가 파이프라인으로
구현→검수→게이트 통과된 실적 1건.**

---

## Scope 2 — 옷장 UI/기능 완성 (파이프라인의 진짜 워크로드)

> Scope 1 완료 후, 이 백로그를 파이프라인에 하나씩 투입한다.
> ⚠️ 시세 *자동갱신*(eBay)은 여기 없음 — Scope 3 보류함.

### 백로그 (작은 것 → 큰 것 순, 대화에서 확정된 것들)
1. **빈 시세 상태 안내** — 값 미기록 아이템에 "record 하세요" 안내 (발견성)
   ※ 가장 작음 → 1.2 관찰 task 후보 1순위
2. **Record value 트랜잭셔널 여부** — 🔶 사용자 UX 결정 선행: 현행 즉시커밋
   (append-only, Cancel 불가) 유지 vs 모달 확정 시점 커밋으로 변경
3. **시세 블록 발견성** — Closet 카드(GarmentCard)에도 시세 노출할지.
   현행: Details 모달/Lookbook만 (설계상 정상이었으나 사용자 직관과 어긋났음)
4. **Polish 라운드 2** — 사용자가 "허접"하다고 느끼는 화면 목록화 후 CSS-only.
   🔶 선행: 사용자가 dev에서 화면 보고 대상 지정 (마네킹 룸은 여전히 제외)
5. **기타 기능 갭** — 🔶 사용자가 "완전치 않다"고 느끼는 기능 목록화 필요.
   (현재 문서화된 것 외 추가 항목은 사용자 지정)

### 규칙
- 각 백로그 항목 = 파이프라인 1사이클(또는 수 사이클) 단위로 투입
- 옷장 불변규칙 유지: mock 기본, 정직성 카피, 순수 reducer, backend/ 무수정
- Node 20 강제 (.nvmrc 또는 engines — 아직 안 박았으면 Scope 2 첫 커밋으로)

---

## Scope 3 — 보류함 (명시적 결정 없이 꺼내지 않음)

| 항목 | 상태 | 재개 조건 |
|---|---|---|
| 시세 자동갱신 (eBay 호가 기반) | 코드 C3까지 완료, 키만 대기 | 사용자가 eBay 키 발급 완료 시 |
| 3D 월드 (Phase D) | 백엔드 green·stash 보존 | "사진→옷 GLB" 소스 결정 시 |
| Vibe-Trading / AFL 모델 | 북마크만 | Scope 1 완료 + 별도 프로젝트로 |

---

## 순서 요약
**Scope 0(준비물) → Scope 1(하네스+에이전트, 옷장 소작업으로 관찰) →
Scope 2(옷장 백로그를 파이프라인으로) → Scope 3(각 재개 조건 충족 시)**

핵심 통합: 옷장의 미완 UI가 파이프라인의 워크로드가 된다. 두 프로젝트가
경쟁하는 게 아니라 하나가 다른 하나의 연료.
