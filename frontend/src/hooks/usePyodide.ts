'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { GeometryElement } from '@/types';

interface PyodideStatus {
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
}

interface GeometryCommand {
  intent: string;
  data: Record<string, any>;
}

interface GeometryResult {
  elements: GeometryElement[];
  explanation: string;
  value?: number;
  error?: string;
}

export function usePyodide() {
  const [status, setStatus] = useState<PyodideStatus>({ 
    status: 'idle', 
    message: '대기 중...' 
  });
  const [isReady, setIsReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, {
    resolve: (value: GeometryResult) => void;
    reject: (error: Error) => void;
  }>>(new Map());

  // 워커 초기화
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const worker = new Worker('/pyodide-worker.js');
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, id, payload, error, status: workerStatus, message } = e.data;

      if (type === 'status') {
        setStatus({ status: workerStatus, message });
        if (workerStatus === 'ready') {
          setIsReady(true);
        }
      } else if (type === 'result') {
        const pending = pendingRequests.current.get(id);
        if (pending) {
          pending.resolve(payload);
          pendingRequests.current.delete(id);
        }
      } else if (type === 'error') {
        const pending = pendingRequests.current.get(id);
        if (pending) {
          pending.reject(new Error(error));
          pendingRequests.current.delete(id);
        }
      }
    };

    worker.onerror = (error) => {
      console.error('Worker error:', error);
      setStatus({ status: 'error', message: `워커 오류: ${error.message}` });
    };

    // 초기화 시작
    worker.postMessage({ type: 'init' });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // 기하학 계산 실행
  const calculate = useCallback((command: GeometryCommand): Promise<GeometryResult> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      pendingRequests.current.set(id, { resolve, reject });

      // 타임아웃 설정 (30초)
      const timeout = setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id);
          reject(new Error('계산 시간 초과'));
        }
      }, 30000);

      workerRef.current.postMessage({
        type: 'calculate',
        id,
        payload: command
      });

      // 성공/실패 시 타임아웃 클리어
      const originalResolve = resolve;
      const originalReject = reject;
      
      pendingRequests.current.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          originalResolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          originalReject(error);
        }
      });
    });
  }, []);

  // 워커 강제 종료 및 재시작
  const restart = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }
    
    setIsReady(false);
    setStatus({ status: 'loading', message: '재시작 중...' });
    
    const worker = new Worker('/pyodide-worker.js');
    workerRef.current = worker;
    
    worker.onmessage = (e) => {
      const { type, status: workerStatus, message } = e.data;
      if (type === 'status') {
        setStatus({ status: workerStatus, message });
        if (workerStatus === 'ready') {
          setIsReady(true);
        }
      }
    };
    
    worker.postMessage({ type: 'init' });
  }, []);

  return {
    status,
    isReady,
    calculate,
    restart
  };
}

