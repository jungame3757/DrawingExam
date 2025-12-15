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

def process_graph_command(command):
    """
    그래프 명령 처리 메인 함수
    """
    try:
        intent = command.get('intent', '')
        data = command.get('data', {})
        
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
