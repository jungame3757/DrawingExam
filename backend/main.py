from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Union, Optional, Dict, Any
import os
import google.generativeai as genai
from dotenv import load_dotenv
import json
import re

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
    role: str  # "user" or "assistant" (will be converted to "model" for Gemini)
    content: str

class PromptRequest(BaseModel):
    prompt: str
    history: Optional[List[ChatMessage]] = Field(default_factory=list, description="Previous conversation history")

# --- Gemini Logic ---
SYSTEM_INSTRUCTION = """
You are a Geometry Engine. Convert natural language descriptions into a structured JSON for JSXGraph.

Supported Types & Parents:
- point: [x, y] where x and y are NUMBERS (e.g., [0, 5], [-3.5, 2.1])
- line: ["point_id1", "point_id2"]
- segment: ["point_id1", "point_id2"]
- circle: ["center_point_id", radius_number] OR ["center_point_id", "radius_point_id"]
- polygon: ["point_id1", "point_id2", "point_id3", ...]
- angle: ["point_id1", "vertex_point_id", "point_id2"] (the angle at the vertex)

CRITICAL RULES:
1. Return ONLY valid JSON with "elements" (array) and "explanation" (string).
2. **Point coordinates MUST be numbers**, NOT functions or expressions. Calculate the actual coordinates.
3. All string values in parents MUST be element IDs (e.g., "p1", "pA"), NOT JavaScript code.
4. "props" should be a simple dictionary (e.g., {"name": "A", "strokeColor": "red"}).
5. **DO NOT use JavaScript functions, callbacks, or dynamic calculations in parents.**
6. **DO NOT create abstract types** like 'var', 'variable', 'value', 'solve'.
7. If the user asks to "find x", draw the shape and note the answer in explanation.
8. **Context Awareness:** If coordinates are provided in [Context...], use those exact coordinates.
9. **Conversation Memory:** Understand context from previous messages.

When calculating point positions:
- For triangles: Calculate coordinates using trigonometry, then provide FIXED numbers.
- For angles: Use the angle element type with 3 point IDs.
- Always pre-calculate and provide actual numeric coordinates.

Example Output:
{
  "elements": [
    {"id": "pA", "type": "point", "parents": [0, 0], "props": {"name": "A"}},
    {"id": "pB", "type": "point", "parents": [5, 0], "props": {"name": "B"}},
    {"id": "pC", "type": "point", "parents": [2.5, 4.33], "props": {"name": "C"}},
    {"id": "sAB", "type": "segment", "parents": ["pA", "pB"], "props": {}},
    {"id": "sBC", "type": "segment", "parents": ["pB", "pC"], "props": {}},
    {"id": "sCA", "type": "segment", "parents": ["pC", "pA"], "props": {}},
    {"id": "angleA", "type": "angle", "parents": ["pB", "pA", "pC"], "props": {"name": "60°"}}
  ],
  "explanation": "Drew an equilateral triangle ABC with side length 5."
}
"""

@app.get("/")
def read_root():
    return {"message": "DrawingExam API is running"}

@app.post("/generate", response_model=GeometryResponse)
def generate_geometry(request: PromptRequest):
    if not api_key:
        return GeometryResponse(
            elements=[
                GeometryElement(id="p1", type="point", parents=[-2, -2], props={"name": "A"}),
                GeometryElement(id="p2", type="point", parents=[2, 2], props={"name": "B"}),
                GeometryElement(id="l1", type="line", parents=["p1", "p2"], props={"strokeColor": "blue"})
            ],
            explanation="API Key missing. Mock data."
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
            # Gemini uses "model" instead of "assistant"
            role = "model" if msg.role == "assistant" else "user"
            gemini_history.append({
                "role": role,
                "parts": [msg.content]
            })
        
        # Start chat with history
        chat = model.start_chat(history=gemini_history)
        
        # Send current message and get response
        response = chat.send_message(request.prompt)
        text_response = response.text
        
        print(f"DEBUG: Raw AI Response: {text_response[:500]}...")
        
        # Clean up markdown code blocks if present
        if "```json" in text_response:
            text_response = text_response.split("```json")[1].split("```")[0].strip()
        elif "```" in text_response:
            text_response = text_response.split("```")[1].split("```")[0].strip()

        parsed = json.loads(text_response)
        print("DEBUG: Parsed AI Response:", json.dumps(parsed, indent=2))
        
        # Map directly to response model with validation
        final_elements = []
        for el in parsed.get("elements", []):
            parents = el.get("parents", [])
            
            # Validate parents - skip elements with invalid parents
            valid_parents = True
            cleaned_parents = []
            for p in parents:
                # Check for JavaScript function strings (invalid)
                if isinstance(p, str):
                    # Valid string parents are short IDs like "p1", "pA", "center"
                    # Invalid are long strings containing "=>", "function", "return", etc.
                    if any(keyword in p for keyword in ["=>", "function", "return", "()", "JXG", "Math."]):
                        print(f"WARNING: Skipping element {el.get('id')} - contains JavaScript in parents")
                        valid_parents = False
                        break
                    cleaned_parents.append(p)
                elif isinstance(p, (int, float)):
                    cleaned_parents.append(float(p))
                else:
                    # Try to convert to number
                    try:
                        cleaned_parents.append(float(p))
                    except (ValueError, TypeError):
                        cleaned_parents.append(str(p))
            
            if not valid_parents:
                continue
                
            final_elements.append(GeometryElement(
                id=el.get("id", "unknown"),
                type=el.get("type", "point"),
                parents=cleaned_parents,
                props=el.get("props", {})
            ))

        return GeometryResponse(
            elements=final_elements,
            explanation=parsed.get("explanation", "")
        )

    except Exception as e:
        print(f"Error generating content: {e}")
        try:
            print(f"Raw Response: {response.text}")
        except:
            pass
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)





