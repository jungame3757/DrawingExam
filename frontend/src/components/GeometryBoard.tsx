'use client';

import React, { useEffect, useRef, useState } from 'react';

// JSXGraph 타입 정의
declare global {
  interface Window {
    JXG: any;
  }
}

export interface GeometryElement {
  id: string;
  type: 'polygon' | 'circle' | 'segment' | 'point';
  color: string;
  label?: string;
  visible: boolean;
  // polygon
  vertices?: [number, number][];
  name?: string;
  // circle
  center?: [number, number];
  radius?: number;
  // segment
  points?: [[number, number], [number, number]];
  // point
  coords?: [number, number];
}

interface GeometryBoardProps {
  elements: GeometryElement[];
  onElementUpdate?: (id: string, updates: Partial<GeometryElement>) => void;
  onElementDelete?: (id: string) => void;
  onElementToggle?: (id: string) => void;
}

export default function GeometryBoard({
  elements,
  onElementUpdate,
  onElementDelete,
  onElementToggle
}: GeometryBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // JSXGraph 스크립트 로드
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // CSS 로드
    if (!document.getElementById('jsxgraph-css')) {
      const link = document.createElement('link');
      link.id = 'jsxgraph-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/jsxgraph@1.8.0/distrib/jsxgraph.css';
      document.head.appendChild(link);
    }

    // JS 로드
    if (!window.JXG) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jsxgraph@1.8.0/distrib/jsxgraphcore.js';
      script.async = true;
      script.onload = () => {
        setIsLoading(false);
      };
      script.onerror = () => {
        setError('JSXGraph 로드 실패');
        setIsLoading(false);
      };
      document.body.appendChild(script);
    } else {
      setIsLoading(false);
    }
  }, []);

  // 보드 초기화 및 도형 렌더링
  useEffect(() => {
    if (isLoading || !containerRef.current || !window.JXG) return;

    try {
      // 기존 보드 제거
      if (boardRef.current) {
        window.JXG.JSXGraph.freeBoard(boardRef.current);
      }

      // 새 보드 생성
      boardRef.current = window.JXG.JSXGraph.initBoard(containerRef.current, {
        boundingbox: [-10, 10, 10, -10],
        axis: true,
        grid: true,
        keepaspectratio: true,
        showNavigation: true,
        showCopyright: false,
        pan: { enabled: true },
        zoom: { wheel: true, needShift: false }
      });

      const board = boardRef.current;

      // 도형 렌더링
      elements.forEach((el) => {
        if (!el.visible) return;

        try {
          if (el.type === 'polygon' && el.vertices) {
            // 다각형 (삼각형, 사각형 등)
            const points = el.vertices.map((v, idx) =>
              board.create('point', v, {
                name: '',
                size: 3,
                color: el.color,
                fixed: false
              })
            );
            
            board.create('polygon', points, {
              fillColor: el.color,
              fillOpacity: 0.2,
              strokeColor: el.color,
              strokeWidth: 2,
              hasInnerPoints: true
            });

            // 라벨 추가
            if (el.label && el.vertices.length > 0) {
              const centerX = el.vertices.reduce((sum, v) => sum + v[0], 0) / el.vertices.length;
              const centerY = el.vertices.reduce((sum, v) => sum + v[1], 0) / el.vertices.length;
              board.create('text', [centerX, centerY, el.label], {
                fontSize: 14,
                color: el.color
              });
            }
          } else if (el.type === 'circle' && el.center && el.radius) {
            // 원
            const center = board.create('point', el.center, {
              name: '',
              size: 3,
              color: el.color,
              fixed: false
            });
            
            board.create('circle', [center, el.radius], {
              strokeColor: el.color,
              strokeWidth: 2,
              fillColor: el.color,
              fillOpacity: 0.1
            });

            // 라벨
            if (el.label) {
              board.create('text', [el.center[0], el.center[1], el.label], {
                fontSize: 14,
                color: el.color
              });
            }
          } else if (el.type === 'segment' && el.points) {
            // 선분
            const p1 = board.create('point', el.points[0], {
              name: '',
              size: 3,
              color: el.color
            });
            const p2 = board.create('point', el.points[1], {
              name: '',
              size: 3,
              color: el.color
            });
            
            board.create('segment', [p1, p2], {
              strokeColor: el.color,
              strokeWidth: 2
            });
          } else if (el.type === 'point' && el.coords) {
            // 점
            board.create('point', el.coords, {
              name: el.label || '',
              size: 4,
              color: el.color
            });
          }
        } catch (err) {
          console.error(`Failed to render element ${el.id}:`, err);
        }
      });

      setError(null);
    } catch (err: any) {
      console.error('Board error:', err);
      setError(err.message);
    }

    return () => {
      if (boardRef.current && window.JXG) {
        try {
          window.JXG.JSXGraph.freeBoard(boardRef.current);
        } catch (e) {
          // ignore
        }
      }
    };
  }, [isLoading, elements]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-500">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p>기하학 엔진 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* 도형 목록 */}
      {elements.length > 0 && (
        <div className="p-3 bg-white border-b space-y-2 max-h-40 overflow-y-auto">
          {elements.map((el) => (
            <div
              key={el.id}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                el.visible ? 'bg-gray-50' : 'bg-gray-100 opacity-60'
              }`}
            >
              {/* 색상 & 토글 */}
              <button
                onClick={() => onElementToggle?.(el.id)}
                className="w-6 h-6 rounded-full border-2 flex-shrink-0 transition-transform hover:scale-110"
                style={{
                  backgroundColor: el.visible ? el.color : 'transparent',
                  borderColor: el.color
                }}
                title={el.visible ? '숨기기' : '표시'}
              />

              {/* 도형 정보 */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-700">
                  {el.label || el.name || el.type}
                </span>
                <span className="text-xs text-gray-400 ml-2">
                  {el.type === 'polygon' && el.vertices && `${el.vertices.length}각형`}
                  {el.type === 'circle' && el.radius && `r=${el.radius}`}
                  {el.type === 'point' && el.coords && `(${el.coords[0]}, ${el.coords[1]})`}
                </span>
              </div>

              {/* 삭제 버튼 */}
              <button
                onClick={() => onElementDelete?.(el.id)}
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

      {/* 캔버스 */}
      <div className="flex-1 relative bg-white">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-red-500 z-10 bg-white/80">
            <div className="text-center">
              <p className="text-lg">⚠️ {error}</p>
            </div>
          </div>
        ) : elements.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 z-10 pointer-events-none">
            <div className="text-center">
              <p className="text-6xl mb-4">📐</p>
              <p className="text-lg">도형이 여기에 표시됩니다</p>
              <p className="text-sm mt-2">예: &quot;정삼각형 그려줘&quot;, &quot;원 그려줘&quot;</p>
            </div>
          </div>
        ) : null}
        <div
          ref={containerRef}
          id="jsxgraph-box"
          className="w-full h-full"
          style={{ minHeight: '400px' }}
        />
      </div>
    </div>
  );
}
