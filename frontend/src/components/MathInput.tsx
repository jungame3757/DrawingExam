'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface MathInputProps {
  latex: string;
  onChange?: (latex: string) => void;
  onSubmit?: () => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
}

// MathQuill 타입 정의
declare global {
  interface Window {
    MathQuill: any;
  }
}

export default function MathInput({
  latex,
  onChange,
  onSubmit,
  editable = true,
  placeholder = '수식을 입력하세요...',
  className = ''
}: MathInputProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const mathFieldRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [localLatex, setLocalLatex] = useState(latex);

  // MathQuill 스크립트 로드
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // 이미 로드되어 있으면 스킵
    if (window.MathQuill) {
      setIsLoaded(true);
      return;
    }

    // jQuery 로드 (MathQuill 의존성)
    const jqueryScript = document.createElement('script');
    jqueryScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js';
    jqueryScript.async = true;
    
    jqueryScript.onload = () => {
      // MathQuill CSS 로드
      const mqCss = document.createElement('link');
      mqCss.rel = 'stylesheet';
      mqCss.href = 'https://cdnjs.cloudflare.com/ajax/libs/mathquill/0.10.1/mathquill.min.css';
      document.head.appendChild(mqCss);

      // MathQuill JS 로드
      const mqScript = document.createElement('script');
      mqScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathquill/0.10.1/mathquill.min.js';
      mqScript.async = true;
      mqScript.onload = () => {
        setIsLoaded(true);
      };
      document.head.appendChild(mqScript);
    };

    document.head.appendChild(jqueryScript);
  }, []);

  // MathQuill 필드 초기화
  useEffect(() => {
    if (!isLoaded || !containerRef.current || !window.MathQuill) return;

    const MQ = window.MathQuill.getInterface(2);
    
    if (editable) {
      mathFieldRef.current = MQ.MathField(containerRef.current, {
        spaceBehavesLikeTab: true,
        handlers: {
          edit: () => {
            if (mathFieldRef.current) {
              const newLatex = mathFieldRef.current.latex();
              setLocalLatex(newLatex);
              onChange?.(newLatex);
            }
          },
          enter: () => {
            onSubmit?.();
          }
        }
      });
    } else {
      mathFieldRef.current = MQ.StaticMath(containerRef.current);
    }

    // 초기값 설정
    if (latex && mathFieldRef.current) {
      mathFieldRef.current.latex(latex);
    }

    return () => {
      // 클린업
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      mathFieldRef.current = null;
    };
  }, [isLoaded, editable]);

  // 외부에서 latex prop 변경 시 업데이트
  useEffect(() => {
    if (mathFieldRef.current && latex !== localLatex) {
      mathFieldRef.current.latex(latex);
      setLocalLatex(latex);
    }
  }, [latex]);

  // 포커스 메서드
  const focus = useCallback(() => {
    if (mathFieldRef.current && editable) {
      mathFieldRef.current.focus();
    }
  }, [editable]);

  if (!isLoaded) {
    return (
      <div className={`inline-flex items-center px-3 py-2 bg-gray-100 rounded ${className}`}>
        <span className="text-gray-400 text-sm">수식 에디터 로딩...</span>
      </div>
    );
  }

  return (
    <span
      ref={containerRef}
      onClick={focus}
      className={`mathquill-field ${editable ? 'editable' : 'static'} ${className}`}
      style={{
        display: 'inline-block',
        minWidth: editable ? '200px' : 'auto',
        padding: editable ? '8px 12px' : '4px 8px',
        border: editable ? '2px solid #e5e7eb' : 'none',
        borderRadius: '8px',
        backgroundColor: editable ? 'white' : 'transparent',
        fontSize: '18px',
        cursor: editable ? 'text' : 'default',
        transition: 'border-color 0.2s',
      }}
    />
  );
}

// 정적 수식 표시용 컴포넌트
export function StaticMath({ latex, className = '' }: { latex: string; className?: string }) {
  return <MathInput latex={latex} editable={false} className={className} />;
}

