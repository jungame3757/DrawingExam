'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { GeometryElement } from '@/types';

// Dynamically import GeometryBoard with SSR disabled
const GeometryBoard = dynamic(() => import('@/components/GeometryBoard'), { 
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-400">Loading Geometry Engine...</div>
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function DrawingApp() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '안녕하세요! 무엇을 그려드릴까요? (예: "반지름이 5인 원을 그려줘")' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [elements, setElements] = useState<GeometryElement[]>([]);

  const handleElementsUpdate = (updatedElements: GeometryElement[]) => {
    setElements(updatedElements);
    // Optional: Log to verify coordinates are updating
    // console.log('Elements updated:', updatedElements);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Construct prompt with current context if points exist
      let fullPrompt = userMsg.content;
      
      const points = elements.filter(el => el.type === 'point');
      if (points.length > 0) {
        const coordsStr = points.map(p => {
          const x = typeof p.parents[0] === 'number' ? Number(p.parents[0]).toFixed(2) : '?';
          const y = typeof p.parents[1] === 'number' ? Number(p.parents[1]).toFixed(2) : '?';
          return `${p.props?.name || p.id}: [${x}, ${y}]`;
        }).join(', ');
        
        fullPrompt += `\n\n[Context: Current Geometry State]\nThe user has modified the shape. Use these coordinates as the ground truth for any existing points:\n${coordsStr}`;
      }

      const res = await fetch('http://localhost:8000/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: fullPrompt,
          history: messages.slice(1) // Exclude initial greeting, send conversation history
        }),
      });

      if (!res.ok) {
        throw new Error('API Request Failed');
      }

      const data = await res.json();
      
      // Update elements to draw
      if (data.elements) {
        setElements(data.elements);
      }

      // Add assistant message
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.explanation || '도형을 생성했습니다.' 
      }]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'assistant', content: '오류가 발생했습니다. 다시 시도해주세요.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex h-screen flex-col md:flex-row bg-gray-100 p-4 gap-4">
      {/* Left Panel: Chat Interface */}
      <div className="w-full md:w-1/3 flex flex-col bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="bg-indigo-600 p-4">
          <h1 className="text-white font-bold text-lg">AI Geometry Copilot</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                msg.role === 'user' 
                  ? 'bg-indigo-500 text-white rounded-br-none' 
                  : 'bg-gray-100 text-gray-800 rounded-bl-none'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 p-3 rounded-lg text-sm animate-pulse">
                생성 중...
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t bg-gray-50 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="도형을 설명해주세요..."
            className="flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 text-black"
            disabled={loading}
          />
          <button 
            type="submit" 
            disabled={loading}
            className="bg-indigo-600 text-white px-6 py-2 rounded-full hover:bg-indigo-700 disabled:bg-gray-400 transition-colors font-medium"
          >
            전송
          </button>
        </form>
      </div>

      {/* Right Panel: Geometry Board */}
      <div className="w-full md:w-2/3 bg-white rounded-xl shadow-lg overflow-hidden p-2">
        <GeometryBoard 
          elements={elements} 
          onElementsUpdate={handleElementsUpdate}
        />
      </div>
    </main>
  );
}
