# LLM + SymPy 기반 대화형 그래프/기하학 계산기 구현 가이드

> 이 문서는 LLM(대규모 언어 모델)과 SymPy 수학 엔진을 결합하여 대화형 그래프/기하학 계산기를 구현하는 방법을 정리한 기술 노하우 문서입니다.

---

## 📋 목차

1. [아키텍처 개요](#1-아키텍처-개요)
2. [기술 스택](#2-기술-스택)
3. [핵심 설계 원칙](#3-핵심-설계-원칙)
4. [프론트엔드 구현](#4-프론트엔드-구현)
5. [백엔드 구현](#5-백엔드-구현)
6. [Pyodide 웹 워커](#6-pyodide-웹-워커)
7. [LLM 프롬프트 엔지니어링](#7-llm-프롬프트-엔지니어링)
8. [시각화 라이브러리](#8-시각화-라이브러리)
9. [트러블슈팅](#9-트러블슈팅)
10. [확장 가이드](#10-확장-가이드)

---

## 1. 아키텍처 개요

### 1.1 하이브리드 인텔리전스 시스템

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   사용자     │ ──▶ │  LLM (API)  │ ──▶ │   Pyodide   │ ──▶ │  시각화     │
│  자연어 입력  │     │  의도 파싱   │     │  SymPy 연산  │     │ (그래프/도형) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### 1.2 핵심 원칙: "LLM은 번역하고, 엔진은 계산한다"

- **LLM**: 자연어 → 구조화된 JSON 명령 변환 (의미론적 파서)
- **SymPy**: 실제 수학 연산 수행 (결정론적 엔진)
- **시각화**: 연산 결과를 그래프/도형으로 렌더링

### 1.3 클라이언트 사이드 연산의 장점

| 장점 | 설명 |
|------|------|
| 서버 비용 절감 | 연산이 사용자 브라우저에서 수행됨 |
| 실시간 반응성 | 네트워크 지연 없이 즉각적인 그래프 업데이트 |
| 오프라인 지원 | PWA로 구현 시 오프라인에서도 동작 가능 |
| 무한 확장성 | 사용자 수 증가해도 서버 부하 없음 |

---

## 2. 기술 스택

### 2.1 프론트엔드

| 기술 | 용도 | 버전 |
|------|------|------|
| Next.js | React 프레임워크 | 16.x |
| TypeScript | 타입 안전성 | 5.x |
| Tailwind CSS | 스타일링 | 3.x |
| Function Plot | 함수 그래프 렌더링 | 1.x |
| JSXGraph | 기하학 도형 렌더링 | 1.8.x |
| MathQuill | LaTeX 수식 입력/표시 | 0.10.x |

### 2.2 백엔드

| 기술 | 용도 | 버전 |
|------|------|------|
| FastAPI | API 서버 | 0.124.x |
| Google Gemini | LLM API | gemini-2.5-flash |
| Python | 런타임 | 3.9+ |

### 2.3 클라이언트 사이드 연산

| 기술 | 용도 | 버전 |
|------|------|------|
| Pyodide | 브라우저 내 Python 런타임 | 0.24.1 |
| SymPy | 기호 수학 라이브러리 | (Pyodide 내장) |
| Web Worker | 메인 스레드 블로킹 방지 | - |

---

## 3. 핵심 설계 원칙

### 3.1 통신 프로토콜: JSON DSL

LLM이 출력하는 명령은 반드시 **구조화된 JSON** 형식이어야 합니다.

```json
{
  "intent": "plot_function",
  "data": {
    "expressions": ["sin(x)", "cos(x)"],
    "colors": ["#3b82f6", "#ef4444"]
  },
  "explanation": "sin(x)와 cos(x) 그래프를 함께 그렸습니다."
}
```

### 3.2 피해야 할 안티 패턴

❌ **자연어 명령 전달**: LLM → 엔진으로 한글 명령 전달
❌ **데이터 포인트 직접 생성**: LLM이 좌표값 배열 생성 (토큰 낭비)
❌ **SVG 코드 생성**: LLM이 그래픽 코드 직접 작성

### 3.3 수식 변환 전략

```
LLM 출력: "sin(x)**2"
    ↓
SymPy 파싱: sympify("sin(x)**2")
    ↓
JS 변환: "sin(x)^2" (Function Plot 호환)
    ↓
LaTeX 변환: "\\sin^{2}{\\left(x \\right)}" (UI 표시용)
```

---

## 4. 프론트엔드 구현

### 4.1 프로젝트 구조

```
frontend/
├── public/
│   └── pyodide-worker.js    # Pyodide 웹 워커
├── src/
│   ├── app/
│   │   ├── page.tsx         # 메인 페이지
│   │   ├── layout.tsx       # 레이아웃
│   │   └── globals.css      # 전역 스타일
│   ├── components/
│   │   ├── DrawingApp.tsx   # 메인 앱 컴포넌트
│   │   ├── GraphCalculator.tsx  # 함수 그래프 컴포넌트
│   │   ├── GeometryBoard.tsx    # 기하학 도형 컴포넌트
│   │   └── MathInput.tsx    # MathQuill 래퍼
│   └── hooks/
│       └── usePyodide.ts    # Pyodide 훅
└── package.json
```

### 4.2 Pyodide 훅 구현

```typescript
// src/hooks/usePyodide.ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface PyodideStatus {
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
}

export function usePyodide() {
  const [status, setStatus] = useState<PyodideStatus>({ 
    status: 'idle', 
    message: '대기 중...' 
  });
  const [isReady, setIsReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const worker = new Worker('/pyodide-worker.js');
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, id, payload, status: workerStatus, message } = e.data;

      if (type === 'status') {
        setStatus({ status: workerStatus, message });
        if (workerStatus === 'ready') setIsReady(true);
      } else if (type === 'result') {
        const pending = pendingRequests.current.get(id);
        if (pending) {
          pending.resolve(payload);
          pendingRequests.current.delete(id);
        }
      }
    };

    worker.postMessage({ type: 'init' });

    return () => worker.terminate();
  }, []);

  const processGraphCommand = useCallback((command) => {
    return new Promise((resolve, reject) => {
      const id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const timeout = setTimeout(() => {
        pendingRequests.current.delete(id);
        reject(new Error('처리 시간 초과'));
      }, 30000);

      pendingRequests.current.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (error) => { clearTimeout(timeout); reject(error); }
      });

      workerRef.current?.postMessage({ type: 'process', id, payload: command });
    });
  }, []);

  return { status, isReady, processGraphCommand };
}
```

### 4.3 동적 라이브러리 로딩

SSR 환경에서 브라우저 전용 라이브러리 로딩:

```typescript
// Function Plot 동적 로드
useEffect(() => {
  if (typeof window !== 'undefined' && !functionPlot) {
    import('function-plot').then((module) => {
      functionPlot = module.default;
      setIsLoading(false);
    });
  }
}, []);

// JSXGraph CDN 로드
useEffect(() => {
  if (typeof window === 'undefined') return;

  if (!document.getElementById('jsxgraph-css')) {
    const link = document.createElement('link');
    link.id = 'jsxgraph-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/jsxgraph@1.8.0/distrib/jsxgraph.css';
    document.head.appendChild(link);
  }

  if (!window.JXG) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsxgraph@1.8.0/distrib/jsxgraphcore.js';
    script.onload = () => setIsLoading(false);
    document.body.appendChild(script);
  }
}, []);
```

---

## 5. 백엔드 구현

### 5.1 FastAPI 서버 구조

```python
# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PromptRequest(BaseModel):
    prompt: str
    history: list = []

@app.post("/generate")
def generate(request: PromptRequest):
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=SYSTEM_INSTRUCTION,
        generation_config={"response_mime_type": "application/json"}
    )
    
    chat = model.start_chat(history=request.history)
    response = chat.send_message(request.prompt)
    
    return json.loads(response.text)
```

### 5.2 CORS 주의사항

프론트엔드와 백엔드가 다른 포트에서 실행될 때 반드시 CORS 설정 필요:

```python
origins = [
    "http://localhost:3000",  # Next.js 개발 서버
    "http://127.0.0.1:3000",
]
```

---

## 6. Pyodide 웹 워커

### 6.1 워커 초기화

```javascript
// pyodide-worker.js
let pyodide = null;
let sympyLoaded = false;

async function initPyodide() {
  if (pyodide) return pyodide;
  
  self.postMessage({ type: 'status', status: 'loading', message: 'Pyodide 로딩 중...' });
  
  // CDN에서 Pyodide 로드
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');
  
  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'
  });
  
  self.postMessage({ type: 'status', status: 'loading', message: 'SymPy 설치 중...' });
  
  await pyodide.loadPackage(['sympy', 'micropip']);
  
  // Python 헬퍼 함수 정의
  await pyodide.runPythonAsync(`
import json
from sympy import *
from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application

transformations = standard_transformations + (implicit_multiplication_application,)

def expr_to_js(expr_str):
    """수식을 Function Plot 호환 형식으로 변환"""
    try:
        x = Symbol('x')
        expr = parse_expr(expr_str, local_dict={'x': x, 'e': E, 'pi': pi}, transformations=transformations)
        
        # ** → ^ 변환 (Function Plot 형식)
        fn_plot_expr = str(expr).replace('**', '^')
        
        return json.dumps({
            'success': True,
            'jsCode': fn_plot_expr,
            'latex': latex(expr),
            'simplified': str(simplify(expr))
        })
    except Exception as e:
        return json.dumps({'success': False, 'error': str(e)})
  `);
  
  sympyLoaded = true;
  self.postMessage({ type: 'status', status: 'ready', message: 'SymPy 엔진 준비 완료!' });
  
  return pyodide;
}

// 메시지 핸들러
self.onmessage = async function(e) {
  const { type, payload, id } = e.data;
  
  if (type === 'init') {
    await initPyodide();
    return;
  }
  
  if (type === 'process') {
    if (!pyodide || !sympyLoaded) await initPyodide();
    
    const resultJson = await pyodide.runPythonAsync(`
      process_graph_command(${JSON.stringify(payload)})
    `);
    
    self.postMessage({ type: 'result', id, payload: JSON.parse(resultJson) });
  }
};

// 즉시 초기화 시작
initPyodide();
```

### 6.2 메인 스레드 블로킹 방지

웹 워커를 사용하는 이유:
- Pyodide 초기화 시간: 5-10초
- SymPy 연산: 복잡한 적분/미분 시 수 초 소요
- **메인 스레드에서 실행하면 UI 완전 프리징**

---

## 7. LLM 프롬프트 엔지니어링

### 7.1 시스템 프롬프트 구조

```python
SYSTEM_INSTRUCTION = """
You are a Math & Geometry Assistant. Convert natural language requests into structured commands.

**YOUR ROLE**: Parse user intent into structured JSON. 
DO NOT calculate - the SymPy engine will handle all math.

**OUTPUT FORMAT**:
{
  "intent": "<command_type>",
  "data": { <parameters> },
  "explanation": "<user-friendly Korean explanation>"
}

**SUPPORTED INTENTS**:

1. `plot_function` - 함수 그래프 그리기
   - data: { "expressions": ["sin(x)", "x**2"], "colors": ["blue", "red"] }

2. `plot_derivative` - 도함수 그래프
   - data: { "expression": "sin(x)", "order": 1 }

3. `draw_triangle` - 삼각형 그리기
   - data: { "type": "equilateral", "center": [0, 0], "side": 4 }

4. `draw_circle` - 원 그리기
   - data: { "center": [0, 0], "radius": 3 }

**MATH EXPRESSION SYNTAX** (SymPy format):
- 거듭제곱: ** (not ^)
- 삼각함수: sin(x), cos(x), tan(x)
- 지수/로그: exp(x), log(x)
- 상수: pi, E

**EXAMPLES**:
[예시들...]

**RULES**:
1. Return ONLY valid JSON
2. Use SymPy syntax for expressions
3. Explanation in Korean
"""
```

### 7.2 JSON 응답 강제

Gemini API의 `response_mime_type` 설정:

```python
generation_config = {
    "response_mime_type": "application/json"
}
```

### 7.3 프롬프트 확장 시 주의사항

1. **예시 추가**: 새 intent 추가 시 반드시 예시도 추가
2. **명확한 파라미터**: data 필드의 구조 명확히 정의
3. **기본값 명시**: 선택적 파라미터의 기본값 지정

---

## 8. 시각화 라이브러리

### 8.1 Function Plot (함수 그래프)

**장점**:
- 경량 (D3.js 기반)
- 수식 문자열 직접 주입 가능
- 불연속 함수 처리 가능

```typescript
import functionPlot from 'function-plot';

functionPlot({
  target: containerRef.current,
  width: 600,
  height: 400,
  yAxis: { domain: [-10, 10] },
  xAxis: { domain: [-10, 10] },
  grid: true,
  data: [
    { fn: 'sin(x)', color: '#3b82f6' },
    { fn: 'x^2', color: '#ef4444' }
  ]
});
```

**수식 형식 주의**:
- `**` → `^` 변환 필요
- `exp(x)` 그대로 사용 (e^x 아님)
- `Math.sin(x)` 아님, `sin(x)` 사용

### 8.2 JSXGraph (기하학)

**장점**:
- 동적 기하학 특화
- 드래그 가능한 점/도형
- SymPy Geometry와 호환

```typescript
const board = JXG.JSXGraph.initBoard('jxgbox', {
  boundingbox: [-10, 10, 10, -10],
  axis: true,
  grid: true,
  keepaspectratio: true,
  showNavigation: true
});

// 삼각형 그리기
const p1 = board.create('point', [0, 2], { name: 'A' });
const p2 = board.create('point', [-2, -1], { name: 'B' });
const p3 = board.create('point', [2, -1], { name: 'C' });

board.create('polygon', [p1, p2, p3], {
  fillColor: '#3b82f6',
  fillOpacity: 0.2,
  strokeColor: '#3b82f6'
});
```

### 8.3 라이브러리 선택 가이드

| 용도 | 추천 라이브러리 |
|------|----------------|
| 함수 그래프 (y=f(x)) | Function Plot |
| 기하학 도형 | JSXGraph |
| 3D 그래프 | Plotly.js |
| 통계 시각화 | Chart.js, Recharts |

---

## 9. 트러블슈팅

### 9.1 Function Plot 에러

**문제**: `unexpected character . at index 4`
**원인**: `Math.sin(x)` 형식 사용
**해결**: `sin(x)` 형식으로 변환

**문제**: `symbol "e" is undefined`
**원인**: `e^x` 사용
**해결**: `exp(x)` 형식 사용

### 9.2 JSXGraph 에러

**문제**: `Cannot read properties of undefined (reading 'creator')`
**원인**: Python 튜플이 JSON 직렬화 시 문제
**해결**: 명시적으로 리스트로 변환

```python
def create_circle(center, radius):
    return {
        'type': 'circle',
        'center': list(center),  # 튜플 → 리스트
        'radius': radius
    }
```

### 9.3 Pyodide 초기화 지연

**문제**: 첫 로드 시 5-10초 대기
**해결 방안**:
1. Service Worker로 캐싱
2. 로딩 UI 표시
3. 백그라운드 프리로딩

### 9.4 CORS 에러

**문제**: `Access-Control-Allow-Origin` 에러
**해결**: 백엔드에 CORS 미들웨어 추가

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 10. 확장 가이드

### 10.1 새 Intent 추가 절차

1. **LLM 프롬프트 수정** (`main.py`)
   ```python
   SUPPORTED INTENTS:
   ...
   N. `new_intent` - 설명
      - data: { ... }
   ```

2. **Pyodide 워커 함수 추가** (`pyodide-worker.js`)
   ```python
   def process_new_intent(data):
       # 처리 로직
       return result
   ```

3. **프론트엔드 핸들러 추가** (`DrawingApp.tsx`)
   ```typescript
   const NEW_INTENTS = ['new_intent', ...];
   
   if (NEW_INTENTS.includes(llmCommand.intent)) {
     // 처리 로직
   }
   ```

### 10.2 성능 최적화

1. **Service Worker 캐싱**
   ```javascript
   // Pyodide 파일들 캐싱
   const CACHE_FILES = [
     'pyodide.asm.wasm',
     'python_stdlib.zip',
     'sympy.whl'
   ];
   ```

2. **Lazy Loading**
   ```typescript
   const GraphCalculator = dynamic(() => import('./GraphCalculator'), { 
     ssr: false,
     loading: () => <LoadingSpinner />
   });
   ```

3. **워커 풀링**
   ```javascript
   // 여러 워커로 병렬 처리
   const workerPool = Array(4).fill(null).map(() => new Worker('/pyodide-worker.js'));
   ```

### 10.3 라이선스

| 라이브러리 | 라이선스 | 상업적 이용 |
|-----------|---------|------------|
| SymPy | BSD | ✅ 자유롭게 사용 가능 |
| Pyodide | MPL 2.0 | ✅ 수정 없이 사용 시 OK |
| Function Plot | MIT | ✅ 자유롭게 사용 가능 |
| JSXGraph | LGPL/MIT | ✅ 자유롭게 사용 가능 |

---

## 📚 참고 자료

- [Pyodide 공식 문서](https://pyodide.org/en/stable/)
- [SymPy 공식 문서](https://docs.sympy.org/latest/index.html)
- [Function Plot GitHub](https://github.com/mauriciopoppe/function-plot)
- [JSXGraph 공식 문서](https://jsxgraph.org/docs/index.html)
- [Google Gemini API](https://ai.google.dev/docs)

---

## 📝 버전 히스토리

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| v1.0 | - | 초기 기하학 도형 생성 |
| v2.0 | - | 그래프 계산기로 전환 (Function Plot) |
| v3.0 | - | MathQuill 통합, 하이브리드 아키텍처 |
| v3.1 | - | JSXGraph 기하학 기능 추가 |

---

*이 문서는 프로젝트의 기술 노하우를 정리한 것입니다. 다른 프로젝트에 적용 시 참고하세요.*

