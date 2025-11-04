# JavaScript Coverage Profiler

📘 **고려대학교 AAA706 (Program Analysis) 수업 과제 구현물**  
이 프로젝트는 고려대학교 대학원 **AAA706 프로그램 분석** 과목의 과제 구현물입니다.  
JavaScript 코드를 **AST(Abstract Syntax Tree)** 기반으로 계측(instrumentation)하여  
**함수 / 문장 / 분기 단위의 커버리지를 측정**하는 도구를 구현하였습니다.

---

## 🧩 프로젝트 개요

이 도구는 JavaScript 코드를 실행할 때, 각 **함수**, **문장**, **분기**가 실제로 실행되었는지를 추적하여  
코드 커버리지를 계산하는 **Coverage Profiler**입니다.  
`acorn`으로 JS 코드를 파싱하고, `acorn-walk`으로 AST를 순회하며,  
각 노드에 계측 코드를 삽입한 뒤 `astring`으로 다시 JS 코드로 변환합니다.

---

## ⚙️ 주요 기능

| 기능 | 설명 |
|------|------|
| **함수 커버리지(Function Coverage)** | 각 함수 진입 시 `__cov__.func.add(id)` 형태의 계측 코드 삽입 |
| **문장 커버리지(Statement Coverage)** | 각 실행 문장 앞에 `__cov__.stmt.add(id)` 코드 삽입 |
| **분기 커버리지(Branch Coverage)** | if문, switch문, 삼항연산자 등의 분기마다 `__cov__.branch.add(id)` 코드 삽입 |
| **결과 수집 및 리포트** | 프로그램 실행 중 `__cov__` 전역 객체에 실행 기록을 저장하여, 커버리지 통계를 산출 |

---

## 🧠 기술 스택

- **Node.js / TypeScript**
- **acorn** — JavaScript 파서
- **acorn-walk** — AST 순회
- **astring** — AST를 JS 코드로 재생성
- **Mocha / Chai** — 테스트 프레임워크
