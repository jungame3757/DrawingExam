from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Union, Optional, Dict, Any
import os
import google.generativeai as genai
from dotenv import load_dotenv
import json
import math

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
class GeometryElement(BaseModel):
    id: str = Field(..., description="Unique identifier for the element")
    type: str = Field(..., description="Type of element")
    parents: List[Union[float, str]] = Field(..., description="List of parent elements or coordinates")
    props: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Visual properties")

class GeometryResponse(BaseModel):
    elements: List[GeometryElement]
    explanation: str

class ChatMessage(BaseModel):
    role: str
    content: str

class PromptRequest(BaseModel):
    prompt: str
    history: Optional[List[ChatMessage]] = Field(default_factory=list)

# --- NEW: Intent-based System Instruction ---
# LLM은 좌표를 계산하지 않고, 의도(intent)와 파라미터만 출력
SYSTEM_INSTRUCTION = """
You are a Geometry Intent Parser. Convert natural language to structured geometric commands.

**YOUR ROLE**: Parse user intent into structured JSON. DO NOT calculate coordinates - the math engine will do that.

**OUTPUT FORMAT**:
{
  "intent": "<command_type>",
  "data": { <parameters> },
  "explanation": "<user-friendly Korean explanation>"
}

**SUPPORTED INTENTS**:

1. `create_triangle` - 삼각형 생성
   - data: { "type": "equilateral|isosceles|right|general", "base_length": number, "anchor": [x, y], "height": number (optional) }
   
2. `create_circle` - 원 생성
   - data: { "center": [x, y], "radius": number, "name": string }
   
3. `create_rectangle` - 직사각형 생성
   - data: { "anchor": [x, y], "width": number, "height": number }
   
4. `create_square` - 정사각형 생성
   - data: { "anchor": [x, y], "side": number }

5. `create_polygon` - 다각형 생성
   - data: { "vertices": [[x1,y1], [x2,y2], ...], "names": ["A", "B", ...] }

6. `create_point` - 점 생성
   - data: { "x": number, "y": number, "name": string }

7. `create_line` - 직선 생성
   - data: { "point1": [x, y], "point2": [x, y] }

8. `calculate_distance` - 거리 계산
   - data: { "point1": [x, y], "point2": [x, y] }

9. `calculate_midpoint` - 중점 계산
   - data: { "point1": [x, y], "point2": [x, y] }

10. `modify_element` - 요소 수정
    - data: { "element_id": string, "property": string, "value": any }

**EXAMPLES**:

User: "정삼각형을 그려줘"
{
  "intent": "create_triangle",
  "data": { "type": "equilateral", "base_length": 5, "anchor": [0, 0] },
  "explanation": "한 변의 길이가 5인 정삼각형을 그렸습니다."
}

User: "반지름이 3인 원을 중심 (2, 4)에 그려줘"
{
  "intent": "create_circle",
  "data": { "center": [2, 4], "radius": 3, "name": "O" },
  "explanation": "중심이 (2, 4)이고 반지름이 3인 원을 그렸습니다."
}

User: "가로 6, 세로 4인 직사각형"
{
  "intent": "create_rectangle",
  "data": { "anchor": [0, 0], "width": 6, "height": 4 },
  "explanation": "가로 6, 세로 4인 직사각형을 그렸습니다."
}

User: "직각삼각형, 밑변 4, 높이 3"
{
  "intent": "create_triangle",
  "data": { "type": "right", "base_length": 4, "height": 3, "anchor": [0, 0] },
  "explanation": "밑변 4, 높이 3인 직각삼각형을 그렸습니다."
}

**RULES**:
1. Return ONLY valid JSON
2. Use reasonable default values (anchor: [0,0], base_length: 5, radius: 3)
3. Explanation should be in Korean
4. DO NOT calculate actual vertex coordinates - just provide parameters
5. If user gives context about existing points, incorporate them
"""

# --- SymPy-based Geometry Calculator ---
def calculate_geometry(command: dict) -> dict:
    """
    수학 엔진: LLM의 의도(intent)를 받아 정확한 좌표를 계산
    """
    intent = command.get('intent', '')
    data = command.get('data', {})
    explanation = command.get('explanation', '')
    
    result = {'elements': [], 'explanation': explanation}
    
    try:
        if intent == 'create_point':
            x, y = data.get('x', 0), data.get('y', 0)
            name = data.get('name', 'P')
            result['elements'].append({
                'id': f'p{name}',
                'type': 'point',
                'parents': [float(x), float(y)],
                'props': {'name': name}
            })
            
        elif intent == 'create_triangle':
            triangle_type = data.get('type', 'general')
            base = float(data.get('base_length', 5))
            anchor = data.get('anchor', [0, 0])
            ax, ay = float(anchor[0]), float(anchor[1])
            
            if triangle_type == 'equilateral':
                # 정삼각형: 정확한 계산 (SymPy 대신 math 사용)
                height = base * math.sqrt(3) / 2
                points = [
                    (ax, ay),                    # A
                    (ax + base, ay),             # B  
                    (ax + base/2, ay + height)   # C
                ]
                names = ['A', 'B', 'C']
                
            elif triangle_type == 'isosceles':
                height = float(data.get('height', base * 0.8))
                points = [
                    (ax, ay),
                    (ax + base, ay),
                    (ax + base/2, ay + height)
                ]
                names = ['A', 'B', 'C']
                
            elif triangle_type == 'right':
                height = float(data.get('height', base * 0.75))
                points = [
                    (ax, ay),           # A (직각)
                    (ax + base, ay),    # B
                    (ax, ay + height)   # C
                ]
                names = ['A', 'B', 'C']
                
            else:  # general
                points = [
                    (ax, ay),
                    (ax + base, ay),
                    (ax + base * 0.3, ay + base * 0.7)
                ]
                names = ['A', 'B', 'C']
            
            # 점 생성
            for i, (px, py) in enumerate(points):
                result['elements'].append({
                    'id': f'p{names[i]}',
                    'type': 'point',
                    'parents': [round(px, 6), round(py, 6)],
                    'props': {'name': names[i]}
                })
            
            # 선분 생성
            for i in range(3):
                j = (i + 1) % 3
                result['elements'].append({
                    'id': f's{names[i]}{names[j]}',
                    'type': 'segment',
                    'parents': [f'p{names[i]}', f'p{names[j]}'],
                    'props': {}
                })
                
        elif intent == 'create_circle':
            center = data.get('center', [0, 0])
            radius = float(data.get('radius', 3))
            name = data.get('name', 'O')
            
            result['elements'].append({
                'id': f'p{name}',
                'type': 'point',
                'parents': [float(center[0]), float(center[1])],
                'props': {'name': name}
            })
            
            result['elements'].append({
                'id': f'circle_{name}',
                'type': 'circle',
                'parents': [f'p{name}', radius],
                'props': {}
            })
            
        elif intent == 'create_rectangle':
            anchor = data.get('anchor', [0, 0])
            width = float(data.get('width', 4))
            height = float(data.get('height', 3))
            ax, ay = float(anchor[0]), float(anchor[1])
            
            points = [
                (ax, ay),
                (ax + width, ay),
                (ax + width, ay + height),
                (ax, ay + height)
            ]
            names = ['A', 'B', 'C', 'D']
            
            for i, (px, py) in enumerate(points):
                result['elements'].append({
                    'id': f'p{names[i]}',
                    'type': 'point',
                    'parents': [round(px, 6), round(py, 6)],
                    'props': {'name': names[i]}
                })
            
            point_ids = [f'p{name}' for name in names]
            result['elements'].append({
                'id': 'rect1',
                'type': 'polygon',
                'parents': point_ids,
                'props': {}
            })
            
        elif intent == 'create_square':
            anchor = data.get('anchor', [0, 0])
            side = float(data.get('side', 4))
            ax, ay = float(anchor[0]), float(anchor[1])
            
            points = [
                (ax, ay),
                (ax + side, ay),
                (ax + side, ay + side),
                (ax, ay + side)
            ]
            names = ['A', 'B', 'C', 'D']
            
            for i, (px, py) in enumerate(points):
                result['elements'].append({
                    'id': f'p{names[i]}',
                    'type': 'point',
                    'parents': [round(px, 6), round(py, 6)],
                    'props': {'name': names[i]}
                })
            
            point_ids = [f'p{name}' for name in names]
            result['elements'].append({
                'id': 'square1',
                'type': 'polygon',
                'parents': point_ids,
                'props': {}
            })

        elif intent == 'create_polygon':
            vertices = data.get('vertices', [])
            names = data.get('names', [])
            
            if not names:
                names = [chr(65 + i) for i in range(len(vertices))]
            
            for i, vertex in enumerate(vertices):
                result['elements'].append({
                    'id': f'p{names[i]}',
                    'type': 'point',
                    'parents': [float(vertex[0]), float(vertex[1])],
                    'props': {'name': names[i]}
                })
            
            point_ids = [f'p{name}' for name in names]
            result['elements'].append({
                'id': 'polygon1',
                'type': 'polygon',
                'parents': point_ids,
                'props': {}
            })
            
        elif intent == 'create_line':
            p1 = data.get('point1', [0, 0])
            p2 = data.get('point2', [1, 1])
            
            result['elements'].append({
                'id': 'pP1',
                'type': 'point',
                'parents': [float(p1[0]), float(p1[1])],
                'props': {'name': 'P1'}
            })
            result['elements'].append({
                'id': 'pP2',
                'type': 'point',
                'parents': [float(p2[0]), float(p2[1])],
                'props': {'name': 'P2'}
            })
            result['elements'].append({
                'id': 'line1',
                'type': 'line',
                'parents': ['pP1', 'pP2'],
                'props': {}
            })
            
        elif intent == 'calculate_distance':
            p1 = data.get('point1', [0, 0])
            p2 = data.get('point2', [1, 1])
            distance = math.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
            result['explanation'] = f'두 점 사이의 거리는 {distance:.4f}입니다.'
            
        elif intent == 'calculate_midpoint':
            p1 = data.get('point1', [0, 0])
            p2 = data.get('point2', [1, 1])
            mx = (p1[0] + p2[0]) / 2
            my = (p1[1] + p2[1]) / 2
            
            result['elements'].append({
                'id': 'pM',
                'type': 'point',
                'parents': [round(mx, 6), round(my, 6)],
                'props': {'name': 'M', 'color': 'red'}
            })
            result['explanation'] = f'중점 M({mx:.2f}, {my:.2f})을 표시했습니다.'
        
        else:
            # 알 수 없는 intent - 그대로 반환 시도
            result['explanation'] = f'처리할 수 없는 명령입니다: {intent}'
            
    except Exception as e:
        result['explanation'] = f'계산 오류: {str(e)}'
        print(f"Geometry calculation error: {e}")
    
    return result

@app.get("/")
def read_root():
    return {"message": "DrawingExam API v2 - Intent-based Architecture"}

@app.post("/generate", response_model=GeometryResponse)
def generate_geometry(request: PromptRequest):
    if not api_key:
        # Mock response for testing
        mock_command = {
            "intent": "create_triangle",
            "data": {"type": "equilateral", "base_length": 5, "anchor": [0, 0]},
            "explanation": "API Key 없음. 테스트 정삼각형입니다."
        }
        result = calculate_geometry(mock_command)
        return GeometryResponse(
            elements=[GeometryElement(**el) for el in result['elements']],
            explanation=result['explanation']
        )

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
        
        print(f"DEBUG: Raw LLM Response: {text_response[:500]}...")
        
        # Clean up markdown code blocks if present
        if "```json" in text_response:
            text_response = text_response.split("```json")[1].split("```")[0].strip()
        elif "```" in text_response:
            text_response = text_response.split("```")[1].split("```")[0].strip()

        # Parse LLM intent
        llm_command = json.loads(text_response)
        print("DEBUG: LLM Intent:", json.dumps(llm_command, indent=2, ensure_ascii=False))
        
        # Calculate geometry using math engine
        result = calculate_geometry(llm_command)
        print("DEBUG: Calculated Result:", json.dumps(result, indent=2, ensure_ascii=False))

        return GeometryResponse(
            elements=[GeometryElement(**el) for el in result['elements']],
            explanation=result['explanation']
        )

    except json.JSONDecodeError as e:
        print(f"JSON Parse Error: {e}")
        print(f"Raw Response: {text_response}")
        raise HTTPException(status_code=500, detail=f"LLM 응답 파싱 실패: {str(e)}")
    except Exception as e:
        print(f"Error generating content: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
