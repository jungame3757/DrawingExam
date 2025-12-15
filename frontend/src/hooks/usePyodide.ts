'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface PyodideStatus {
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
}

interface GraphData {
  fn: string;
  color?: string;
  latex?: string;
  label?: string;
  original?: string;
  error?: string;
}

interface Annotation {
  x: number;
  y: number;
  text: string;
}

interface GraphResult {
  success: boolean;
  graphs: GraphData[];
  annotations: Annotation[];
  explanation: string;
  error?: string;
}

interface GeometryElement {
  type: 'polygon' | 'circle' | 'segment' | 'point';
  color?: string;
  label?: string;
  vertices?: [number, number][];
  center?: [number, number];
  radius?: number;
  points?: [[number, number], [number, number]];
  coords?: [number, number];
  name?: string;
}

interface GeometryResult {
  success: boolean;
  elements: GeometryElement[];
  explanation: string;
  error?: string;
}

interface ConvertResult {
  success: boolean;
  jsCode?: string;
  latex?: string;
  simplified?: string;
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
    resolve: (value: any) => void;
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

  // 수식 → JS 코드 변환
  const convert = useCallback((expression: string): Promise<ConvertResult> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 타임아웃 설정 (30초)
      const timeout = setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id);
          reject(new Error('변환 시간 초과'));
        }
      }, 30000);

      pendingRequests.current.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      workerRef.current.postMessage({
        type: 'convert',
        id,
        payload: { expression }
      });
    });
  }, []);

  // 그래프 명령 처리
  const processGraphCommand = useCallback((command: {
    intent: string;
    data: Record<string, any>;
    explanation?: string;
  }): Promise<GraphResult> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const timeout = setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id);
          reject(new Error('처리 시간 초과'));
        }
      }, 30000);

      pendingRequests.current.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      workerRef.current.postMessage({
        type: 'process',
        id,
        payload: command
      });
    });
  }, []);

  // 미분 계산
  const differentiate = useCallback((expression: string, order: number = 1): Promise<ConvertResult> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const timeout = setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id);
          reject(new Error('계산 시간 초과'));
        }
      }, 30000);

      pendingRequests.current.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      workerRef.current.postMessage({
        type: 'differentiate',
        id,
        payload: { expression, order }
      });
    });
  }, []);

  // 적분 계산
  const integrate = useCallback((expression: string): Promise<ConvertResult> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const timeout = setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id);
          reject(new Error('계산 시간 초과'));
        }
      }, 30000);

      pendingRequests.current.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      workerRef.current.postMessage({
        type: 'integrate',
        id,
        payload: { expression }
      });
    });
  }, []);

  // 기하학 명령 처리
  const processGeometryCommand = useCallback((command: {
    intent: string;
    data: Record<string, any>;
    explanation?: string;
  }): Promise<GeometryResult> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const timeout = setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id);
          reject(new Error('처리 시간 초과'));
        }
      }, 30000);

      pendingRequests.current.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      workerRef.current.postMessage({
        type: 'geometry',
        id,
        payload: command
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
    convert,
    processGraphCommand,
    processGeometryCommand,
    differentiate,
    integrate,
    restart
  };
}
