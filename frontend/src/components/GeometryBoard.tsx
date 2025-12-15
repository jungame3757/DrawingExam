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
  const isDraggingPoint = useRef(false);
  
  // Pan state
  const isPanning = useRef(false);
  const lastUserCoords = useRef<{ x: number; y: number } | null>(null);
  
  const [contextMenu, setContextMenu] = useState<ContextMenu>({
    visible: false,
    x: 0,
    y: 0,
    elementId: null,
    elementType: null
  });
  
  const [cursorStyle, setCursorStyle] = useState<'default' | 'grab' | 'grabbing'>('default');
  
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
        keepAspectRatio: true,
        pan: { 
          enabled: false
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

    // Check if click is on empty space (no element under mouse)
    const isClickOnEmptySpace = (e: any): boolean => {
      // Get all objects at mouse position
      const coords = board.getUsrCoordsOfMouse(e);
      const x = coords[0];
      const y = coords[1];
      
      // Check if any point is near the click position
      for (const el of Object.values(elementMap.current)) {
        if (el.elType === 'point' && JXG.exists(el)) {
          const dist = Math.sqrt(Math.pow(el.X() - x, 2) + Math.pow(el.Y() - y, 2));
          // Check if click is within point's clickable area (roughly 0.5 units in user coords)
          const bbox = board.getBoundingBox();
          const threshold = (bbox[2] - bbox[0]) / 40; // Adaptive threshold based on zoom
          if (dist < threshold) {
            return false;
          }
        }
      }
      return true;
    };

    // Pan on empty space drag
    board.on('down', (e: any) => {
      if (e.button === 2) return; // Ignore right click
      
      // Only start panning if clicking on empty space
      if (isClickOnEmptySpace(e)) {
        const coords = board.getUsrCoordsOfMouse(e);
        isPanning.current = true;
        lastUserCoords.current = { x: coords[0], y: coords[1] };
        setCursorStyle('grabbing');
      }
    });

    board.on('move', (e: any) => {
      if (!isPanning.current || !lastUserCoords.current) return;
      if (isDraggingPoint.current) return; // Don't pan while dragging a point
      
      const coords = board.getUsrCoordsOfMouse(e);
      const currentX = coords[0];
      const currentY = coords[1];
      
      const dx = currentX - lastUserCoords.current.x;
      const dy = currentY - lastUserCoords.current.y;
      
      const bbox = board.getBoundingBox();
      const newBbox = [
        bbox[0] - dx,
        bbox[1] - dy,
        bbox[2] - dx,
        bbox[3] - dy
      ];
      
      board.setBoundingBox(newBbox, true);
      
      const newCoords = board.getUsrCoordsOfMouse(e);
      lastUserCoords.current = { x: newCoords[0], y: newCoords[1] };
    });

    board.on('up', () => {
      isPanning.current = false;
      lastUserCoords.current = null;
      setCursorStyle('default');
    });

    board.on('out', () => {
      isPanning.current = false;
      lastUserCoords.current = null;
      setCursorStyle('default');
    });

    const resizeObserver = new ResizeObserver(() => {
        if (boardRef.current && containerRef.current) {
            boardRef.current.resizeContainer(
                containerRef.current.clientWidth || 500,
                containerRef.current.clientHeight || 500
            );
            boardRef.current.setBoundingBox(
              boardRef.current.getBoundingBox(),
              true
            );
        }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
        resizeObserver.disconnect();
    };
  }, []);

  // Helper function to create a single element
  const createElement = (board: JXG.Board, el: GeometryElement) => {
    try {
      if (!VALID_TYPES.includes(el.type)) {
        console.warn(`Skipping invalid type: ${el.type}`);
        return null;
      }

      // Check if already exists
      if (elementMap.current[el.id] && JXG.exists(elementMap.current[el.id])) {
        // UPDATE existing element
        const existingEl = elementMap.current[el.id];
        if (el.type === 'point' && !isDraggingPoint.current) {
          const x = el.parents[0];
          const y = el.parents[1];
          if (typeof x === 'number' && typeof y === 'number') {
            existingEl.setPosition(JXG.COORDS_BY_USER, [x, y]);
          }
        }
        return existingEl;
      }

      // Resolve parents - convert string IDs to JSXGraph objects
      const resolvedParents = el.parents.map(p => {
        if (typeof p === 'string') {
          const resolved = elementMap.current[p];
          if (!resolved) {
            console.warn(`Parent "${p}" not found for element ${el.id}`);
          }
          return resolved || p;
        }
        return p;
      });

      // Check if all string parents were resolved
      const hasUnresolvedParent = resolvedParents.some(
        p => typeof p === 'string'
      );
      if (hasUnresolvedParent) {
        console.error(`Cannot create ${el.id}: unresolved parents`, resolvedParents);
        return null;
      }

      // CREATE new element
      const { fixed, color, ...restProps } = el.props || {};
      
      const createOptions: any = { 
        name: el.props?.name || '', 
        withLabel: !!el.props?.name,
        ...restProps,
      };
      
      // Apply color prop to appropriate JSXGraph properties
      if (color) {
        createOptions.strokeColor = color;
        createOptions.fillColor = color;
      }
      
      // For points, make them draggable with custom styling
      if (el.type === 'point') {
        createOptions.fixed = false;
        createOptions.isDraggable = true;
        createOptions.size = 4;
        createOptions.fillColor = color || '#3b82f6';
        createOptions.strokeColor = color || '#1d4ed8';
        createOptions.highlightFillColor = '#60a5fa';
        createOptions.highlightStrokeColor = '#2563eb';
      }
      
      const newEl = board.create(el.type, resolvedParents, createOptions);
      elementMap.current[el.id] = newEl;

      // Attach click event for context menu (deletable elements)
      if (DELETABLE_TYPES.includes(el.type)) {
        newEl.on('down', (e: any) => {
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
        
        let lastTap = 0;
        newEl.on('up', (e: any) => {
          const now = Date.now();
          if (now - lastTap < 300 && !isDraggingPoint.current) {
            const rect = containerRef.current?.getBoundingClientRect();
            
            if (rect) {
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
          isDraggingPoint.current = true;
          isPanning.current = false;
          setCursorStyle('grabbing');
        });
        
        newEl.on('up', () => {
          if (isDraggingPoint.current) {
            isDraggingPoint.current = false;
            setCursorStyle('default');
            
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

      return newEl;
    } catch (err) {
      console.error(`Failed to create element ${el.id}:`, err);
      return null;
    }
  };

  // Draw Elements when they change
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    
    // Skip update if dragging point
    if (isDraggingPoint.current) return;

    console.log('Drawing elements:', elements.length);

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

    // 2. Sort elements by type priority: points first, then segments/lines, then others
    const typePriority: { [key: string]: number } = {
      'point': 0,
      'segment': 1,
      'line': 1,
      'circle': 2,
      'polygon': 2,
      'angle': 3,
      'sector': 3,
      'curve': 3,
      'text': 4,
      'image': 4
    };

    const sortedElements = [...elements].sort((a, b) => {
      const priorityA = typePriority[a.type] ?? 5;
      const priorityB = typePriority[b.type] ?? 5;
      return priorityA - priorityB;
    });

    // 3. Create elements in sorted order
    sortedElements.forEach(el => {
      createElement(board, el);
    });

    board.unsuspendUpdate();
    
    console.log('Elements in map:', Object.keys(elementMap.current));

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
      <div 
        ref={containerRef} 
        className="w-full h-full" 
        style={{ 
          touchAction: 'none',
          cursor: cursorStyle
        }} 
      />
      
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
        💡 빈 공간 드래그: 이동 | 점 드래그: 점 이동 | 더블클릭/우클릭: 삭제 | 스크롤: 확대/축소
      </div>
    </div>
  );
}



