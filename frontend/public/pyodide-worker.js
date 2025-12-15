/**
 * Pyodide Web Worker - Graph Calculator Engine
 * SymPy를 사용하여 수식을 JavaScript 코드로 변환
 * 
 * 문서 설계: "LLM은 번역하고, 엔진은 계산한다"
 * - LLM → 수식 문자열 (예: "sin(x) + x**2")
 * - SymPy → JavaScript 코드 (예: "Math.sin(x) + Math.pow(x, 2)")
 * - Function Plot → 실시간 그래프 렌더링
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
  
  // SymPy 초기화 및 헬퍼 함수 정의
  await pyodide.runPythonAsync(`
import json
from sympy import *
from sympy.printing import jscode
from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application, convert_xor

# 파싱 변환 설정 (사용자 친화적 입력 지원)
transformations = standard_transformations + (implicit_multiplication_application, convert_xor)

def expr_to_js(expr_str):
    """
    수식 문자열을 Function Plot 호환 형식으로 변환
    Function Plot은 sin(x), cos(x), log(x) 등을 직접 지원
    거듭제곱은 ^ 사용 (예: x^2)
    """
    try:
        x = Symbol('x')
        # 사용자 친화적 파싱 (2x → 2*x, x^2 → x**2)
        expr = parse_expr(expr_str, local_dict={'x': x, 'e': E, 'pi': pi}, transformations=transformations)
        
        # Function Plot 호환 형식으로 변환
        # SymPy 표현식을 문자열로 변환 후 ** → ^ 로 치환
        expr_str_clean = str(expr)
        # ** 를 ^ 로 변환 (Function Plot 형식)
        fn_plot_expr = expr_str_clean.replace('**', '^')
        # exp(x)는 그대로 유지 (Function Plot이 exp() 지원)
        
        return json.dumps({
            'success': True,
            'jsCode': fn_plot_expr,
            'latex': latex(expr),
            'simplified': str(simplify(expr))
        })
    except Exception as e:
        return json.dumps({
            'success': False,
            'error': str(e)
        })

def differentiate(expr_str, order=1):
    """미분 계산"""
    try:
        x = Symbol('x')
        expr = parse_expr(expr_str, local_dict={'x': x, 'e': E, 'pi': pi}, transformations=transformations)
        result = diff(expr, x, order)
        
        # Function Plot 호환 형식 (exp는 그대로 유지)
        result_str = str(result).replace('**', '^')
        
        return json.dumps({
            'success': True,
            'jsCode': result_str,
            'latex': latex(result),
            'expression': str(result)
        })
    except Exception as e:
        return json.dumps({
            'success': False,
            'error': str(e)
        })

def integrate_expr(expr_str):
    """적분 계산"""
    try:
        x = Symbol('x')
        expr = parse_expr(expr_str, local_dict={'x': x, 'e': E, 'pi': pi}, transformations=transformations)
        result = integrate(expr, x)
        
        # Function Plot 호환 형식 (exp는 그대로 유지)
        result_str = str(result).replace('**', '^')
        
        return json.dumps({
            'success': True,
            'jsCode': result_str,
            'latex': latex(result),
            'expression': str(result)
        })
    except Exception as e:
        return json.dumps({
            'success': False,
            'error': str(e)
        })

def solve_equation(expr_str):
    """방정식 풀이 (= 0으로 가정)"""
    try:
        x = Symbol('x')
        expr = parse_expr(expr_str, local_dict={'x': x, 'e': E, 'pi': pi}, transformations=transformations)
        solutions = solve(expr, x)
        return json.dumps({
            'success': True,
            'solutions': [str(s) for s in solutions],
            'numeric': [complex(N(s)) if im(s) != 0 else float(N(s)) for s in solutions if N(s).is_number]
        })
    except Exception as e:
        return json.dumps({
            'success': False,
            'error': str(e)
        })

def find_critical_points(expr_str):
    """극값 찾기"""
    try:
        x = Symbol('x')
        expr = parse_expr(expr_str, local_dict={'x': x, 'e': E, 'pi': pi}, transformations=transformations)
        deriv = diff(expr, x)
        critical = solve(deriv, x)
        second_deriv = diff(deriv, x)
        
        points = []
        for cp in critical:
            if cp.is_real:
                y_val = float(N(expr.subs(x, cp)))
                second_val = N(second_deriv.subs(x, cp))
                point_type = "maximum" if second_val < 0 else "minimum" if second_val > 0 else "inflection"
                points.append({
                    'x': float(N(cp)),
                    'y': y_val,
                    'type': point_type
                })
        
        return json.dumps({
            'success': True,
            'points': points
        })
    except Exception as e:
        return json.dumps({
            'success': False,
            'error': str(e)
        })

def create_triangle(vertices_or_type, *args):
    """
    삼각형 생성
    - 정삼각형: create_triangle('equilateral', center, side_length)
    - 직각삼각형: create_triangle('right', origin, width, height)
    - 일반 삼각형: create_triangle([(x1,y1), (x2,y2), (x3,y3)])
    """
    from sympy.geometry import Point, Triangle, RegularPolygon
    import math
    
    try:
        if isinstance(vertices_or_type, str):
            if vertices_or_type == 'equilateral':
                # 정삼각형
                center = args[0] if args else (0, 0)
                side = args[1] if len(args) > 1 else 4
                cx, cy = center
                # 정삼각형 꼭짓점 계산
                h = side * math.sqrt(3) / 2
                vertices = [
                    (cx, cy + h * 2/3),           # 상단
                    (cx - side/2, cy - h/3),      # 좌하단
                    (cx + side/2, cy - h/3)       # 우하단
                ]
            elif vertices_or_type == 'right':
                # 직각삼각형
                origin = args[0] if args else (0, 0)
                width = args[1] if len(args) > 1 else 4
                height = args[2] if len(args) > 2 else 3
                ox, oy = origin
                vertices = [
                    (ox, oy),
                    (ox + width, oy),
                    (ox, oy + height)
                ]
            elif vertices_or_type == 'isosceles':
                # 이등변삼각형
                base_center = args[0] if args else (0, 0)
                base = args[1] if len(args) > 1 else 4
                height = args[2] if len(args) > 2 else 3
                cx, cy = base_center
                vertices = [
                    (cx, cy + height),
                    (cx - base/2, cy),
                    (cx + base/2, cy)
                ]
            else:
                vertices = [(0, 0), (4, 0), (2, 3)]  # 기본 삼각형
        else:
            vertices = vertices_or_type
        
        return {
            'type': 'polygon',
            'vertices': [list(v) for v in vertices],  # 튜플을 리스트로 변환
            'name': 'triangle'
        }
    except Exception as e:
        return {'error': str(e)}

def create_rectangle(center, width, height):
    """사각형 생성"""
    cx, cy = center
    hw, hh = width/2, height/2
    return {
        'type': 'polygon',
        'vertices': [
            [cx - hw, cy - hh],
            [cx + hw, cy - hh],
            [cx + hw, cy + hh],
            [cx - hw, cy + hh]
        ],
        'name': 'rectangle'
    }

def create_regular_polygon(center, n, radius):
    """정다각형 생성"""
    import math
    cx, cy = center
    vertices = []
    for i in range(n):
        angle = 2 * math.pi * i / n - math.pi / 2  # 상단에서 시작
        x = cx + radius * math.cos(angle)
        y = cy + radius * math.sin(angle)
        vertices.append([x, y])  # 리스트로 추가
    return {
        'type': 'polygon',
        'vertices': vertices,
        'name': f'regular_{n}gon'
    }

def create_circle(center, radius):
    """원 생성"""
    return {
        'type': 'circle',
        'center': list(center),  # 튜플을 리스트로 변환
        'radius': radius
    }

def create_line(point1, point2):
    """선분 생성"""
    return {
        'type': 'segment',
        'points': [list(point1), list(point2)]  # 튜플을 리스트로 변환
    }

def create_point(coords, name=None):
    """점 생성"""
    return {
        'type': 'point',
        'coords': list(coords),  # 튜플을 리스트로 변환
        'name': name
    }

def process_geometry_command(command):
    """
    기하학 명령 처리
    """
    try:
        intent = command.get('intent', '')
        data = command.get('data', {})
        
        result = {
            'success': True,
            'elements': [],
            'explanation': command.get('explanation', '')
        }
        
        if intent == 'draw_triangle':
            triangle_type = data.get('type', 'equilateral')
            center = tuple(data.get('center', [0, 0]))
            
            if triangle_type == 'equilateral':
                side = data.get('side', 4)
                tri = create_triangle('equilateral', center, side)
            elif triangle_type == 'right':
                width = data.get('width', 4)
                height = data.get('height', 3)
                tri = create_triangle('right', center, width, height)
            elif triangle_type == 'isosceles':
                base = data.get('base', 4)
                height = data.get('height', 3)
                tri = create_triangle('isosceles', center, base, height)
            else:
                vertices = data.get('vertices', [[0,0], [4,0], [2,3]])
                tri = create_triangle([(v[0], v[1]) for v in vertices])
            
            if 'error' not in tri:
                result['elements'].append({
                    **tri,
                    'color': data.get('color', '#3b82f6'),
                    'label': data.get('label', 'Triangle')
                })
            else:
                result['error'] = tri['error']
        
        elif intent == 'draw_rectangle':
            center = tuple(data.get('center', [0, 0]))
            width = data.get('width', 4)
            height = data.get('height', 3)
            rect = create_rectangle(center, width, height)
            result['elements'].append({
                **rect,
                'color': data.get('color', '#22c55e'),
                'label': data.get('label', 'Rectangle')
            })
        
        elif intent == 'draw_square':
            center = tuple(data.get('center', [0, 0]))
            side = data.get('side', 4)
            square = create_rectangle(center, side, side)
            result['elements'].append({
                **square,
                'color': data.get('color', '#8b5cf6'),
                'label': data.get('label', 'Square')
            })
        
        elif intent == 'draw_circle':
            center = tuple(data.get('center', [0, 0]))
            radius = data.get('radius', 3)
            circle = create_circle(center, radius)
            result['elements'].append({
                **circle,
                'color': data.get('color', '#ef4444'),
                'label': data.get('label', 'Circle')
            })
        
        elif intent == 'draw_polygon':
            n = data.get('sides', 5)
            center = tuple(data.get('center', [0, 0]))
            radius = data.get('radius', 3)
            poly = create_regular_polygon(center, n, radius)
            result['elements'].append({
                **poly,
                'color': data.get('color', '#f59e0b'),
                'label': data.get('label', f'정{n}각형')
            })
        
        elif intent == 'draw_line':
            point1 = tuple(data.get('point1', [0, 0]))
            point2 = tuple(data.get('point2', [4, 4]))
            line = create_line(point1, point2)
            result['elements'].append({
                **line,
                'color': data.get('color', '#6366f1'),
                'label': data.get('label', 'Line')
            })
        
        elif intent == 'draw_point':
            coords = tuple(data.get('coords', [0, 0]))
            name = data.get('name', 'P')
            point = create_point(coords, name)
            result['elements'].append({
                **point,
                'color': data.get('color', '#000000'),
                'label': name
            })
        
        elif intent == 'draw_multiple':
            # 여러 도형 동시 그리기
            shapes = data.get('shapes', [])
            for shape in shapes:
                shape_type = shape.get('type')
                if shape_type == 'triangle':
                    result['elements'].append(create_triangle('equilateral', tuple(shape.get('center', [0,0])), shape.get('side', 3)))
                elif shape_type == 'circle':
                    result['elements'].append(create_circle(tuple(shape.get('center', [0,0])), shape.get('radius', 2)))
                elif shape_type == 'rectangle':
                    result['elements'].append(create_rectangle(tuple(shape.get('center', [0,0])), shape.get('width', 3), shape.get('height', 2)))
        
        return json.dumps(result)
        
    except Exception as e:
        return json.dumps({
            'success': False,
            'error': str(e),
            'elements': []
        })

def process_graph_command(command):
    """
    그래프 명령 처리 메인 함수
    """
    try:
        intent = command.get('intent', '')
        data = command.get('data', {})
        
        # 기하학 intent는 별도 함수로 처리
        geometry_intents = ['draw_triangle', 'draw_rectangle', 'draw_square', 
                          'draw_circle', 'draw_polygon', 'draw_line', 
                          'draw_point', 'draw_multiple']
        if intent in geometry_intents:
            return process_geometry_command(command)
        
        result = {
            'success': True,
            'graphs': [],
            'annotations': [],
            'explanation': command.get('explanation', '')
        }
        
        if intent == 'plot_function':
            expressions = data.get('expressions', [])
            colors = data.get('colors', ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6'])
            
            for i, expr_str in enumerate(expressions):
                converted = json.loads(expr_to_js(expr_str))
                if converted['success']:
                    result['graphs'].append({
                        'fn': converted['jsCode'],
                        'color': colors[i % len(colors)],
                        'latex': converted['latex'],
                        'original': expr_str
                    })
                else:
                    result['graphs'].append({
                        'error': converted['error'],
                        'original': expr_str
                    })
        
        elif intent == 'plot_derivative':
            expr_str = data.get('expression', '')
            order = data.get('order', 1)
            
            # 원본 함수
            original = json.loads(expr_to_js(expr_str))
            if original['success']:
                result['graphs'].append({
                    'fn': original['jsCode'],
                    'color': '#3b82f6',
                    'latex': original['latex'],
                    'label': 'f(x)'
                })
            
            # 도함수
            derivative = json.loads(differentiate(expr_str, order))
            if derivative['success']:
                label = "f'" if order == 1 else f"f^({order})"
                result['graphs'].append({
                    'fn': derivative['jsCode'],
                    'color': '#ef4444',
                    'latex': derivative['latex'],
                    'label': f"{label}(x)"
                })
                result['explanation'] = f"{expr_str}의 {order}차 도함수는 {derivative['expression']}입니다."
        
        elif intent == 'plot_integral':
            expr_str = data.get('expression', '')
            
            # 원본 함수
            original = json.loads(expr_to_js(expr_str))
            if original['success']:
                result['graphs'].append({
                    'fn': original['jsCode'],
                    'color': '#3b82f6',
                    'latex': original['latex'],
                    'label': 'f(x)'
                })
            
            # 부정적분
            integral = json.loads(integrate_expr(expr_str))
            if integral['success']:
                result['graphs'].append({
                    'fn': integral['jsCode'],
                    'color': '#22c55e',
                    'latex': integral['latex'],
                    'label': '∫f(x)dx'
                })
                result['explanation'] = f"{expr_str}의 부정적분은 {integral['expression']} + C입니다."
        
        elif intent == 'solve_and_plot':
            expr_str = data.get('expression', '')
            
            # 함수 그래프
            converted = json.loads(expr_to_js(expr_str))
            if converted['success']:
                result['graphs'].append({
                    'fn': converted['jsCode'],
                    'color': '#3b82f6',
                    'latex': converted['latex']
                })
            
            # 근 찾기
            solutions = json.loads(solve_equation(expr_str))
            if solutions['success']:
                for sol in solutions.get('numeric', []):
                    if isinstance(sol, (int, float)) and -100 < sol < 100:
                        result['annotations'].append({
                            'x': sol,
                            'y': 0,
                            'text': f'x = {sol:.4g}'
                        })
                result['explanation'] = f"방정식의 근: {', '.join(solutions['solutions'])}"
        
        elif intent == 'find_extrema':
            expr_str = data.get('expression', '')
            
            # 함수 그래프
            converted = json.loads(expr_to_js(expr_str))
            if converted['success']:
                result['graphs'].append({
                    'fn': converted['jsCode'],
                    'color': '#3b82f6',
                    'latex': converted['latex']
                })
            
            # 극값 찾기
            critical = json.loads(find_critical_points(expr_str))
            if critical['success']:
                for pt in critical['points']:
                    result['annotations'].append({
                        'x': pt['x'],
                        'y': pt['y'],
                        'text': f"{'극대' if pt['type'] == 'maximum' else '극소' if pt['type'] == 'minimum' else '변곡점'}"
                    })
                result['explanation'] = f"극값 포인트: {len(critical['points'])}개 발견"
        
        else:
            # 기본: 수식을 함수로 처리
            expr_str = data.get('expression', str(data))
            converted = json.loads(expr_to_js(expr_str))
            if converted['success']:
                result['graphs'].append({
                    'fn': converted['jsCode'],
                    'color': '#3b82f6',
                    'latex': converted['latex']
                })
        
        return json.dumps(result)
        
    except Exception as e:
        return json.dumps({
            'success': False,
            'error': str(e),
            'graphs': [],
            'annotations': []
        })
`);
  
  sympyLoaded = true;
  self.postMessage({ type: 'status', status: 'ready', message: 'SymPy 엔진 준비 완료!' });
  
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
    
    if (type === 'convert') {
      // 단순 수식 → JS 변환
      if (!pyodide || !sympyLoaded) {
        await initPyodide();
      }
      
      const resultJson = await pyodide.runPythonAsync(`
expr_to_js(${JSON.stringify(payload.expression)})
      `);
      
      self.postMessage({
        type: 'result',
        id: id,
        payload: JSON.parse(resultJson)
      });
    }
    
    if (type === 'process') {
      // 그래프 명령 처리
      if (!pyodide || !sympyLoaded) {
        await initPyodide();
      }
      
      const resultJson = await pyodide.runPythonAsync(`
process_graph_command(${JSON.stringify(payload)})
      `);
      
      self.postMessage({
        type: 'result',
        id: id,
        payload: JSON.parse(resultJson)
      });
    }
    
    if (type === 'differentiate') {
      if (!pyodide || !sympyLoaded) {
        await initPyodide();
      }
      
      const resultJson = await pyodide.runPythonAsync(`
differentiate(${JSON.stringify(payload.expression)}, ${payload.order || 1})
      `);
      
      self.postMessage({
        type: 'result',
        id: id,
        payload: JSON.parse(resultJson)
      });
    }
    
    if (type === 'integrate') {
      if (!pyodide || !sympyLoaded) {
        await initPyodide();
      }
      
      const resultJson = await pyodide.runPythonAsync(`
integrate_expr(${JSON.stringify(payload.expression)})
      `);
      
      self.postMessage({
        type: 'result',
        id: id,
        payload: JSON.parse(resultJson)
      });
    }

    if (type === 'geometry') {
      // 기하학 명령 처리
      if (!pyodide || !sympyLoaded) {
        await initPyodide();
      }
      
      const resultJson = await pyodide.runPythonAsync(`
process_geometry_command(${JSON.stringify(payload)})
      `);
      
      self.postMessage({
        type: 'result',
        id: id,
        payload: JSON.parse(resultJson)
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
