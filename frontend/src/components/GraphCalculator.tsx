'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface GraphData {
  fn: string;
  color?: string;
  latex?: string;
  label?: string;
  original?: string;
}

interface Annotation {
  x: number;
  y: number;
  text: string;
}

interface GraphCalculatorProps {
  graphs: GraphData[];
  annotations?: Annotation[];
}

// Function Plot을 동적으로 로드
let functionPlot: any = null;

export default function GraphCalculator({ graphs, annotations = [] }: GraphCalculatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    if (!containerRef.current || !functionPlot || graphs.length === 0) return;

    try {
      setError(null);
      
      // 그래프 데이터 변환
      const data = graphs
        .filter(g => g.fn && !g.fn.includes('error'))
        .map((g, index) => ({
          fn: g.fn,
          color: g.color || ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6'][index % 5],
          graphType: 'polyline' as const,
          skipTip: false
        }));

      if (data.length === 0) {
        setError('유효한 그래프가 없습니다');
        return;
      }

      // 컨테이너 크기
      const width = containerRef.current.clientWidth || 600;
      const height = containerRef.current.clientHeight || 400;

      // Function Plot 렌더링
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
      if (functionPlot && graphs.length > 0) {
        renderGraph();
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [graphs, renderGraph]);

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
      {/* 그래프 범례 */}
      {graphs.length > 0 && (
        <div className="p-3 bg-white border-b flex flex-wrap gap-3">
          {graphs.map((g, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <div 
                className="w-4 h-1 rounded"
                style={{ backgroundColor: g.color || ['#3b82f6', '#ef4444', '#22c55e'][idx % 3] }}
              />
              <span className="font-mono text-gray-700">
                {g.latex ? (
                  <span dangerouslySetInnerHTML={{ __html: g.latex }} />
                ) : (
                  g.original || g.fn
                )}
              </span>
              {g.label && <span className="text-gray-500">({g.label})</span>}
            </div>
          ))}
        </div>
      )}

      {/* 그래프 캔버스 */}
      <div className="flex-1 relative bg-white">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-red-500">
            <div className="text-center">
              <p className="text-lg">⚠️ {error}</p>
              <p className="text-sm text-gray-500 mt-2">수식을 확인해주세요</p>
            </div>
          </div>
        ) : graphs.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
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

