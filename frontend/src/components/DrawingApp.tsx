'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { GeometryElement } from '@/types';
import { usePyodide } from '@/hooks/usePyodide';

// Dynamically import GeometryBoard with SSR disabled
const GeometryBoard = dynamic(() => import('@/components/GeometryBoard'), { 
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-400">Loading Geometry Engine...</div>
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type ComputeMode = 'server' | 'client' | 'auto';

export default function DrawingApp() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '안녕하세요! 무엇을 그려드릴까요? (예: "정삼각형을 그려줘", "반지름 5인 원")' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [elements, setElements] = useState<GeometryElement[]>([]);
  const [computeMode, setComputeMode] = useState<ComputeMode>('auto');
  
  // Pyodide 훅 (클라이언트 사이드 계산용)
  const { status: pyodideStatus, isReady: pyodideReady, calculate: pyodideCalculate } = usePyodide();

  const handleElementsUpdate = (updatedElements: GeometryElement[]) => {
    setElements(updatedElements);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // 현재 도형 컨텍스트 구성
      let fullPrompt = userMsg.content;
      
      const points = elements.filter(el => el.type === 'point');
      if (points.length > 0) {
        const coordsStr = points.map(p => {
          const x = typeof p.parents[0] === 'number' ? Number(p.parents[0]).toFixed(2) : '?';
          const y = typeof p.parents[1] === 'number' ? Number(p.parents[1]).toFixed(2) : '?';
          return `${p.props?.name || p.id}: [${x}, ${y}]`;
        }).join(', ');
        
        fullPrompt += `\n\n[Context: Current Geometry State]\n현재 점들: ${coordsStr}`;
      }

      // 서버에서 LLM 의도 파싱 및 좌표 계산
      const res = await fetch('http://localhost:8000/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: fullPrompt,
          history: messages.slice(1)
        }),
      });

      if (!res.ok) {
        throw new Error('API Request Failed');
      }

      const data = await res.json();
      
      // 도형 업데이트
      if (data.elements) {
        setElements(data.elements);
      }

      // 어시스턴트 메시지 추가
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

  // 클라이언트 사이드 계산 테스트 (Pyodide 준비 시)
  const handleClientCalculate = async (intent: string, data: Record<string, any>) => {
    if (!pyodideReady) {
      console.warn('Pyodide not ready');
      return null;
    }
    
    try {
      const result = await pyodideCalculate({ intent, data });
      return result;
    } catch (error) {
      console.error('Client calculation error:', error);
      return null;
    }
  };

  return (
    <main className="flex h-screen flex-col md:flex-row bg-gray-100 p-4 gap-4">
      {/* Left Panel: Chat Interface */}
      <div className="w-full md:w-1/3 flex flex-col bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="bg-indigo-600 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-white font-bold text-lg">AI Geometry Copilot</h1>
            <span className="text-xs text-indigo-200">v2.0</span>
          </div>
          {/* Pyodide 상태 표시 */}
          <div className="mt-2 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              pyodideStatus.status === 'ready' ? 'bg-green-400' :
              pyodideStatus.status === 'loading' ? 'bg-yellow-400 animate-pulse' :
              pyodideStatus.status === 'error' ? 'bg-red-400' : 'bg-gray-400'
            }`} />
            <span className="text-xs text-indigo-200">
              {pyodideStatus.status === 'ready' ? 'SymPy 엔진 준비됨' :
               pyodideStatus.status === 'loading' ? pyodideStatus.message :
               pyodideStatus.status === 'error' ? '엔진 오류' : '엔진 대기 중'}
            </span>
          </div>
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
              <div className="bg-gray-100 p-3 rounded-lg text-sm flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
                </div>
                <span className="text-gray-500">생성 중...</span>
              </div>
            </div>
          )}
        </div>

        {/* 예시 버튼 영역 */}
        <div className="px-4 py-2 border-t bg-gray-50">
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => setInput('정삼각형을 그려줘')}
              className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full hover:bg-indigo-200 transition-colors"
            >
              정삼각형
            </button>
            <button 
              onClick={() => setInput('반지름 5인 원을 그려줘')}
              className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full hover:bg-indigo-200 transition-colors"
            >
              원
            </button>
            <button 
              onClick={() => setInput('직각삼각형 밑변 4, 높이 3')}
              className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full hover:bg-indigo-200 transition-colors"
            >
              직각삼각형
            </button>
            <button 
              onClick={() => setInput('정사각형 한 변 4')}
              className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full hover:bg-indigo-200 transition-colors"
            >
              정사각형
            </button>
          </div>
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
