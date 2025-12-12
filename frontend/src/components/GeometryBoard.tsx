'use client';

import React, { useEffect, useRef, useState } from 'react';
import JXG from 'jsxgraph';
import { GeometryElement } from '@/types';

interface GeometryBoardProps {
  elements: GeometryElement[];
  onElementsUpdate?: (updatedElements: GeometryElement[]) => void;
}

interface ContextMenu {
  visible: boolean;
  x: number;
  y: number;
  elementId: string | null;
  elementType: string | null;
}

const VALID_TYPES = [
  'point', 'line', 'segment', 'circle', 'polygon', 
  'text', 'angle', 'sector', 'curve', 'image'
];

const DELETABLE_TYPES = ['point', 'segment', 'line', 'angle', 'circle', 'polygon'];

const TYPE_NAMES: { [key: string]: string } = {
  point: '점',
  segment: '선분',
  line: '직선',
  angle: '각도',
  circle: '원',
  polygon: '다각형'
};

export default function GeometryBoard({ elements, onElementsUpdate }: GeometryBoardProps) {
  const boardId = 'jxgbox';
  const boardRef = useRef<JXG.Board | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const elementMap = useRef<{ [key: string]: any }>({});
  const isDragging = useRef(false);
  
  const [contextMenu, setContextMenu] = useState<ContextMenu>({
    visible: false,
    x: 0,
    y: 0,
    elementId: null,
    elementType: null
  });
  
  // Use ref to keep track of current elements without triggering effect
  const currentElementsRef = useRef<GeometryElement[]>(elements);
  const onElementsUpdateRef = useRef(onElementsUpdate);
  
  useEffect(() => {
    currentElementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    onElementsUpdateRef.current = onElementsUpdate;
  }, [onElementsUpdate]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenu.visible) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible]);

  // Handle delete element
  const handleDelete = () => {
    if (!contextMenu.elementId || !onElementsUpdateRef.current) return;
    
    const elementToDelete = contextMenu.elementId;
    
    // Find elements that depend on this element (for cascading delete)
    const dependentIds = new Set<string>();
    dependentIds.add(elementToDelete);
    
    // Check for dependencies (elements that reference this element)
    currentElementsRef.current.forEach(el => {
      el.parents.forEach(parent => {
        if (typeof parent === 'string' && dependentIds.has(parent)) {
          dependentIds.add(el.id);
        }
      });
    });
    
    // Filter out deleted elements
    const updatedElements = currentElementsRef.current.filter(
      el => !dependentIds.has(el.id)
    );
    
    onElementsUpdateRef.current(updatedElements);
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  // Initialize Board - runs once
  useEffect(() => {
    if (!containerRef.current) return;
    if (boardRef.current) return;

    containerRef.current.innerHTML = '';
    
    const div = document.createElement('div');
    div.id = boardId;
    div.style.width = '100%';
    div.style.height = '100%';
    containerRef.current.appendChild(div);

    const board = JXG.JSXGraph.initBoard(boardId, { 
        boundingbox: [-10, 10, 10, -10], 
        axis: true,
        showCopyright: false,
        showNavigation: false,
        pan: { 
          enabled: true,
          needTwoFingers: true
        },
        zoom: { 
          factorX: 1.25, 
          factorY: 1.25, 
          wheel: true, 
          needShift: false, 
          min: 0.1, 
          max: 20.0
        }
    });

    boardRef.current = board;

    const resizeObserver = new ResizeObserver(() => {
        if (boardRef.current) {
            boardRef.current.resizeContainer(
                containerRef.current?.clientWidth || 500,
                containerRef.current?.clientHeight || 500
            );
        }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
        resizeObserver.disconnect();
    };
  }, []);

  // Draw Elements when they change
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    
    // Skip update if dragging
    if (isDragging.current) return;

    board.suspendUpdate();
    
    // Track which IDs are currently in the elements list
    const currentIds = new Set(elements.map(e => e.id));

    // 1. Remove elements that are no longer in the list
    Object.keys(elementMap.current).forEach(id => {
        if (!currentIds.has(id)) {
            const el = elementMap.current[id];
            if (JXG.exists(el)) board.removeObject(el);
            delete elementMap.current[id];
        }
    });

    // 2. Create or Update elements
    elements.forEach(el => {
        try {
            if (!VALID_TYPES.includes(el.type)) return;

            // Resolve parents
            const resolvedParents = el.parents.map(p => {
                if (typeof p === 'string' && elementMap.current[p]) {
                    return elementMap.current[p];
                }
                return p;
            });

            const existingEl = elementMap.current[el.id];

            if (existingEl && JXG.exists(existingEl)) {
                // UPDATE existing element - only update position if not dragging
                if (el.type === 'point' && !isDragging.current) {
                    if (typeof resolvedParents[0] === 'number' && typeof resolvedParents[1] === 'number') {
                        existingEl.setPosition(JXG.COORDS_BY_USER, resolvedParents as number[]);
                    }
                }
            } else {
                // CREATE new element
                const { fixed, ...restProps } = el.props || {};
                
                const createOptions: any = { 
                    name: el.props?.name || '', 
                    withLabel: !!el.props?.name,
                    ...restProps,
                };
                
                // For points, force draggable
                if (el.type === 'point') {
                    createOptions.fixed = false;
                    createOptions.isDraggable = true;
                    createOptions.size = 4;
                    createOptions.fillColor = '#3b82f6';
                    createOptions.strokeColor = '#1d4ed8';
                    createOptions.highlightFillColor = '#60a5fa';
                    createOptions.highlightStrokeColor = '#2563eb';
                }
                
                const newEl = board.create(el.type, resolvedParents, createOptions);
                
                elementMap.current[el.id] = newEl;

                // Attach click event for context menu (deletable elements)
                if (DELETABLE_TYPES.includes(el.type)) {
                    newEl.on('down', (e: any) => {
                        // Check for right click or long press
                        if (e && (e.button === 2 || e.type === 'contextmenu')) {
                            e.preventDefault?.();
                            e.stopPropagation?.();
                            
                            const rect = containerRef.current?.getBoundingClientRect();
                            if (rect) {
                                setContextMenu({
                                    visible: true,
                                    x: e.clientX - rect.left,
                                    y: e.clientY - rect.top,
                                    elementId: el.id,
                                    elementType: el.type
                                });
                            }
                        }
                    });
                    
                    // Also handle double-click for touch devices
                    let lastTap = 0;
                    newEl.on('up', (e: any) => {
                        const now = Date.now();
                        if (now - lastTap < 300 && !isDragging.current) {
                            // Double tap detected
                            const rect = containerRef.current?.getBoundingClientRect();
                            const coords = newEl.coords?.usrCoords || [0, 0, 0];
                            const screenCoords = board.getMousePosition(e) || [0, 0];
                            
                            if (rect) {
                                // Convert board coordinates to screen coordinates
                                const [sx, sy] = boardRef.current?.getCoordsTopLeftCorner() || [0, 0];
                                setContextMenu({
                                    visible: true,
                                    x: e?.clientX ? e.clientX - rect.left : rect.width / 2,
                                    y: e?.clientY ? e.clientY - rect.top : rect.height / 2,
                                    elementId: el.id,
                                    elementType: el.type
                                });
                            }
                        }
                        lastTap = now;
                    });
                }

                // Attach drag event listeners for points
                if (el.type === 'point') {
                    newEl.on('drag', () => {
                        isDragging.current = true;
                    });
                    
                    newEl.on('up', () => {
                        if (isDragging.current) {
                            isDragging.current = false;
                            
                            if (onElementsUpdateRef.current) {
                                const updatedElements = currentElementsRef.current.map(orig => {
                                    const jxgEl = elementMap.current[orig.id];
                                    if (orig.type === 'point' && jxgEl) {
                                        return { 
                                            ...orig, 
                                            parents: [jxgEl.X(), jxgEl.Y()] 
                                        };
                                    }
                                    return orig;
                                });
                                onElementsUpdateRef.current(updatedElements);
                            }
                        }
                    });
                }
            }
        } catch (err) {
            console.error(`Failed to handle element ${el.id}:`, err);
        }
    });

    board.unsuspendUpdate();

  }, [elements]);

  // Prevent default context menu on the board
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    
    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  return (
    <div className="w-full h-full bg-gray-50 border rounded-lg shadow-inner overflow-hidden relative">
      <div ref={containerRef} className="w-full h-full" style={{ touchAction: 'none' }} />
      
      {/* Context Menu Popup */}
      {contextMenu.visible && (
        <div 
          className="absolute bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[120px]"
          style={{ 
            left: contextMenu.x, 
            top: contextMenu.y,
            transform: 'translate(-50%, -100%)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-100">
            {TYPE_NAMES[contextMenu.elementType || ''] || contextMenu.elementType}
          </div>
          <button
            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
            onClick={handleDelete}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            삭제
          </button>
        </div>
      )}
      
      {/* Help text */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-400 bg-white/80 px-2 py-1 rounded">
        💡 더블클릭 또는 우클릭으로 삭제
      </div>
    </div>
  );
}
