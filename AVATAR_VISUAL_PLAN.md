# AVATAR VISUAL PLAN — 배경제거 → 사이즈 fit → 3D 회전

> 목표: Studio/Mirror 마네킹의 "배경 포함 엉성한 사진 카드" 문제를 근본부터 해결.
> 사용자 지정 순서: **1) 배경제거 → 2) 발 사이즈 정확 fit → 3) 3D 아바타 앞뒤 회전.**
> 이 순서는 의존 관계상 필수다 — cutout 없이는 fit도 3D도 품질이 안 나온다.
>
> 실행 방식: 각 스텝을 **파이프라인 사이클**(구현→게이트→Codex 검수→수정≤1회→리포트,
> POLICY.md 잠정 정책)로 투입한다. MASTER_SCOPE_ROADMAP.md의 Scope 2 백로그를
> 이 문서의 3단계로 재편한다(사용자 지정 완료 = 기존 백로그 5번 채움).

---

## §0. 작업 규칙 (공통)

- 브랜치: 이 작업용 브랜치에서 (pipeline-run-1 병합/push 정리 후 분기 권장).
  main 직접 커밋 금지.
- 게이트 > 모델: npm test/typecheck/lint(+build), Node 20 강제
  (`export PATH="/opt/homebrew/opt/node@20/bin:$PATH"`).
- **backend/ 는 기본 동결.** 단 스텝 1b는 예외 — 🔶 사용자 결정으로만 해동.
- 재구현 금지: cutout·garmentLayout·proxy3d 기존 자산을 grep으로 확인 후 재사용.
- 정직성: cutout은 휴리스틱이다. 품질 한계 카피(Lab의 honest limits 톤)를
  스튜디오 쪽에도 유지. 완벽한 제거를 단정하는 UI 금지.

---

## §현재 자산 (재사용 대상 — 다시 만들지 말 것)

| 자산 | 위치/출처 | 이 계획에서의 역할 |
|---|---|---|
| 로컬 cutout (edge flood fill) | B3.6/B3.8, Proxy 3D Lab 흐름 ("Create cutout first" 버튼) | 스텝 1a의 몸통 — Lab 전용을 전역 승격 |
| Cutout Tuning 슬라이더 | tolerance/uniformity gate, Lab | 1a에서 재사용(필요 시 아이템 단위 저장) |
| 2.5D 레이어 시스템 | Phase 5 `garmentLayout` `getLayerZIndex`, Studio "2.5D layered preview" | 스텝 2 fit의 기반 |
| 절차적 마네킹 GLB | B4b `backend/app/pipeline/mannequin.py` (pytest green) | 스텝 3의 아바타 몸체 |
| 옷 합성 fitter | B5 `fitter.py` (bbox 합성) | 스텝 3의 옷 부착 |
| jobs API + T3 배선 일부 | B4a + T3 스텝1~2(커밋), 스텝4(stash `wip`) | 스텝 3의 프론트 연결 |
| 파이프라인 하네스 | pipeline/ (run-gate, codex-review, POLICY.md) | 모든 스텝의 실행 수단 |

핵심 통찰: **스텝 1의 cutout이 Phase D 재개 조건("사진→옷 GLB 소스")의 답이다.**
투명 PNG → proxy GLB 경로가 이미 존재하므로, 1→2를 거치면 3의 선행조건이 채워진다.

---

# 스텝 1 — 배경제거

## 1a. 기존 cutout을 Studio/Mirror 경로에 승격 `[연결, 신규 아님]`
**문제:** cutout이 Proxy 3D Lab에만 물려 있어, 마네킹/거울/랙에는 배경 포함
원본 사진 카드가 뜬다.
**목표:** 업로드(또는 아이템 단위)에서 cutout을 생성·저장하고, Studio 마네킹·
Mirror·Clothing Rack이 cutout 버전을 사용하게 한다.

**작업:**
1. cutout 로직의 실제 위치를 grep으로 확정 (Lab 컴포넌트에 박혀 있으면
   `src/lib/`로 추출 — 로직 변경 없이 이동만).
2. 아이템에 cutout 결과 저장 (원본은 보존 — 아카이브 카드/룩북은 원본 유지,
   마네킹 계열만 cutout 사용. 데이터는 additive 필드로).
3. Studio/Mirror/Rack 렌더가 cutout 있으면 cutout, 없으면 기존 동작(원본) —
   하위호환 유지 (marketValueHistory 때와 같은 원칙: 옛 아이템 안 깨짐).
4. cutout 실패/저품질 대비: 원본 폴백 + 정직 카피.

**완료 기준:** 신발 아이템이 마네킹/거울에 배경 없이 뜨거나, cutout 실패 시
원본+정직 카피로 폴백. 옛 아이템 무손상. 게이트 green.
**커밋:** `feat(studio): promote cutout to mannequin/mirror rendering`

> **🚩 1a 종료 = 사용자 품질 판정.** dev에서 실제 신발 사진(콘크리트 배경 —
> 어려운 케이스)으로 cutout 품질 확인. 판정:
> - 충분함 → 1b 스킵, 스텝 2로
> - 부족함 → 🔶 1b 결정

## 1b. (조건부) 배경제거 모델 업그레이드 `[🔶 backend 해동 결정 필요]`
**전제:** 1a 품질이 부족하고, 사용자가 backend/ 동결 해제를 명시 승인한 경우만.
**목표:** FastAPI 백엔드에 ML 배경제거(rembg/U2Net 계열) 엔드포인트 추가,
프론트 cutout이 env-gated로 이를 우선 사용(미설정/실패 시 1a 휴리스틱 폴백).

**작업:** backend 의존성 추가 → `/api/cutout` 엔드포인트 + pytest →
프론트 env-gate 분기(mock-default 패턴 그대로) → 폴백 체인:
ML → 휴리스틱 → 원본.
**완료 기준:** env on: ML cutout / off: 기존 동작·네트워크 0. backend pytest green.
**커밋:** `feat(cutout): ML background removal behind env gate`

---

# 스텝 2 — 발 사이즈 정확 fit (2.5D)

**문제:** cutout이 돼도 신발이 마네킹 발 위치·크기에 안 맞으면 여전히 엉성하다.
**목표:** 마네킹 슬롯(신발/상의/하의/아우터/액세서리)별 **앵커 좌표 + 스케일
규칙**을 정의하고, cutout 이미지가 슬롯에 맞게 배치·크기조정되게 한다.

**작업:**
1. `garmentLayout` 확장: 슬롯별 앵커(발 영역 등) + 대상 폭/높이 비율 정의.
   신발부터 (사용자 지정 우선순위), 다른 슬롯은 같은 구조로 확장 가능하게.
2. cutout의 실제 콘텐츠 bounding box 계산(투명 여백 제외) → 슬롯 크기에 맞춤.
3. Studio 마네킹·Mirror 양쪽 동일 규칙 적용 (지금 두 화면이 같은 배치를
   복제하므로 규칙은 한 곳에).
4. 수동 미세조정 여지: B3.8의 수동 정렬 패턴 참고, 과설계 금지 — 자동 fit이
   우선, 수동은 후속.

**완료 기준:** 신발이 마네킹 발 영역에 자연스러운 크기/위치로 렌더. 다른
슬롯 회귀 없음. 게이트 green.
**커밋:** `feat(studio): slot-anchored sizing for mannequin fit`

> **🚩 2 종료 = 사용자 시각 판정** (jsdom은 레이아웃을 못 본다 — 스크린샷/dev 확인 필수).

---

# 스텝 3 — 3D 아바타 앞뒤 회전 (Phase D 재개)

**전제 확인:** 재개 조건 "사진→옷 GLB 소스" = 스텝 1의 cutout 경로로 충족.
**목표:** 마네킹 GLB(B4b) + 옷 proxy GLB(cutout→proxy3d) 합성(B5 fitter)을
프론트에서 회전 가능한 3D 뷰로 — 앞/뒤 모두 확인 가능하게.

**작업:**
1. T3 스텝4 stash 복원·검토 (`git stash list`로 확인, 오래됐으면 rebase).
2. jobs API 배선 완성: body(마네킹) + outfit(cutout 기반 GLB) 제출 →
   폴링 → result.glb → 기존 GlbViewer(OrbitControls류 회전) 렌더.
   ※ 계약은 T3_JOBS_WIRING_PLAN.md §계약 그대로 (queued/processing/done/failed,
   /result.glb 바이너리).
3. 앞뒤 텍스처: B3.7 듀얼 이미지 경로 재사용 (뒷면 사진 optional).
4. 정직 카피: proxy 근사임을 표시 (result.glb에 메타 없음 이슈 — T3 문서 참조).

**완료 기준:** 옷장 아이템 → 3D 마네킹 착용 뷰 → 마우스로 회전해 앞뒤 확인.
backend pytest + 프론트 게이트 전부 green.
**커밋:** 여러 개 (배선/합성/회전 단위) — 파이프라인 사이클별.

> ⚠️ 스텝 3은 이 계획에서 가장 크다. 1·2 완료 후 별도 세부 plan으로 쪼개서
> 진입하는 것을 권장 (T3 문서 업데이트 형태).

---

## §순서 요약
**1a(cutout 승격) → 🚩품질판정 → [1b ML 업그레이드(조건부·🔶backend 해동)] →
2(발 fit) → 🚩시각판정 → 3(3D 회전, 별도 세부 plan)**

## §진행 체크
- [ ] 선행: pipeline-run-1 push + main 병합 정리
- [ ] 1a — cutout 승격  → **🚩 품질 판정**
- [ ] 🔶 1b 여부 결정 (backend 해동)
- [ ] (조건부) 1b — ML 배경제거
- [ ] 2 — 발 사이즈 fit  → **🚩 시각 판정**
- [ ] 3 — 3D 회전 (별도 세부 plan으로 진입)
