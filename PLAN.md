# The Archive — "산 옷 정확하게 올리기" 실행 Plan

> 목표: 사용자가 **실제로 산 옷**을 정확한 메타데이터(소재·사이즈·가격·브랜드 등)와
> 함께 아카이브할 수 있게 만든다.
> 핵심 원칙: **정확도의 진짜 소스는 사진이 아니라 구매 정보다.** 그래서 데이터 모델 →
> 구매정보 입력(URL/수동) → 비전 보조 순으로 간다.

## 실행 규칙 (매 Phase 공통)
1. 해당 Phase의 프롬프트를 Claude Code에 붙여 실행.
2. 끝나면 반드시 `npm run typecheck && npm test` 둘 다 green 확인.
3. honesty 테스트(UPLOAD_COPY / FORBIDDEN_CLAIM_TERMS)는 절대 깨지면 안 됨.
4. green이면 커밋(`feat:`/`refactor:` 등) 후 다음 Phase로.
5. Phase 1만 순수 프론트(아키텍처 결정 불필요). Phase 2가 갈림길.

---

## Phase 1 — 데이터 모델 필드 + confidence/source 보존  ✅ 완료 (프론트 only)

**왜 먼저:** 분류기든 URL prefill이든 결과를 *써넣을 칸*이 필요하다. 지금 `GarmentItem`엔
material·size·price가 통째로 없어서 이게 최대 병목. 이 Phase 하나만으로도 "수동 정밀 기록"이
가능해진다(수동 폼이 이미 가장 정확한 경로).

**손댈 파일**
- `src/domain/garmentTypes.ts` (GarmentItem :114-147) — 필드 추가
- 아카이브 reducer / `ArchiveProvider` — ADD/EDIT 경로에 새 필드 전달
- `src/components/closet/GarmentEditor.tsx` (:67-177) — 입력 UI 추가
- `parseGarments` 파서 — 구버전 저장 데이터 호환(기본값 채우기)
- `src/lib/ai/garmentAnalysisTypes.ts` — guess→garment 매핑에서 confidence/source 보존

**작업**
- [x] `GarmentItem`에 옵셔널 필드 추가: `material?`, `size?`, `price?` + `currency?`,
      `subtype?`, `purchasedAt?`(epoch ms), `retailer?`
- [x] 분석 메타 보존: `analysisConfidence?`, `analysisSource?: AnalysisSource`,
      `userEdited?: boolean` (저장 시 guess의 confidence/source를 옷에 남김)
- [x] 전부 **옵셔널**로 — 기존 IndexedDB/localStorage 데이터가 깨지지 않게.
      `parseGarments`/`sanitizeGarment`가 누락·malformed 필드를 안전 처리.
- [x] `GarmentEditor`에 입력 추가: material(text), size(text), price(number)+currency,
      subtype(text)
- [x] seed(`seedGarments.ts`)는 그대로 둬도 됨(옵셔널이라 통과)
- [x] 테스트: parser 라운드트립 + 새 필드 영속 테스트 추가, 기존 honesty 테스트 유지

**완료조건**
- `npm run typecheck && npm test` green
- UI에서 material/size/price 입력 → 저장 → 새로고침 후에도 유지됨
- 구버전 데이터(필드 없는) 로드해도 에러 없이 파싱

**Claude Code 프롬프트**
```
Phase 1: GarmentItem에 실측 구매 메타데이터 + 분석 출처를 추가한다.

1. src/domain/garmentTypes.ts의 GarmentItem(:114-147)에 옵셔널 필드 추가:
   material?, size?, price?(number), currency?(string), subtype?,
   purchasedAt?(number, epoch ms), retailer?,
   analysisConfidence?(number), analysisSource?(AnalysisSource), userEdited?(boolean)
   전부 옵셔널 — 기존 저장 데이터 하위호환 유지.
2. parseGarments 파서가 위 필드 누락 시 안전하게 기본값 처리하도록 보강.
3. 아카이브 reducer / ArchiveProvider의 add/edit 경로가 새 필드를 전달·영속화하도록 수정.
   저장 시 GarmentAnalysisGuess의 confidence/source를 garment.analysisConfidence/
   analysisSource로 옮기고, 사용자가 편집하면 userEdited=true.
4. src/components/closet/GarmentEditor.tsx에 입력 UI 추가:
   material(text), size(text), price(number)+currency, subtype(text).
   기존 name 필수 게이트·정직성 카피는 건드리지 말 것.
5. parser 라운드트립 + 새 필드 영속 테스트 추가. 기존 honesty 테스트 통과 유지.

제약: 백엔드/네트워크/3D 추가 금지(Track A 유지). 완료 후 npm run typecheck && npm test 둘 다 green 확인하고 결과 보고.
```

---

## Phase 2 — [갈림길] 백엔드 결정 + provider seam 배선  ✅ 완료 (백엔드 = 2A)

**왜:** #3(URL prefill)과 #4(실 비전)는 **둘 다 네트워크 계층 필요**. 순수 프론트에선
제품 URL fetch가 CORS로 막혀서 #3가 사실상 불가. 그래서 먼저 어떤 계층을 쓸지 결정한다.

**옵션 (하나 골라 아래 [ ]에 체크)**
- [x] **2A. Vercel 서버리스 함수** — 얇은 프록시. 앱 단독 배포 가능, API 키 은닉.
      포트폴리오/항상 켜진 데모용이면 이쪽. ← **선택됨**
- [ ] **2B. 기존 FashionCLIP/YOLO FastAPI 노출** — 최고 정확도 + 기존 자산·eBay 재활용.
      네 머신에서 실제로 매일 쓸 거면 이쪽. (단 백엔드가 떠 있어야 동작)

**작업 (결정 후)** — 2A 선택, 배선 완료
- [x] env 설정: `VITE_API_BASE` 추가, `.env.example` 문서화, `src/vite-env.d.ts`로 타입 선언
- [x] provider seam 실제 배선: `src/lib/ai/createAnalyzer.ts` 팩토리 + `backendClient.ts`(skeleton).
      `runGarmentAnalysis`가 mock 직결 대신 팩토리 경유. **기본값은 mock 유지**(env 미설정 시).
      backend Analyzer는 stub(현재 mock 폴백, source 'mock' 유지 — Phase 4에서 실 호출).
- [x] UI(`UploadGarmentModal`)는 기존처럼 `runGarmentAnalysis`만 호출하도록 유지(변경 없음)
- [x] `/api` 함수 파일은 추가하지 않음(Phase 3) — Vite dev 워크플로우 유지

**완료조건**
- 백엔드 선택을 이 파일 상단 체크박스에 기록
- 팩토리 추가했지만 env 미설정 시 mock으로 동작(typecheck/test green)

**Claude Code 프롬프트** (백엔드 선택 후 위 옵션을 프롬프트 첫 줄에 명시)
```
Phase 2: 분류기 provider seam을 실제로 배선한다. (선택한 백엔드: 2A 또는 2B — 명시)

1. src/lib/ai/garmentAnalysisTypes.ts의 GarmentAnalyzer 인터페이스를 그대로 사용.
2. src/lib/ai/createAnalyzer.ts 신설: env(VITE_API_BASE / VITE_ANALYZER) 기반으로
   mock | backend Analyzer를 반환하는 팩토리. 미설정/오류 시 mock 폴백.
3. runGarmentAnalysis가 mock을 직접 부르지 말고 createAnalyzer()를 경유하도록 수정.
   UI 호출부는 변경 없이 유지.
4. .env.example에 VITE_API_BASE 등 추가, 주석으로 2A/2B 설명.
5. 이 단계에선 실제 backend Analyzer 본체는 stub만(다음 Phase에서 구현). 기본 동작은 mock.

제약: 기본 동작이 절대 깨지면 안 됨. honesty 카피·name 게이트 유지. npm run typecheck && npm test green 확인 후 보고.
```

---

## Phase 3 — 제품 URL prefill (#4)  ✅ 완료

**왜 비전보다 먼저:** 산 옷 정확도엔 제품 페이지가 ground truth. JSON-LD/OG 파싱이
비전보다 정확하고 작업량도 적다.

**손댈 파일**
- 백엔드(2A/2B): `/api/product-meta` 류 엔드포인트 — URL 받아 fetch + JSON-LD/OG 파싱
- `src/lib/productMatch/` — mock 자리에 URL→메타 어댑터 추가(seam 활용)
- `src/components/closet/UploadGarmentModal.tsx` reference 스텝(:879-944, sourceUrl :890-901)

**작업**
- [x] 백엔드 엔드포인트: `api/product-meta.ts`(Edge) — URL → schema.org Product
      JSON-LD / OG 메타에서 name·brand·price·image 추출해 반환. 파싱/검증 로직은
      `src/lib/productMatch/`(productMetaParse·urlGuard)에 두어 단위 테스트. SSRF
      가드(http(s)·공인 호스트·리다이렉트 재검증·타임아웃·크기 제한) 포함.
- [x] 프론트 어댑터: `fetchProductMeta`(success|unavailable|failed) +
      `productMetaToPrefill`. category/color/**garment name은 손대지 않음**
      (name은 reference 진입 전 이미 확정 → 덮어쓰면 안 됨; 제품명은 sourceLabel로).
- [x] reference 스텝 sourceUrl 옆 "Fetch" 버튼 → prefill. 백엔드 미설정 시 버튼
      숨김(기본 동작 동일). 실패/불가는 cutout처럼 정직하게 분기.
- [x] **honesty 유지**: UPLOAD_COPY/PRODUCT_META_REASONS 정직성 테스트로 가드,
      name 게이트·"사용자 확정" 그대로.

**완료조건**
- 제품 URL 붙여넣기 → name/brand/price/image 프리필 → 사용자 확정 → 저장
- 네트워크/파싱 실패 시 조용히 수동 입력으로 폴백
- typecheck/test green

---

## Phase 4 — 실 비전 분류기 (#2)  ✅ 완료 (env-gated, off by default)

**손댈 파일**
- `src/lib/ai/garmentAnalysisTypes.ts` — `GarmentAnalysisInput`에 이미지 바이트/dataUrl 추가
  (현재 fileName/fileSizeBytes/dominantColorHex만 받음)
- Phase 2의 backend Analyzer 본체 — 이미지 POST → 응답을 `GarmentAnalysisGuess`로 매핑
- 감사에서 지적된 "마치 배선된 듯 보이는" 오해 소지 주석(mock :7-14, vision-api 슬롯) 정리

**작업**
- [x] `GarmentAnalysisInput`에 `imageDataUrl?`(다운스케일 썸네일) 추가. mock은 무시.
- [x] backend Analyzer(`createBackendAnalyzer`): 썸네일을 `api/analyze`(Edge,
      Claude vision, raw fetch)로 POST → `parseVisionGuess`로 정규화 →
      `source: 'vision-api'`. brand는 로고가 명확할 때만(날조 금지). 실패/이미지 없음/
      파싱 불가 시 mock 폴백(`source: 'mock'` 유지 — 정직).
- [x] env 플래그: `VITE_API_BASE` **AND** `VITE_ANALYZER=vision`일 때만 backend
      선택(Phase 3 prefill용 base 설정이 비전을 켜지 않도록 분리). 기본은 mock.
- [x] 오해 소지 주석 정정(mock 헤더·`garmentAnalysisTypes` 헤더·CLAUDE.md §3·
      ROADMAP/AI_IMAGE_PIPELINE). **추가:** 비전 ON일 때 스캔 카피를 모드별로
      분기 — "no photo leaves your device"가 거짓이 되지 않게 cloud 카피 표시.

**완료조건**
- 플래그 on → 업로드 시 실제 비전 draft, off → mock
- 사용자 확정 단계 그대로, typecheck/test green

---

## Phase 5 — cutout → 마네킹 z-order 연결 (#5, 비주얼 품질)  ✅ 완료

**손댈 파일**
- `src/components/.../MannequinPreview.tsx` (:75-94)
- `garmentLayout.ts` (:36-46 불투명 패널 가정, :47-88 zIndex 프리셋)

**작업**
- [x] garment에 cutout(투명)이 있으면 올바른 z-order(outerwear-above-top) 활성화
      (`getLayerZIndex(category, isCutout)` 순수 함수, 단위 테스트).
- [x] cutout 없는 옷은 기존 `mix-blend-mode: multiply` + matte 패널 + preset z-order 유지.
- [x] cutout 옷은 투명 콜라주로 floating: `mannequin__zone--cutout`(패널/비네트/액센트
      제거) + `mannequin__img--cutout`(multiply 해제) + object-fit contain.

**완료조건**
- cutout된 옷은 자연스럽게 겹쳐짐, 아닌 옷은 기존대로
- typecheck/test green

---

## Phase 6 — 아카이브 JSON 백업 / 이전 (export ⇄ import)  ✅ 완료

브라우저 프로파일 하나에 갇혀 있던 아카이브를 **파일 하나로** 꺼내고 되돌리는
경로. iOS 앱 이전의 밑작업이자, 그 자체로 백업 수단.

**손댈 파일 (전부 신규 / 순수 추가)**
- `src/lib/storage/archiveExport.ts` — 문서 포맷 + 청크 라이터
- `src/lib/storage/archiveImport.ts` — 검증/리뷰 + merge/replace 요약
- `src/components/settings/ArchiveTransferModal.tsx` — 사이드바 푸터 진입점
- `src/lib/download.ts`, `Icon`(download), reducer `IMPORT_ARCHIVE`, provider
  `exportArchive`/`importArchive`

**작업**
- [x] 문서 = `{kind, schemaVersion, assetEncoding, exportedAt, garments,
      savedOutfits, currentOutfit}`. `kind`로 무관한 JSON 거부, 상위 버전은
      반쯤 읽지 않고 거부.
- [x] blob ref(`croppedImageRef`/`cutoutImageRef`)를 **resolve해서 base64로
      인라인하고 ref는 제거** — 남의 프로파일 키는 받는 쪽에서 의미 없음.
      `blob:` object URL은 절대 파일에 쓰지 않음(`assetMode` 기준 재유도).
      읽기 실패한 blob은 숨기지 않고 카운트, 조각은 썸네일로 export.
- [x] 메모리: `write(chunk)` 싱크로 garment 한 개씩 직렬화 후 해제 —
      전체 객체 그래프 + 전체 JSON 문자열을 동시에 들지 않음.
- [x] import는 **기존 `storageTypes.ts` 파서**를 항목 단위로 통과시켜
      드롭 사유를 `ArchiveImportIssue`로 보고(조용한 실패 금지), 커밋 전 표시.
- [x] 기본 `merge`는 id 충돌 시 **기존 레코드 유지**(덮어쓰기 없음),
      `replace`는 별도의 명시적 선택. 들어온 인라인 이미지는 blob store로
      되돌려 저장(대량 import가 메타데이터 한 방에 수 MB로 앉지 않게).
- [x] 추가 전용: 기존 도메인 타입 shape 변경/필수화 없음.

**완료조건**
- export → 파일 → import 라운드트립이 garment/look/current outfit 동일 복원
- 손상 항목은 드롭 사유와 함께 보고, 사용자가 merge/replace 선택 전엔 무변경
- typecheck/lint/test/build green (433 → 479 tests)

---

## 진행 체크리스트
- [x] Phase 1 — 데이터 모델 + 분석 출처 보존
- [x] Phase 2 — 백엔드 결정(2A) + seam 배선
- [x] Phase 3 — URL prefill
- [x] Phase 4 — 실 비전 분류기
- [x] Phase 5 — cutout 레이어링
- [x] Phase 6 — 아카이브 JSON 백업 / 이전
