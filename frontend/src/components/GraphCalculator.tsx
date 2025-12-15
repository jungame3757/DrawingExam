'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// MathInput을 동적으로 import (SSR 비활성화)
const MathInput = dynamic(() => import('./MathInput'), { 
  ssr: false,
  loading: () => <span className="text-gray-400 text-sm">...</span>
});

export interface GraphData {
  id: string;
  fn: string;           // Function Plot용 (예: "sin(x)^2")
  sympy: string;        // SymPy 원본 (예: "sin(x)**2")  
  latex: string;        // LaTeX 표시용 (예: "\\sin^{2}{\\left(x \\right)}")
  color: string;
  label?: string;
  visible: boolean;
}

interface Annotation {
  x: number;
  y: number;
  text: string;
}

interface GraphCalculatorProps {
  graphs: GraphData[];
  annotations?: Annotation[];
  onGraphUpdate?: (id: string, newSympy: string) => void;
  onGraphDelete?: (id: string) => void;
  onGraphToggle?: (id: string) => void;
}

// Function Plot을 동적으로 로드
let functionPlot: any = null;

export default function GraphCalculator({ 
  graphs, 
  annotations = [],
  onGraphUpdate,
  onGraphDelete,
  onGraphToggle
}: GraphCalculatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Function Plot 동적 로드
  useEffect(() => {
    if (typeof window !== 'undefined' && !functionPlot) {
      import('function-plot').then((module) => {
        functionPlot = module.default;
        setIsLoading(false);
      }).catch((err) => {
        console.error('Failed to load function-plot:', err);
        setError('그래프 라이브러리 로드 실패');
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  // 그래프 렌더링
  const renderGraph = useCallback(() => {
    if (!containerRef.current || !functionPlot) return;

    const visibleGraphs = graphs.filter(g => g.visible && g.fn && !g.fn.includes('error'));
    
    if (visibleGraphs.length === 0) {
      // 빈 그래프 표시
      try {
        functionPlot({
          target: containerRef.current,
          width: containerRef.current.clientWidth || 600,
          height: containerRef.current.clientHeight || 400,
          yAxis: { domain: [-10, 10] },
          xAxis: { domain: [-10, 10] },
          grid: true,
          data: []
        });
      } catch (e) {
        // ignore
      }
      return;
    }

    try {
      setError(null);
      
      const data = visibleGraphs.map((g) => ({
        fn: g.fn,
        color: g.color,
        graphType: 'polyline' as const,
        skipTip: false
      }));

      const width = containerRef.current.clientWidth || 600;
      const height = containerRef.current.clientHeight || 400;

      functionPlot({
        target: containerRef.current,
        width,
        height,
        yAxis: { domain: [-10, 10] },
        xAxis: { domain: [-10, 10] },
        grid: true,
        data,
        annotations: annotations.map(a => ({
          x: a.x,
          text: a.text
        }))
      });

    } catch (err: any) {
      console.error('Graph render error:', err);
      setError(`그래프 렌더링 오류: ${err.message}`);
    }
  }, [graphs, annotations]);

  // 그래프 렌더링 트리거
  useEffect(() => {
    if (!isLoading && functionPlot) {
      renderGraph();
    }
  }, [isLoading, renderGraph]);

  // 리사이즈 핸들러
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (functionPlot) {
        renderGraph();
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [renderGraph]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-500">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p>그래프 엔진 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* 수식 목록 (편집 가능) */}
      {graphs.length > 0 && (
        <div className="p-3 bg-white border-b space-y-2 max-h-48 overflow-y-auto">
          {graphs.map((g) => (
            <div 
              key={g.id} 
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                g.visible ? 'bg-gray-50' : 'bg-gray-100 opacity-60'
              }`}
            >
              {/* 색상 & 표시/숨기기 토글 */}
              <button
                onClick={() => onGraphToggle?.(g.id)}
                className="w-6 h-6 rounded-full border-2 flex-shrink-0 transition-transform hover:scale-110"
                style={{ 
                  backgroundColor: g.visible ? g.color : 'transparent',
                  borderColor: g.color 
                }}
                title={g.visible ? '숨기기' : '표시'}
              />

              {/* 수식 표시 (MathQuill) */}
              <div className="flex-1 min-w-0">
                {editingId === g.id ? (
                  <input
                    type="text"
                    defaultValue={g.sympy}
                    className="w-full px-2 py-1 border rounded text-sm font-mono"
                    autoFocus
                    onBlur={(e) => {
                      onGraphUpdate?.(g.id, e.target.value);
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onGraphUpdate?.(g.id, e.currentTarget.value);
                        setEditingId(null);
                      } else if (e.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                  />
                ) : (
                  <div 
                    className="cursor-pointer hover:bg-gray-100 rounded px-2 py-1"
                    onClick={() => setEditingId(g.id)}
                    title="클릭하여 편집"
                  >
                    <MathInput latex={g.latex} editable={false} />
                  </div>
                )}
              </div>

              {/* 라벨 */}
              {g.label && (
                <span className="text-xs text-gray-500 flex-shrink-0">
                  {g.label}
                </span>
              )}

              {/* 삭제 버튼 */}
              <button
                onClick={() => onGraphDelete?.(g.id)}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                title="삭제"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 그래프 캔버스 */}
      <div className="flex-1 relative bg-white">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-red-500 z-10 bg-white/80">
            <div className="text-center">
              <p className="text-lg">⚠️ {error}</p>
              <p className="text-sm text-gray-500 mt-2">수식을 확인해주세요</p>
            </div>
          </div>
        ) : graphs.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 z-10">
            <div className="text-center">
              <p className="text-6xl mb-4">📈</p>
              <p className="text-lg">그래프가 여기에 표시됩니다</p>
              <p className="text-sm mt-2">예: &quot;sin(x) 그래프 그려줘&quot;</p>
            </div>
          </div>
        ) : null}
        <div 
          ref={containerRef} 
          className="w-full h-full"
          style={{ minHeight: '300px' }}
        />
      </div>

      {/* 주석 표시 */}
      {annotations.length > 0 && (
        <div className="p-3 bg-gray-50 border-t">
          <div className="text-sm text-gray-600">
            <strong>포인트:</strong>{' '}
            {annotations.map((a, idx) => (
              <span key={idx} className="mr-3">
                {a.text} ({a.x.toFixed(2)}, {a.y.toFixed(2)})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
