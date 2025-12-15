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
You are a Graph Calculator Assistant. Convert natural language math requests into structured commands.

**YOUR ROLE**: Parse user intent into structured JSON with mathematical expressions. 
DO NOT calculate - the SymPy engine will handle all math.

**OUTPUT FORMAT**:
{
  "intent": "<command_type>",
  "data": { <parameters> },
  "explanation": "<user-friendly Korean explanation>"
}

**SUPPORTED INTENTS**:

1. `plot_function` - 함수 그래프 그리기
   - data: { "expressions": ["sin(x)", "x**2", ...], "colors": ["blue", "red", ...] (optional) }
   - 여러 함수를 동시에 그릴 수 있음
   
2. `plot_derivative` - 도함수 그래프 그리기
   - data: { "expression": "sin(x)", "order": 1 }
   - 원본 함수와 도함수를 함께 표시
   
3. `plot_integral` - 적분 그래프 그리기
   - data: { "expression": "x**2" }
   - 원본 함수와 부정적분을 함께 표시

4. `solve_and_plot` - 방정식 풀이 및 그래프
   - data: { "expression": "x**2 - 4" }
   - 그래프와 함께 근(x절편)을 표시

5. `find_extrema` - 극값 찾기
   - data: { "expression": "x**3 - 3*x" }
   - 그래프와 함께 극대/극소점 표시

**MATH EXPRESSION SYNTAX** (SymPy format):
- 기본 연산: +, -, *, /, ** (거듭제곱)
- 삼각함수: sin(x), cos(x), tan(x), asin(x), acos(x), atan(x)
- 지수/로그: exp(x), log(x) (자연로그), log(x, 10) (상용로그)
- 제곱근: sqrt(x)
- 절대값: Abs(x)
- 상수: pi, E (자연상수)
- 예시: "sin(x)**2 + cos(x)**2", "exp(-x**2)", "log(x)/x"

**EXAMPLES**:

User: "y = sin x 그래프 그려줘"
{
  "intent": "plot_function",
  "data": { "expressions": ["sin(x)"] },
  "explanation": "y = sin(x) 그래프를 그렸습니다."
}

User: "x제곱과 2x를 같이 그려줘"
{
  "intent": "plot_function",
  "data": { "expressions": ["x**2", "2*x"] },
  "explanation": "y = x²과 y = 2x 그래프를 함께 그렸습니다."
}

User: "sin(x)의 미분 그래프"
{
  "intent": "plot_derivative",
  "data": { "expression": "sin(x)", "order": 1 },
  "explanation": "sin(x)와 그 도함수 cos(x)를 함께 그렸습니다."
}

User: "x² - 4 = 0의 근을 그래프로 보여줘"
{
  "intent": "solve_and_plot",
  "data": { "expression": "x**2 - 4" },
  "explanation": "x² - 4 = 0의 근은 x = ±2입니다."
}

User: "x³ - 3x의 극값을 찾아줘"
{
  "intent": "find_extrema",
  "data": { "expression": "x**3 - 3*x" },
  "explanation": "x³ - 3x의 극값을 찾아 표시했습니다."
}

User: "e^(-x²) 그래프" (정규분포 모양)
{
  "intent": "plot_function",
  "data": { "expressions": ["exp(-x**2)"] },
  "explanation": "가우시안 함수 e^(-x²)를 그렸습니다."
}

User: "x² 적분해서 그려줘"
{
  "intent": "plot_integral",
  "data": { "expression": "x**2" },
  "explanation": "x²와 그 부정적분 x³/3을 함께 그렸습니다."
}

**RULES**:
1. Return ONLY valid JSON
2. Use SymPy syntax for expressions (** for power, not ^)
3. Explanation should be in Korean
4. For multiple functions, use "plot_function" with multiple expressions
5. If unsure, default to "plot_function"
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
