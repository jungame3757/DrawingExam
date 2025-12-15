/**
 * Pyodide Web Worker
 * SymPy를 사용한 기하학 좌표 계산을 메인 스레드와 분리하여 실행
 */

let pyodide = null;
let sympyLoaded = false;

// Pyodide 초기화
async function initPyodide() {
  if (pyodide) return pyodide;
  
  self.postMessage({ type: 'status', status: 'loading', message: 'Pyodide 로딩 중...' });
  
  // Pyodide CDN에서 로드
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');
  
  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'
  });
  
  self.postMessage({ type: 'status', status: 'loading', message: 'SymPy 설치 중...' });
  
  // SymPy 설치
  await pyodide.loadPackage(['sympy', 'micropip']);
  
  // 기하학 계산 헬퍼 함수 정의
  await pyodide.runPythonAsync(`
import json
from sympy import *
from sympy.geometry import Point, Line, Circle, Triangle, Polygon, Segment
import math

def calculate_geometry(command):
    """
    기하학 명령을 받아 JSXGraph용 좌표를 계산
    """
    try:
        intent = command.get('intent', '')
        data = command.get('data', {})
        result = {'elements': [], 'explanation': ''}
        
        if intent == 'create_point':
            # 단순 점 생성
            x, y = data.get('x', 0), data.get('y', 0)
            name = data.get('name', 'P')
            result['elements'].append({
                'id': f'p{name}',
                'type': 'point',
                'parents': [float(x), float(y)],
                'props': {'name': name}
            })
            result['explanation'] = f'점 {name}({x}, {y})을 생성했습니다.'
            
        elif intent == 'create_triangle':
            triangle_type = data.get('type', 'general')
            base = float(data.get('base_length', 5))
            anchor = data.get('anchor', [0, 0])
            ax, ay = anchor[0], anchor[1]
            
            if triangle_type == 'equilateral':
                # 정삼각형: 모든 변의 길이가 같고, 모든 각이 60도
                height = float(base * math.sqrt(3) / 2)
                points = [
                    (ax, ay),                    # A
                    (ax + base, ay),             # B  
                    (ax + base/2, ay + height)   # C
                ]
                names = ['A', 'B', 'C']
                result['explanation'] = f'한 변의 길이가 {base}인 정삼각형을 그렸습니다.'
                
            elif triangle_type == 'isosceles':
                # 이등변삼각형
                height = float(data.get('height', base * 0.8))
                points = [
                    (ax, ay),
                    (ax + base, ay),
                    (ax + base/2, ay + height)
                ]
                names = ['A', 'B', 'C']
                result['explanation'] = f'밑변 {base}, 높이 {height}인 이등변삼각형을 그렸습니다.'
                
            elif triangle_type == 'right':
                # 직각삼각형
                height = float(data.get('height', base * 0.75))
                points = [
                    (ax, ay),           # A (직각)
                    (ax + base, ay),    # B
                    (ax, ay + height)   # C
                ]
                names = ['A', 'B', 'C']
                result['explanation'] = f'밑변 {base}, 높이 {height}인 직각삼각형을 그렸습니다. (A에서 직각)'
                
            else:  # general
                # 일반 삼각형 (약간 불규칙하게)
                points = [
                    (ax, ay),
                    (ax + base, ay),
                    (ax + base * 0.3, ay + base * 0.7)
                ]
                names = ['A', 'B', 'C']
                result['explanation'] = '일반 삼각형을 그렸습니다.'
            
            # 점 생성
            for i, (px, py) in enumerate(points):
                result['elements'].append({
                    'id': f'p{names[i]}',
                    'type': 'point',
                    'parents': [float(px), float(py)],
                    'props': {'name': names[i]}
                })
            
            # 선분 생성
            for i in range(3):
                j = (i + 1) % 3
                result['elements'].append({
                    'id': f's{names[i]}{names[j]}',
                    'type': 'segment',
                    'parents': [f'p{names[i]}', f'p{names[j]}'],
                    'props': {}
                })
                
        elif intent == 'create_circle':
            center = data.get('center', [0, 0])
            radius = float(data.get('radius', 3))
            name = data.get('name', 'O')
            
            # 중심점 생성
            result['elements'].append({
                'id': f'p{name}',
                'type': 'point',
                'parents': [float(center[0]), float(center[1])],
                'props': {'name': name}
            })
            
            # 원 생성
            result['elements'].append({
                'id': f'circle_{name}',
                'type': 'circle',
                'parents': [f'p{name}', radius],
                'props': {}
            })
            
            result['explanation'] = f'중심 ({center[0]}, {center[1]}), 반지름 {radius}인 원을 그렸습니다.'
            
        elif intent == 'create_polygon':
            vertices = data.get('vertices', [])
            names = data.get('names', [])
            
            if not names:
                names = [chr(65 + i) for i in range(len(vertices))]
            
            # 점 생성
            for i, vertex in enumerate(vertices):
                result['elements'].append({
                    'id': f'p{names[i]}',
                    'type': 'point',
                    'parents': [float(vertex[0]), float(vertex[1])],
                    'props': {'name': names[i]}
                })
            
            # 다각형 생성
            point_ids = [f'p{name}' for name in names]
            result['elements'].append({
                'id': 'polygon1',
                'type': 'polygon',
                'parents': point_ids,
                'props': {}
            })
            
            result['explanation'] = f'{len(vertices)}각형을 그렸습니다.'
            
        elif intent == 'create_rectangle':
            anchor = data.get('anchor', [0, 0])
            width = float(data.get('width', 4))
            height = float(data.get('height', 3))
            ax, ay = anchor[0], anchor[1]
            
            points = [
                (ax, ay),
                (ax + width, ay),
                (ax + width, ay + height),
                (ax, ay + height)
            ]
            names = ['A', 'B', 'C', 'D']
            
            for i, (px, py) in enumerate(points):
                result['elements'].append({
                    'id': f'p{names[i]}',
                    'type': 'point',
                    'parents': [float(px), float(py)],
                    'props': {'name': names[i]}
                })
            
            point_ids = [f'p{name}' for name in names]
            result['elements'].append({
                'id': 'rect1',
                'type': 'polygon',
                'parents': point_ids,
                'props': {}
            })
            
            result['explanation'] = f'가로 {width}, 세로 {height}인 직사각형을 그렸습니다.'
            
        elif intent == 'create_square':
            anchor = data.get('anchor', [0, 0])
            side = float(data.get('side', 4))
            ax, ay = anchor[0], anchor[1]
            
            points = [
                (ax, ay),
                (ax + side, ay),
                (ax + side, ay + side),
                (ax, ay + side)
            ]
            names = ['A', 'B', 'C', 'D']
            
            for i, (px, py) in enumerate(points):
                result['elements'].append({
                    'id': f'p{names[i]}',
                    'type': 'point',
                    'parents': [float(px), float(py)],
                    'props': {'name': names[i]}
                })
            
            point_ids = [f'p{name}' for name in names]
            result['elements'].append({
                'id': 'square1',
                'type': 'polygon',
                'parents': point_ids,
                'props': {}
            })
            
            result['explanation'] = f'한 변의 길이가 {side}인 정사각형을 그렸습니다.'
        
        elif intent == 'create_line':
            # 두 점을 지나는 직선
            p1 = data.get('point1', [0, 0])
            p2 = data.get('point2', [1, 1])
            
            result['elements'].append({
                'id': 'pP1',
                'type': 'point',
                'parents': [float(p1[0]), float(p1[1])],
                'props': {'name': 'P1'}
            })
            result['elements'].append({
                'id': 'pP2',
                'type': 'point',
                'parents': [float(p2[0]), float(p2[1])],
                'props': {'name': 'P2'}
            })
            result['elements'].append({
                'id': 'line1',
                'type': 'line',
                'parents': ['pP1', 'pP2'],
                'props': {}
            })
            
            result['explanation'] = f'점 ({p1[0]}, {p1[1]})과 ({p2[0]}, {p2[1]})을 지나는 직선을 그렸습니다.'
            
        elif intent == 'calculate_distance':
            p1 = Point(data['point1'][0], data['point1'][1])
            p2 = Point(data['point2'][0], data['point2'][1])
            distance = float(p1.distance(p2))
            result['value'] = distance
            result['explanation'] = f'두 점 사이의 거리는 {distance:.4f}입니다.'
            
        elif intent == 'calculate_midpoint':
            p1 = Point(data['point1'][0], data['point1'][1])
            p2 = Point(data['point2'][0], data['point2'][1])
            midpoint = p1.midpoint(p2)
            mx, my = float(midpoint.x), float(midpoint.y)
            
            result['elements'].append({
                'id': 'pM',
                'type': 'point',
                'parents': [mx, my],
                'props': {'name': 'M', 'color': 'red'}
            })
            result['explanation'] = f'중점 M({mx:.2f}, {my:.2f})을 표시했습니다.'
        
        else:
            result['explanation'] = f'알 수 없는 명령: {intent}'
            
        return json.dumps(result)
        
    except Exception as e:
        return json.dumps({
            'elements': [],
            'explanation': f'계산 오류: {str(e)}',
            'error': str(e)
        })
`);
  
  sympyLoaded = true;
  self.postMessage({ type: 'status', status: 'ready', message: 'SymPy 준비 완료!' });
  
  return pyodide;
}

// 메시지 핸들러
self.onmessage = async function(e) {
  const { type, payload, id } = e.data;
  
  try {
    if (type === 'init') {
      await initPyodide();
      return;
    }
    
    if (type === 'calculate') {
      if (!pyodide || !sympyLoaded) {
        await initPyodide();
      }
      
      // Python에서 기하학 계산 실행
      const commandJson = JSON.stringify(payload);
      const resultJson = await pyodide.runPythonAsync(`
calculate_geometry(${JSON.stringify(payload)})
      `);
      
      const result = JSON.parse(resultJson);
      
      self.postMessage({
        type: 'result',
        id: id,
        payload: result
      });
    }
    
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: id,
      error: error.message
    });
  }
};

// 즉시 초기화 시작
initPyodide().catch(err => {
  self.postMessage({ 
    type: 'status', 
    status: 'error', 
    message: `초기화 실패: ${err.message}` 
  });
});

