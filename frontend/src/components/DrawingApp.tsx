'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePyodide } from '@/hooks/usePyodide';
import { GraphData } from '@/components/GraphCalculator';

// Dynamically import GraphCalculator with SSR disabled
const GraphCalculator = dynamic(() => import('@/components/GraphCalculator'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-400">
      Loading Graph Engine...
    </div>
  )
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Annotation {
  x: number;
  y: number;
  text: string;
}

// 기본 색상 팔레트
const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

// 고유 ID 생성
let idCounter = 0;
const generateId = () => `graph_${Date.now()}_${idCounter++}`;

export default function DrawingApp() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '안녕하세요! 그래프를 그려드릴게요. 예: "sin(x) 그래프 그려줘", "x² 미분해줘"' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [graphs, setGraphs] = useState<GraphData[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  
  // Pyodide 훅 (SymPy 수식 변환용)
  const { status: pyodideStatus, isReady: pyodideReady, processGraphCommand, convert } = usePyodide();

  // 그래프 업데이트 (수식 편집)
  const handleGraphUpdate = useCallback(async (id: string, newSympy: string) => {
    if (!pyodideReady) return;
    
    try {
      const result = await convert(newSympy);
      if (result.success && result.jsCode) {
        setGraphs(prev => prev.map(g => 
          g.id === id 
            ? { ...g, sympy: newSympy, fn: result.jsCode!, latex: result.latex || newSympy }
            : g
        ));
      }
    } catch (error) {
      console.error('수식 변환 실패:', error);
    }
  }, [pyodideReady, convert]);

  // 그래프 삭제
  const handleGraphDelete = useCallback((id: string) => {
    setGraphs(prev => prev.filter(g => g.id !== id));
  }, []);

  // 그래프 표시/숨기기 토글
  const handleGraphToggle = useCallback((id: string) => {
    setGraphs(prev => prev.map(g => 
      g.id === id ? { ...g, visible: !g.visible } : g
    ));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // 1. 서버에서 LLM으로 사용자 의도 파싱
      const res = await fetch('http://localhost:8000/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: input,
          history: messages.slice(1)
        }),
      });

      if (!res.ok) {
        throw new Error('API Request Failed');
      }

      const llmCommand = await res.json();
      console.log('LLM Command:', llmCommand);

      // 2. Pyodide가 준비되면 브라우저에서 SymPy로 JS 코드 변환
      if (pyodideReady) {
        try {
          const result = await processGraphCommand(llmCommand);
          console.log('SymPy Result:', result);
          
          if (result.success && result.graphs.length > 0) {
            // 새 그래프 데이터 변환 (id, visible 추가)
            const newGraphs: GraphData[] = result.graphs.map((g: any, idx: number) => ({
              id: generateId(),
              fn: g.fn || g.jsCode,
              sympy: g.original || g.fn,
              latex: g.latex || g.fn,
              color: g.color || COLORS[idx % COLORS.length],
              label: g.label,
              visible: true
            }));
            
            setGraphs(newGraphs);
            setAnnotations(result.annotations || []);
            
            setMessages(prev => [...prev, { 
              role: 'assistant', 
              content: result.explanation || llmCommand.explanation || '그래프를 생성했습니다.'
            }]);
          } else {
            throw new Error(result.error || '그래프 생성 실패');
          }
        } catch (sympyError: any) {
          console.error('SymPy Error:', sympyError);
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `수식 처리 오류: ${sympyError.message}. SymPy 엔진이 준비될 때까지 기다려주세요.`
          }]);
        }
      } else {
        // Pyodide가 아직 준비되지 않은 경우 메시지만 표시
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `${llmCommand.explanation || '명령을 받았습니다.'} (SymPy 엔진 로딩 중...)`
        }]);
      }

    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `오류가 발생했습니다: ${error.message}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  // 수식 직접 추가
  const handleAddExpression = useCallback(async () => {
    if (!pyodideReady) return;
    
    const newSympy = 'x';
    try {
      const result = await convert(newSympy);
      if (result.success) {
        const newGraph: GraphData = {
          id: generateId(),
          fn: result.jsCode || newSympy,
          sympy: newSympy,
          latex: result.latex || newSympy,
          color: COLORS[graphs.length % COLORS.length],
          visible: true
        };
        setGraphs(prev => [...prev, newGraph]);
      }
    } catch (error) {
      console.error('수식 추가 실패:', error);
    }
  }, [pyodideReady, convert, graphs.length]);

  return (
    <main className="flex h-screen flex-col md:flex-row bg-gradient-to-br from-slate-900 to-slate-800 p-4 gap-4">
      {/* Left Panel: Chat Interface */}
      <div className="w-full md:w-1/3 flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-white font-bold text-xl">📊 Graph Calculator</h1>
            <span className="text-xs text-indigo-200 bg-indigo-500/30 px-2 py-1 rounded-full">AI Powered</span>
          </div>
          {/* SymPy 엔진 상태 표시 */}
          <div className="mt-3 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              pyodideStatus.status === 'ready' ? 'bg-green-400' :
              pyodideStatus.status === 'loading' ? 'bg-yellow-400 animate-pulse' :
              pyodideStatus.status === 'error' ? 'bg-red-400' : 'bg-gray-400'
            }`} />
            <span className="text-xs text-indigo-200">
              {pyodideStatus.status === 'ready' ? '✓ SymPy 엔진 준비됨' :
               pyodideStatus.status === 'loading' ? pyodideStatus.message :
               pyodideStatus.status === 'error' ? '엔진 오류' : '엔진 대기 중'}
            </span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-br-sm' 
                  : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white p-3 rounded-2xl text-sm flex items-center gap-2 shadow-sm border border-gray-100">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                  <span className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
                </div>
                <span className="text-gray-500">계산 중...</span>
              </div>
            </div>
          )}
        </div>

        {/* 예시 버튼 영역 */}
        <div className="px-4 py-3 border-t bg-white">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">예시:</p>
            <button
              onClick={handleAddExpression}
              disabled={!pyodideReady}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50"
            >
              + 수식 추가
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => setInput('sin(x) 그래프 그려줘')}
              className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full hover:bg-indigo-100 transition-colors font-medium"
            >
              sin(x)
            </button>
            <button 
              onClick={() => setInput('x² 그래프')}
              className="text-xs px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full hover:bg-purple-100 transition-colors font-medium"
            >
              x²
            </button>
            <button 
              onClick={() => setInput('sin(x) 미분해줘')}
              className="text-xs px-3 py-1.5 bg-pink-50 text-pink-700 rounded-full hover:bg-pink-100 transition-colors font-medium"
            >
              미분
            </button>
            <button 
              onClick={() => setInput('x² - 4 = 0 근 찾기')}
              className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-full hover:bg-green-100 transition-colors font-medium"
            >
              방정식
            </button>
            <button 
              onClick={() => setInput('exp(-x²) 그래프')}
              className="text-xs px-3 py-1.5 bg-orange-50 text-orange-700 rounded-full hover:bg-orange-100 transition-colors font-medium"
            >
              가우시안
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t bg-white flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="수식이나 명령을 입력하세요..."
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-800 bg-gray-50"
            disabled={loading}
          />
          <button 
            type="submit" 
            disabled={loading}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-2.5 rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 transition-all font-medium shadow-lg shadow-indigo-500/25"
          >
            실행
          </button>
        </form>
      </div>

      {/* Right Panel: Graph Canvas */}
      <div className="w-full md:w-2/3 bg-white rounded-2xl shadow-2xl overflow-hidden">
        <GraphCalculator 
          graphs={graphs}
          annotations={annotations}
          onGraphUpdate={handleGraphUpdate}
          onGraphDelete={handleGraphDelete}
          onGraphToggle={handleGraphToggle}
        />
      </div>
    </main>
  );
}
