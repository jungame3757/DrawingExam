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
- point: [x, y] (coordinates as numbers). Example: [0, 5]
- line: ["id1", "id2"]
- segment: ["id1", "id2"]
- circle: ["center_id", "radius_point_id"] OR ["center_id", radius_value]
- polygon: ["id1", "id2", "id3"...]
- angle: ["id1", "id2", "id3"] (angle defined by 3 points)

IMPORTANT:
1. Return ONLY valid JSON.
2. The JSON must have "elements" (array) and "explanation" (string).
3. "props" should be a simple dictionary (e.g. {"color": "red"}).
4. **DO NOT create abstract types** like 'var', 'variable', 'value', 'solve'. Only create VISUAL geometry elements.
5. If the user asks to "find x", DO NOT create an element for x. Just draw the known shape.
6. **Context Awareness:** If the prompt includes current point coordinates (e.g. "[Context...]"), RESPECT those coordinates. Use them as the base for new elements or modifications. Do not change existing point coordinates unless explicitly asked.
7. **Conversation Memory:** You have access to conversation history. If the user refers to "that shape", "it", "the circle", etc., understand the context from previous messages.

Example Output:
{
  "elements": [
    {
      "id": "p1", 
      "type": "point", 
      "parents": [0, 0], 
      "props": {"name": "A"}
    },
    {
      "id": "c1", 
      "type": "circle", 
      "parents": ["p1", 5], 
      "props": {"strokeColor": "red"}
    }
  ],
  "explanation": "Drawn a circle with radius 5 at (0,0)."
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
        
        # Map directly to response model
        final_elements = []
        for el in parsed.get("elements", []):
            final_elements.append(GeometryElement(
                id=el.get("id", "unknown"),
                type=el.get("type", "point"),
                parents=el.get("parents", []),
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
