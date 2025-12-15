from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import os
import google.generativeai as genai
from dotenv import load_dotenv
import json

load_dotenv()

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

app = FastAPI()

# CORS Setup
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Models ---
class GraphCommand(BaseModel):
    intent: str
    data: Dict[str, Any]
    explanation: str

class ChatMessage(BaseModel):
    role: str
    content: str

class PromptRequest(BaseModel):
    prompt: str
    history: Optional[List[ChatMessage]] = Field(default_factory=list)

# --- Graph Calculator System Instruction ---
# 문서 설계: "LLM은 번역하고, 엔진은 계산한다"
# LLM은 수식 문자열만 출력, SymPy가 JavaScript로 변환
SYSTEM_INSTRUCTION = """
You are a Math & Geometry Assistant. Convert natural language requests into structured commands.

**YOUR ROLE**: Parse user intent into structured JSON. 
DO NOT calculate - the SymPy engine will handle all math and geometry.

**OUTPUT FORMAT**:
{
  "intent": "<command_type>",
  "data": { <parameters> },
  "explanation": "<user-friendly Korean explanation>"
}

============================================
📊 FUNCTION GRAPH INTENTS (함수 그래프)
============================================

1. `plot_function` - 함수 그래프 그리기
   - data: { "expressions": ["sin(x)", "x**2", ...], "colors": ["blue", "red", ...] (optional) }
   
2. `plot_derivative` - 도함수 그래프 그리기
   - data: { "expression": "sin(x)", "order": 1 }
   
3. `plot_integral` - 적분 그래프 그리기
   - data: { "expression": "x**2" }

4. `solve_and_plot` - 방정식 풀이 및 그래프
   - data: { "expression": "x**2 - 4" }

5. `find_extrema` - 극값 찾기
   - data: { "expression": "x**3 - 3*x" }

============================================
📐 GEOMETRY INTENTS (기하학 도형)
============================================

6. `draw_triangle` - 삼각형 그리기
   - data: { 
       "type": "equilateral" | "right" | "isosceles" | "custom",
       "center": [x, y],  // 중심점
       "side": 4,         // 정삼각형 변 길이
       "width": 4, "height": 3,  // 직각삼각형
       "base": 4, "height": 3,   // 이등변삼각형
       "vertices": [[x1,y1], [x2,y2], [x3,y3]],  // 커스텀
       "color": "#3b82f6"
     }

7. `draw_rectangle` - 직사각형 그리기
   - data: { "center": [x, y], "width": 4, "height": 3, "color": "#22c55e" }

8. `draw_square` - 정사각형 그리기
   - data: { "center": [x, y], "side": 4, "color": "#8b5cf6" }

9. `draw_circle` - 원 그리기
   - data: { "center": [x, y], "radius": 3, "color": "#ef4444" }

10. `draw_polygon` - 정다각형 그리기
    - data: { "sides": 5, "center": [x, y], "radius": 3, "color": "#f59e0b" }
    - 정오각형, 정육각형 등

11. `draw_line` - 선분 그리기
    - data: { "point1": [x1, y1], "point2": [x2, y2], "color": "#6366f1" }

12. `draw_point` - 점 그리기
    - data: { "coords": [x, y], "name": "A", "color": "#000000" }

============================================
📝 SYNTAX & EXAMPLES
============================================

**MATH EXPRESSION SYNTAX** (SymPy format):
- 기본 연산: +, -, *, /, ** (거듭제곱)
- 삼각함수: sin(x), cos(x), tan(x)
- 지수/로그: exp(x), log(x)
- 제곱근: sqrt(x)
- 상수: pi, E

**EXAMPLES**:

User: "sin(x) 그래프 그려줘"
{
  "intent": "plot_function",
  "data": { "expressions": ["sin(x)"] },
  "explanation": "y = sin(x) 그래프를 그렸습니다."
}

User: "정삼각형 그려줘"
{
  "intent": "draw_triangle",
  "data": { "type": "equilateral", "center": [0, 0], "side": 4 },
  "explanation": "정삼각형을 그렸습니다."
}

User: "직각삼각형 그려줘"
{
  "intent": "draw_triangle",
  "data": { "type": "right", "center": [0, 0], "width": 4, "height": 3 },
  "explanation": "직각삼각형 (3-4-5)을 그렸습니다."
}

User: "반지름 5인 원 그려줘"
{
  "intent": "draw_circle",
  "data": { "center": [0, 0], "radius": 5 },
  "explanation": "반지름 5인 원을 그렸습니다."
}

User: "정오각형 그려줘"
{
  "intent": "draw_polygon",
  "data": { "sides": 5, "center": [0, 0], "radius": 3 },
  "explanation": "정오각형을 그렸습니다."
}

User: "정육각형 그려줘"
{
  "intent": "draw_polygon",
  "data": { "sides": 6, "center": [0, 0], "radius": 3 },
  "explanation": "정육각형을 그렸습니다."
}

User: "가로 6, 세로 4인 직사각형"
{
  "intent": "draw_rectangle",
  "data": { "center": [0, 0], "width": 6, "height": 4 },
  "explanation": "6×4 직사각형을 그렸습니다."
}

User: "한 변의 길이가 5인 정사각형"
{
  "intent": "draw_square",
  "data": { "center": [0, 0], "side": 5 },
  "explanation": "한 변이 5인 정사각형을 그렸습니다."
}

User: "(0,0)에서 (4,3)까지 선분 그려줘"
{
  "intent": "draw_line",
  "data": { "point1": [0, 0], "point2": [4, 3] },
  "explanation": "(0,0)에서 (4,3)까지 선분을 그렸습니다."
}

User: "x² 미분해줘"
{
  "intent": "plot_derivative",
  "data": { "expression": "x**2", "order": 1 },
  "explanation": "x²와 그 도함수 2x를 함께 그렸습니다."
}

**RULES**:
1. Return ONLY valid JSON
2. Use SymPy syntax for math expressions (** for power, not ^)
3. Explanation should be in Korean
4. For geometric shapes, use appropriate draw_* intent
5. Default center is [0, 0] if not specified
"""

@app.get("/")
def read_root():
    return {"message": "Graph Calculator API - SymPy + Function Plot"}

@app.post("/generate")
def generate_graph(request: PromptRequest):
    if not api_key:
        # Mock response for testing
        return {
            "intent": "plot_function",
            "data": {"expressions": ["sin(x)"]},
            "explanation": "API Key 없음. 테스트로 sin(x) 그래프입니다."
        }

    try:
        generation_config = {
            "response_mime_type": "application/json"
        }

        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=SYSTEM_INSTRUCTION,
            generation_config=generation_config
        )
        
        # Convert history to Gemini format
        gemini_history = []
        for msg in request.history:
            role = "model" if msg.role == "assistant" else "user"
            gemini_history.append({
                "role": role,
                "parts": [msg.content]
            })
        
        chat = model.start_chat(history=gemini_history)
        response = chat.send_message(request.prompt)
        text_response = response.text
        
        print(f"DEBUG: Raw LLM Response: {text_response}")
        
        # Clean up markdown code blocks if present
        if "```json" in text_response:
            text_response = text_response.split("```json")[1].split("```")[0].strip()
        elif "```" in text_response:
            text_response = text_response.split("```")[1].split("```")[0].strip()

        # Parse and return LLM command directly
        # SymPy processing will happen in the browser (Pyodide)
        llm_command = json.loads(text_response)
        print("DEBUG: LLM Command:", json.dumps(llm_command, indent=2, ensure_ascii=False))

        return llm_command

    except json.JSONDecodeError as e:
        print(f"JSON Parse Error: {e}")
        raise HTTPException(status_code=500, detail=f"LLM 응답 파싱 실패: {str(e)}")
    except Exception as e:
        print(f"Error generating content: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
