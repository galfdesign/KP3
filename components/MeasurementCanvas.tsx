import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eraser,
  HelpCircle,
  MousePointer2,
  PenTool,
  Plus,
  Ruler,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { MeasureMode, MeasurementData, Point } from '../types';

interface MeasurementCanvasProps {
  imageSrc: string;
  onAreaChanged: (area: number) => void;
  onFinish?: () => void;
}

// Интерактивный холст для замера площади поверх изображения
const MeasurementCanvas: React.FC<MeasurementCanvasProps> = ({ imageSrc, onAreaChanged, onFinish }) => {
  const [mode, setMode] = useState<MeasureMode>(MeasureMode.NONE);
  const [scalePoints, setScalePoints] = useState<Point[]>([]);
  const [polygons, setPolygons] = useState<Point[][]>([]); // Массив всех завершенных полигонов
  const [currentPolygon, setCurrentPolygon] = useState<Point[]>([]); // Текущий рисуемый полигон
  const [realScaleLength, setRealScaleLength] = useState<number>(0); // в миллиметрах, 0 означает что масштаб не задан
  const [measurementData, setMeasurementData] = useState<MeasurementData>({
    scalePixels: 0,
    scaleRealLength: 1,
    areaM2: 0,
  });

  // Модальное окно для задания масштаба
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [scaleDistance, setScaleDistance] = useState<string>('1000');
  const [scaleUnit, setScaleUnit] = useState<'mm' | 'cm' | 'm'>('mm');
  
  // Модальное окно с подсказками по горячим клавишам
  const [showHelpModal, setShowHelpModal] = useState(false);

  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1); // Синхронная ссылка на zoom для избежания задержек
  const zoomUpdateTimeoutRef = useRef<number | null>(null); // Для throttling обновлений zoom
  const contentRef = useRef<HTMLDivElement>(null); // Ref для div с transform
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScaleReady = scalePoints.length === 2 && realScaleLength > 0;
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isMiddleMouseDown, setIsMiddleMouseDown] = useState(false);
  const [isHoveringFirstPoint, setIsHoveringFirstPoint] = useState(false);
  const [isPolygonClosed, setIsPolygonClosed] = useState(false);
  const [currentPolygonIndex, setCurrentPolygonIndex] = useState<number | null>(null); // Индекс редактируемого полигона
  const [canAddNewPolygon, setCanAddNewPolygon] = useState(false); // Флаг разрешения создания нового полигона
  const [hasPanned, setHasPanned] = useState(false); // Флаг, что было панорамирование
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null); // Индекс перетаскиваемой точки
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null); // Индекс наведенной точки
  const panStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  // Синхронизируем zoomRef с zoom при изменении (используем useLayoutEffect для синхронного обновления)
  useLayoutEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Автоматическая установка режима в зависимости от состояния масштаба
  useEffect(() => {
    if (!isScaleReady && mode !== MeasureMode.SCALE) {
      setMode(MeasureMode.SCALE);
    } else if (isScaleReady && mode === MeasureMode.SCALE && currentPolygon.length === 0 && polygons.length === 0) {
      setMode(MeasureMode.POLYGON);
    }
  }, [isScaleReady, mode, currentPolygon.length, polygons.length]);

  // Показываем модалку когда указаны 2 точки масштаба, но масштаб еще не задан
  useEffect(() => {
    if (scalePoints.length === 2 && realScaleLength === 0 && !showScaleModal) {
      setShowScaleModal(true);
      // Устанавливаем значение по умолчанию - миллиметры
      setScaleDistance('1000');
      setScaleUnit('mm');
    }
  }, [scalePoints.length, realScaleLength]);

  const getCoords = (e: React.MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left + containerRef.current.scrollLeft;
    const relY = e.clientY - rect.top + containerRef.current.scrollTop;
    return { x: relX / zoomRef.current, y: relY / zoomRef.current };
  };

  const getSnappedCoords = (e: React.MouseEvent) => {
      const coords = getCoords(e);
    if (e.shiftKey && mode === MeasureMode.POLYGON && currentPolygon.length > 0) {
      const last = currentPolygon[currentPolygon.length - 1];
          const dx = Math.abs(coords.x - last.x);
          const dy = Math.abs(coords.y - last.y);
      return dx > dy ? { x: coords.x, y: last.y } : { x: last.x, y: coords.y };
      }
      return coords;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && panStart.current && containerRef.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      containerRef.current.scrollLeft = panStart.current.left - dx;
      containerRef.current.scrollTop = panStart.current.top - dy;
      setHasPanned(true); // Отмечаем, что было панорамирование
      return;
    }
    
    // Обработка перемещения при зажатом колесе мыши
    if (isMiddleMouseDown && panStart.current && containerRef.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      containerRef.current.scrollLeft = panStart.current.left - dx;
      containerRef.current.scrollTop = panStart.current.top - dy;
      setHasPanned(true);
      return;
    }
    
    // Перетаскивание точки полигона
    if (draggedPointIndex !== null && currentPolygonIndex !== null) {
      const coords = getSnappedCoords(e);
      if (currentPolygonIndex === -1) {
        // Редактируем текущий полигон
        const newPoly = [...currentPolygon];
        newPoly[draggedPointIndex] = coords;
        setCurrentPolygon(newPoly);
        updateCalculation(scalePoints, polygons, newPoly, realScaleLength);
      } else {
        // Редактируем завершенный полигон
        const newPolygons = [...polygons];
        newPolygons[currentPolygonIndex] = [...newPolygons[currentPolygonIndex]];
        newPolygons[currentPolygonIndex][draggedPointIndex] = coords;
        setPolygons(newPolygons);
        updateCalculation(scalePoints, newPolygons, currentPolygon, realScaleLength);
      }
      return;
    }
    
    // Не обновляем позицию мыши если пробел зажат
    if (isSpaceHeld) return;
    
    const coords = getSnappedCoords(e);
    setMousePos(coords);
    
    // Проверяем наведение на первую точку текущего полигона (для незамкнутого полигона)
    if (mode === MeasureMode.POLYGON && currentPolygon.length > 2 && !isPolygonClosed) {
      const firstPoint = currentPolygon[0];
      const distance = Math.hypot(coords.x - firstPoint.x, coords.y - firstPoint.y);
      // Радиус наведения - 15 пикселей (с учетом зума)
      setIsHoveringFirstPoint(distance < 15 / zoomRef.current);
    } else {
      setIsHoveringFirstPoint(false);
    }
    
    // Проверяем наведение на точки всех полигонов
    if (draggedPointIndex === null) {
      let foundHover = false;
      // Проверяем текущий полигон
      if (isPolygonClosed && currentPolygon.length > 0) {
        for (let i = 0; i < currentPolygon.length; i++) {
          const point = currentPolygon[i];
          const distance = Math.hypot(coords.x - point.x, coords.y - point.y);
          if (distance < 15 / zoomRef.current) {
            setHoveredPointIndex(i);
            setCurrentPolygonIndex(-1);
            foundHover = true;
            break;
          }
        }
      }
      // Проверяем завершенные полигоны
      if (!foundHover) {
        for (let polyIdx = 0; polyIdx < polygons.length; polyIdx++) {
          const poly = polygons[polyIdx];
          for (let i = 0; i < poly.length; i++) {
            const point = poly[i];
            const distance = Math.hypot(coords.x - point.x, coords.y - point.y);
            if (distance < 15 / zoomRef.current) {
              setHoveredPointIndex(i);
              setCurrentPolygonIndex(polyIdx);
              foundHover = true;
              break;
            }
          }
          if (foundHover) break;
        }
      }
      if (!foundHover) {
        setHoveredPointIndex(null);
        setCurrentPolygonIndex(null);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const current = containerRef.current;
    const content = contentRef.current;
    if (!current || !content) return;

    const rect = current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    
    // Используем zoomRef для получения актуального значения без задержек
    const currentZoom = zoomRef.current;
    
    // Получаем координаты точки под курсором в координатах изображения (без зума)
    const imageX = (cursorX + current.scrollLeft) / currentZoom;
    const imageY = (cursorY + current.scrollTop) / currentZoom;

    // Вычисляем новый zoom
        const delta = -e.deltaY * 0.001;
    const newZoom = Math.max(0.1, Math.min(5, currentZoom + delta));

    // Вычисляем новые позиции скролла так, чтобы точка под курсором осталась на месте
    const newScrollLeft = imageX * newZoom - cursorX;
    const newScrollTop = imageY * newZoom - cursorY;

    // Обновляем zoomRef синхронно
    zoomRef.current = newZoom;
    
    // Обновляем transform напрямую через DOM (без ре-рендера!)
    content.style.transform = `scale(${newZoom})`;
    
    // Обновляем скролл синхронно
    current.scrollLeft = newScrollLeft;
    current.scrollTop = newScrollTop;
    
    // Throttling обновления state для уменьшения ре-рендеров (только для SVG элементов)
    // Используем requestAnimationFrame для синхронизации с кадрами браузера
    if (zoomUpdateTimeoutRef.current === null) {
      zoomUpdateTimeoutRef.current = requestAnimationFrame(() => {
        setZoom(zoomRef.current);
        zoomUpdateTimeoutRef.current = null;
      });
    }
  };

  useEffect(() => {
    const current = containerRef.current;
    const preventDefaultWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    if (current) current.addEventListener('wheel', preventDefaultWheel, { passive: false });
    return () => {
        if (current) current.removeEventListener('wheel', preventDefaultWheel);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpaceHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpaceHeld(false);
        setIsPanning(false);
        panStart.current = null;
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Расчет площади одного полигона
  const calculatePolygonArea = (pPoints: Point[], ppm: number): number => {
    if (pPoints.length < 3 || ppm <= 0) return 0;
    let areaPx = 0;
      let j = pPoints.length - 1;
      for (let i = 0; i < pPoints.length; i++) {
        areaPx += (pPoints[j].x + pPoints[i].x) * (pPoints[j].y - pPoints[i].y);
        j = i;
      }
    areaPx = Math.abs(areaPx / 2);
    return areaPx / (ppm * ppm);
  };

  const updateCalculation = (sPoints: Point[], allPolygons: Point[][], currentPoly: Point[], realLen: number) => {
    let ppm = 0; // пикселей на метр
    if (sPoints.length === 2) {
      const dist = Math.hypot(sPoints[1].x - sPoints[0].x, sPoints[1].y - sPoints[0].y);
      // realLen в миллиметрах, переводим в метры: realLen / 1000
      const realLenMeters = realLen / 1000; // переводим мм в метры
      ppm = dist / realLenMeters; // пикселей на метр
    }

    // Суммируем площади всех завершенных полигонов
    let totalAreaM2 = 0;
    allPolygons.forEach(poly => {
      totalAreaM2 += calculatePolygonArea(poly, ppm);
    });
    
    // Добавляем площадь текущего полигона, если он замкнут
    if (isPolygonClosed && currentPoly.length > 2) {
      totalAreaM2 += calculatePolygonArea(currentPoly, ppm);
    }

    setMeasurementData({
      scalePixels: ppm * (realLen / 1000), // переводим в метры для отображения
      scaleRealLength: realLen,
      areaM2: totalAreaM2,
    });
    onAreaChanged(totalAreaM2);
  };

  // Конвертация значения в миллиметры
  const convertToMillimeters = (value: number, unit: 'mm' | 'cm' | 'm'): number => {
    switch (unit) {
      case 'mm':
        return value;
      case 'cm':
        return value * 10;
      case 'm':
        return value * 1000;
      default:
        return value;
    }
  };

  // Обработка установки масштаба из модалки
  const handleSetScale = () => {
    const numValue = parseFloat(scaleDistance);
    if (!isNaN(numValue) && numValue > 0) {
      const lengthInMm = convertToMillimeters(numValue, scaleUnit);
      setRealScaleLength(lengthInMm);
      updateCalculation(scalePoints, polygons, currentPolygon, lengthInMm);
      setShowScaleModal(false);
      // Автоматически разрешаем создание первого полигона
      if (polygons.length === 0 && currentPolygon.length === 0) {
        setMode(MeasureMode.POLYGON);
        setCanAddNewPolygon(true);
      }
    }
  };

  // Обработка отмены модалки
  const handleCancelScale = () => {
    setShowScaleModal(false);
    // Сбрасываем точки масштаба и масштаб при отмене
    setScalePoints([]);
    setRealScaleLength(0);
  };

  const handleClick = (e: React.MouseEvent) => {
    // Не ставим точку если идет панорамирование, пробел зажат или было панорамирование
    if (isPanning || isSpaceHeld || hasPanned) {
      setHasPanned(false); // Сбрасываем флаг после проверки
      return;
    }
    
    // Если был перетаскивание точки, не создаем новую точку
    if (draggedPointIndex !== null) {
      return;
    }
    
    const coords = getSnappedCoords(e);
    if (mode === MeasureMode.SCALE) {
      const next = scalePoints.length >= 2 ? [coords] : [...scalePoints, coords];
      setScalePoints(next);
      // Не вызываем updateCalculation здесь - ждем модалку
    } else if (mode === MeasureMode.POLYGON) {
      // Если нельзя добавлять новый полигон и текущий полигон пуст, не создаем точки
      if (!canAddNewPolygon && currentPolygon.length === 0) {
        return;
      }
      
      // Проверяем клик на первую точку для замыкания полигона
      if (currentPolygon.length > 2 && !isPolygonClosed) {
        const firstPoint = currentPolygon[0];
        const distance = Math.hypot(coords.x - firstPoint.x, coords.y - firstPoint.y);
        // Если клик близко к первой точке - замыкаем полигон и добавляем в массив
        if (distance < 15 / zoomRef.current) {
          setIsPolygonClosed(true);
          setIsHoveringFirstPoint(false);
          // Добавляем завершенный полигон в массив
          setPolygons([...polygons, [...currentPolygon]]);
          setCurrentPolygon([]);
          setIsPolygonClosed(false);
          setCanAddNewPolygon(false); // Блокируем создание нового полигона до нажатия кнопки
          // Обновляем расчет
          updateCalculation(scalePoints, [...polygons, currentPolygon], [], realScaleLength);
          return;
        }
      }
      // Если полигон уже замкнут, не добавляем новую точку - только перетаскивание
      if (isPolygonClosed) {
        return;
      } else {
        // Обычное добавление точки в текущий полигон
        const next = [...currentPolygon, coords];
        setCurrentPolygon(next);
        updateCalculation(scalePoints, polygons, next, realScaleLength);
      }
    }
  };

  const resetScale = () => {
    setScalePoints([]);
    setPolygons([]);
    setCurrentPolygon([]);
    setIsPolygonClosed(false);
    setRealScaleLength(0); // Сбрасываем масштаб
    setShowScaleModal(false);
    onAreaChanged(0);
    setMode(MeasureMode.SCALE);
    setMeasurementData({
      scalePixels: 0,
      scaleRealLength: 1,
      areaM2: 0,
    });
  };

  const resetPoly = () => {
    setScalePoints([]);
    setPolygons([]);
    setCurrentPolygon([]);
    setIsPolygonClosed(false);
    setCanAddNewPolygon(false);
    setRealScaleLength(0);
    setShowScaleModal(false);
    onAreaChanged(0);
    setMode(MeasureMode.SCALE);
    setMeasurementData({
      scalePixels: 0,
      scaleRealLength: 1,
      areaM2: 0,
    });
  };

  const undoLastPoint = () => {
    if (mode === MeasureMode.POLYGON && currentPolygon.length > 0) {
      if (isPolygonClosed) {
        // Если полигон замкнут, просто размыкаем его
        setIsPolygonClosed(false);
      } else {
        const newPoly = currentPolygon.slice(0, -1);
        setCurrentPolygon(newPoly);
        updateCalculation(scalePoints, polygons, newPoly, realScaleLength);
      }
    } else if (mode === MeasureMode.SCALE && scalePoints.length > 0) {
      const newScalePoints = scalePoints.slice(0, -1);
      setScalePoints(newScalePoints);
      updateCalculation(newScalePoints, polygons, currentPolygon, realScaleLength);
    }
  };
  
  const finishPoly = () => {
      setMode(MeasureMode.NONE);
    if (onFinish) onFinish();
  };

  // Добавление нового контура (полигона)
  const addNewPolygon = () => {
    // Если текущий полигон замкнут, добавляем его в массив
    if (isPolygonClosed && currentPolygon.length > 2) {
      setPolygons([...polygons, [...currentPolygon]]);
      setCurrentPolygon([]);
      setIsPolygonClosed(false);
    }
    // Разрешаем создание нового полигона
    setCanAddNewPolygon(true);
    setMode(MeasureMode.POLYGON);
    // Обновляем расчет
    updateCalculation(scalePoints, polygons, [], realScaleLength);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isPanning || isSpaceHeld || hasPanned) return;
    
    const coords = getSnappedCoords(e);
    
    // Проверяем все полигоны (завершенные и текущий)
    const allPolygons = [...polygons];
    if (isPolygonClosed && currentPolygon.length >= 3) {
      allPolygons.push(currentPolygon);
    }
    
    for (let polyIdx = 0; polyIdx < allPolygons.length; polyIdx++) {
      const poly = allPolygons[polyIdx];
      if (poly.length < 3) continue;
      
      // Проверяем двойной клик на существующую точку - удаляем её
      for (let i = 0; i < poly.length; i++) {
        const point = poly[i];
        const distance = Math.hypot(coords.x - point.x, coords.y - point.y);
        if (distance < 15 / zoomRef.current) {
          // Удаляем точку
          if (polyIdx === polygons.length) {
            // Редактируем текущий полигон
            const newPoly = poly.filter((_, idx) => idx !== i);
            if (newPoly.length >= 3) {
              setCurrentPolygon(newPoly);
              updateCalculation(scalePoints, polygons, newPoly, realScaleLength);
            }
          } else {
            // Редактируем завершенный полигон
            const newPolygons = [...polygons];
            newPolygons[polyIdx] = poly.filter((_, idx) => idx !== i);
            if (newPolygons[polyIdx].length >= 3) {
              setPolygons(newPolygons);
              updateCalculation(scalePoints, newPolygons, currentPolygon, realScaleLength);
            } else {
              // Удаляем полигон, если точек меньше 3
              newPolygons.splice(polyIdx, 1);
              setPolygons(newPolygons);
              updateCalculation(scalePoints, newPolygons, currentPolygon, realScaleLength);
            }
          }
          return;
        }
      }
      
      // Проверяем двойной клик на линию - добавляем точку
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        
        // Расстояние от точки до отрезка
        const A = coords.x - p1.x;
        const B = coords.y - p1.y;
        const C = p2.x - p1.x;
        const D = p2.y - p1.y;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) param = dot / lenSq;
        
        let xx, yy;
        if (param < 0) {
          xx = p1.x;
          yy = p1.y;
        } else if (param > 1) {
          xx = p2.x;
          yy = p2.y;
        } else {
          xx = p1.x + param * C;
          yy = p1.y + param * D;
        }
        
        const dx = coords.x - xx;
        const dy = coords.y - yy;
        const distance = Math.hypot(dx, dy);
        
        // Если клик близко к линии (в пределах 20 пикселей)
        if (distance < 20 / zoomRef.current && param >= 0 && param <= 1) {
          // Добавляем новую точку после точки i
          if (polyIdx === polygons.length) {
            // Редактируем текущий полигон
            const newPoly = [...poly];
            newPoly.splice(i + 1, 0, coords);
            setCurrentPolygon(newPoly);
            updateCalculation(scalePoints, polygons, newPoly, realScaleLength);
          } else {
            // Редактируем завершенный полигон
            const newPolygons = [...polygons];
            newPolygons[polyIdx] = [...poly];
            newPolygons[polyIdx].splice(i + 1, 0, coords);
            setPolygons(newPolygons);
            updateCalculation(scalePoints, newPolygons, currentPolygon, realScaleLength);
          }
          return;
        }
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Обработка средней кнопки мыши (колесо)
    if (e.button === 1) {
      e.preventDefault();
      if (containerRef.current) {
        setIsMiddleMouseDown(true);
        setIsPanning(true);
        panStart.current = {
          x: e.clientX,
          y: e.clientY,
          left: containerRef.current.scrollLeft,
          top: containerRef.current.scrollTop,
        };
      }
      return;
    }
    
    if (isSpaceHeld && containerRef.current) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        left: containerRef.current.scrollLeft,
        top: containerRef.current.scrollTop,
      };
      return;
    }
    
    // Проверяем нажатие на точку для начала перетаскивания во всех полигонах
    const coords = getSnappedCoords(e);

    // Проверяем текущий замкнутый полигон
    if (isPolygonClosed && currentPolygon.length > 0) {
      for (let i = 0; i < currentPolygon.length; i++) {
        const point = currentPolygon[i];
        const distance = Math.hypot(coords.x - point.x, coords.y - point.y);
        if (distance < 15 / zoomRef.current) {
          e.preventDefault(); // Предотвращаем перетаскивание изображения
          setDraggedPointIndex(i);
          setCurrentPolygonIndex(-1);
          return;
        }
      }
    }
    
    // Проверяем завершенные полигоны
    for (let polyIdx = 0; polyIdx < polygons.length; polyIdx++) {
      const poly = polygons[polyIdx];
      for (let i = 0; i < poly.length; i++) {
        const point = poly[i];
        const distance = Math.hypot(coords.x - point.x, coords.y - point.y);
        if (distance < 15 / zoomRef.current) {
          e.preventDefault(); // Предотвращаем перетаскивание изображения
          setDraggedPointIndex(i);
          setCurrentPolygonIndex(polyIdx);
          return;
        }
      }
    }
  };

  const handleMouseUp = (e?: React.MouseEvent) => {
    // Обработка отпускания средней кнопки мыши
    if (e && e.button === 1) {
      e.preventDefault();
      setIsMiddleMouseDown(false);
      setIsPanning(false);
      panStart.current = null;
      if (isPanning) {
        setTimeout(() => {
          setHasPanned(false);
        }, 100);
      }
      return;
    }
    
    // Завершаем перетаскивание точки
    if (draggedPointIndex !== null) {
      setDraggedPointIndex(null);
      return;
    }
    
    // Небольшая задержка перед сбросом флага панорамирования, чтобы клик не сработал
    if (isPanning && !isMiddleMouseDown) {
      setTimeout(() => {
        setHasPanned(false);
      }, 100);
    }
    if (!isMiddleMouseDown) {
      setIsPanning(false);
      panStart.current = null;
    }
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(5, zoomRef.current + 0.25);
    zoomRef.current = newZoom;
    setZoom(newZoom);
  };
  const handleZoomOut = () => {
    const newZoom = Math.max(0.1, zoomRef.current - 0.25);
    zoomRef.current = newZoom;
    setZoom(newZoom);
  };
  const handleResetZoom = () => {
    zoomRef.current = 1;
    setZoom(1);
  };

  const renderLine = (from: Point, to: Point, color: string, dash = '') => (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={color}
      strokeWidth={2}
      strokeDasharray={dash}
      vectorEffect="non-scaling-stroke"
    />
  );

  return (
    <div className="flex flex-col gap-4 relative">
      <div className="sticky top-[11.5rem] z-20 flex flex-col gap-2 transition-all">
          <div className="flex flex-wrap items-center gap-2 bg-slate-800/90 backdrop-blur-sm p-2 rounded-xl border border-slate-700 shadow-lg">
          <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700 flex-1">
            <button
              onClick={() => setMode(MeasureMode.SCALE)}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-sm transition ${
                !isScaleReady || mode === MeasureMode.SCALE ? 'bg-indigo-600 text-white' : 'text-slate-200 hover:bg-slate-700'
              }`}
            >
              <MousePointer2 className="w-4 h-4" />
              Масштаб
            </button>
            <button
              onClick={() => setMode(MeasureMode.POLYGON)}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-sm transition ${
                isScaleReady && (mode === MeasureMode.POLYGON || mode === MeasureMode.NONE) ? 'bg-emerald-600 text-white' : 'text-slate-200 hover:bg-slate-700'
              }`}
              disabled={!isScaleReady}
            >
              <PenTool className="w-4 h-4" />
              Полигон
            </button>
            <button
              onClick={undoLastPoint}
              disabled={(mode === MeasureMode.SCALE && scalePoints.length === 0) || (mode === MeasureMode.POLYGON && currentPolygon.length === 0)}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Undo2 className="w-4 h-4" />
              Отменить
            </button>
            <button
              onClick={addNewPolygon}
              disabled={!isScaleReady}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Добавить новый контур"
            >
              <Plus className="w-4 h-4" />
              Добавить контур
            </button>
            <button
              onClick={resetPoly}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm text-slate-200 hover:bg-slate-700"
            >
              <Eraser className="w-4 h-4" />
              Сброс
            </button>
            <button
              onClick={finishPoly}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm text-slate-200 hover:bg-slate-700"
            >
              <Check className="w-4 h-4" />
              Готово
            </button>
            <button
              onClick={() => setShowHelpModal(true)}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm text-slate-200 hover:bg-slate-700 ml-auto"
              title="Подсказки по горячим клавишам"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>

      <div
         className="relative border border-slate-700 rounded-xl bg-slate-900 overflow-hidden"
         style={{
           cursor: (isPanning || isMiddleMouseDown) ? 'grabbing' : (isSpaceHeld || isMiddleMouseDown) ? 'grab' : (mode === MeasureMode.POLYGON && !isPolygonClosed && currentPolygon.length > 0) ? 'crosshair' : (hoveredPointIndex !== null) ? 'move' : 'default',
         }}
      >
        <div
          ref={containerRef}
          className="relative overflow-auto max-h-[640px]"
          onClick={handleClick}
          onMouseMove={handleMouseMove}
           onMouseDown={handleMouseDown}
           onMouseUp={handleMouseUp}
           onMouseLeave={(e) => {
             handleMouseUp(e);
             setIsHoveringFirstPoint(false);
             setIsMiddleMouseDown(false);
           }}
          onAuxClick={(e) => {
            // Предотвращаем стандартное поведение средней кнопки мыши
            if (e.button === 1) {
              e.preventDefault();
            }
          }}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
        >
          <div
            ref={contentRef}
            className="relative origin-top-left"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', willChange: 'transform' }}
          >
            <img 
              src={imageSrc} 
              alt="План" 
              className="block max-w-full h-auto select-none pointer-events-none" 
              draggable="false"
              onDragStart={(e) => e.preventDefault()}
              style={{ userSelect: 'none', WebkitUserDrag: 'none' }}
            />
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ width: '100%', height: '100%' }}
            >
              {scalePoints.length === 1 && mousePos && renderLine(scalePoints[0], mousePos, '#38bdf8', '4 4')}
              {scalePoints.length === 2 && renderLine(scalePoints[0], scalePoints[1], '#38bdf8')}

              {/* Заливка всех завершенных полигонов */}
              {polygons.map((poly, polyIdx) => (
                poly.length > 2 && (
                  <polygon
                    key={`polygon-fill-${polyIdx}`}
                    points={poly.map(pt => `${pt.x},${pt.y}`).join(' ')}
                    fill="#a855f7"
                    fillOpacity="0.2"
                    stroke="none"
                  />
                )
              ))}
              
              {/* Заливка текущего замкнутого полигона */}
              {isPolygonClosed && currentPolygon.length > 2 && (
                <polygon
                  points={currentPolygon.map(pt => `${pt.x},${pt.y}`).join(' ')}
                  fill="#a855f7"
                  fillOpacity="0.2"
                  stroke="none"
                />
              )}
              
              {/* Линии всех завершенных полигонов */}
              {polygons.map((poly, polyIdx) => (
                poly.map((pt, idx) => {
                  const next = poly[(idx + 1) % poly.length];
                  return renderLine(pt, next, '#a855f7', '');
                })
              ))}
              
              {/* Линии текущего полигона */}
              {currentPolygon.map((pt, idx) => {
                const next = idx === currentPolygon.length - 1 
                  ? (isPolygonClosed ? currentPolygon[0] : mousePos) 
                  : currentPolygon[idx + 1];
                return next ? renderLine(pt, next, '#a855f7', isPolygonClosed && idx === currentPolygon.length - 1 ? '' : '') : null;
              })}
              {currentPolygon.length > 2 && !isPolygonClosed &&
                renderLine(currentPolygon[currentPolygon.length - 1], currentPolygon[0], '#a855f7', '4 4')}

              {scalePoints.map((pt, idx) => (
                <circle
                  key={`scale-${idx}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={4 / zoom}
                  fill="#f8fafc"
                  stroke="#0f172a"
                  strokeWidth={2 / zoom}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              
              {/* Точки всех завершенных полигонов */}
              {polygons.map((poly, polyIdx) => (
                poly.map((pt, idx) => {
                  const isDragged = draggedPointIndex === idx && currentPolygonIndex === polyIdx;
                  const isHovered = hoveredPointIndex === idx && currentPolygonIndex === polyIdx;
                  return (
                    <circle
                      key={`poly-${polyIdx}-${idx}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered || isDragged ? 6 / zoom : 4 / zoom}
                      fill={isHovered || isDragged ? "#3b82f6" : "#f8fafc"}
                      stroke={isHovered || isDragged ? "#ffffff" : "#0f172a"}
                      strokeWidth={isHovered || isDragged ? 2 / zoom : 1 / zoom}
                      vectorEffect="non-scaling-stroke"
                      style={{ 
                        transition: isDragged ? 'none' : 'all 0.2s',
                        cursor: isHovered || isDragged ? 'move' : 'default',
                        pointerEvents: 'auto'
                      }}
                    />
                  );
                })
              ))}
              
              {/* Точки текущего полигона */}
              {currentPolygon.map((pt, idx) => {
                const isFirstPolyPoint = mode === MeasureMode.POLYGON && idx === 0 && currentPolygon.length > 2 && !isPolygonClosed;
                const isDragged = draggedPointIndex === idx && currentPolygonIndex === -1;
                const isHovered = hoveredPointIndex === idx && currentPolygonIndex === -1;
                // Для замкнутого полигона показываем подсветку при наведении
                const shouldHighlight = isPolygonClosed ? (isHovered || isDragged) : (isFirstPolyPoint && isHoveringFirstPoint);
                return (
                  <circle
                    key={`current-poly-${idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={shouldHighlight ? (isFirstPolyPoint && isHoveringFirstPoint ? 8 / zoom : 6 / zoom) : 4 / zoom}
                    fill={shouldHighlight ? (isFirstPolyPoint && isHoveringFirstPoint ? "#10b981" : "#3b82f6") : "#f8fafc"}
                    stroke={shouldHighlight ? "#ffffff" : "#0f172a"}
                    strokeWidth={shouldHighlight ? 2 / zoom : 1 / zoom}
                    vectorEffect="non-scaling-stroke"
                    style={{ 
                      transition: isDragged ? 'none' : 'all 0.2s',
                      cursor: (isPolygonClosed && (isHovered || isDragged)) || (isFirstPolyPoint && isHoveringFirstPoint) ? 'move' : 'default',
                      pointerEvents: 'auto'
                    }}
                  />
                );
              })}
              
              {mousePos && (
                <circle
                  cx={mousePos.x}
                  cy={mousePos.y}
                  r={4 / zoom}
                  fill="#38bdf8"
                  stroke="#0f172a"
                  strokeWidth={1 / zoom}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {/* Подсказка "Замкнуть" при наведении на первую точку */}
              {isHoveringFirstPoint && currentPolygon.length > 0 && (
                <g>
                  <rect
                    x={currentPolygon[0].x - 35}
                    y={currentPolygon[0].y - 25}
                    width={70}
                    height={20}
                    fill="#10b981"
                    rx={4}
                    opacity={0.95}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={currentPolygon[0].x}
                    y={currentPolygon[0].y - 10}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="12"
                    fontWeight="600"
                    vectorEffect="non-scaling-stroke"
                  >
                    Замкнуть
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>
      </div>


      {/* Модальное окно для задания масштаба */}
      {showScaleModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-semibold text-white mb-2">Задать масштаб</h3>
            <p className="text-sm text-slate-400 mb-6">
              Введите реальную длину линии, которую вы только что нарисовали.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  РАССТОЯНИЕ
                </label>
                <input 
                  type="text"
                  inputMode="decimal"
                  value={scaleDistance}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    // Разрешаем пустое значение, только цифры и точку/запятую
                    if (inputValue === '' || /^[\d.,]*$/.test(inputValue)) {
                      setScaleDistance(inputValue);
                    }
                  }}
                  placeholder="1000"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white text-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  ЕДИНИЦА ИЗМЕРЕНИЯ
                </label>
                <div className="relative">
                  <select
                    value={scaleUnit}
                    onChange={(e) => {
                      const unit = e.target.value as 'mm' | 'cm' | 'm';
                      setScaleUnit(unit);
                      // Обновляем значение при смене единицы для удобства
                      const numValue = parseFloat(scaleDistance);
                      if (!isNaN(numValue)) {
                        if (unit === 'm' && numValue === 1000) {
                          setScaleDistance('1');
                        } else if (unit === 'cm' && numValue === 1000) {
                          setScaleDistance('100');
                        } else if (unit === 'mm' && numValue === 1) {
                          setScaleDistance('1000');
                        }
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 pr-10 text-white text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none cursor-pointer"
                  >
                    <option value="mm">Миллиметры (мм)</option>
                    <option value="cm">Сантиметры (см)</option>
                    <option value="m">Метры (м)</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCancelScale}
                className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSetScale}
                disabled={!scaleDistance || parseFloat(scaleDistance) <= 0 || isNaN(parseFloat(scaleDistance))}
                className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                Задать масштаб
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно с подсказками по горячим клавишам */}
      {showHelpModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Горячие клавиши</h3>
              <button
                onClick={() => setShowHelpModal(false)}
                className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg">
              <p className="text-sm text-indigo-200">
                <strong className="text-indigo-100">Совет:</strong> При выборе масштаба применяйте самый длинный размер в проекте.
              </p>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3">
                  <kbd className="px-2 py-1 bg-slate-700 text-slate-200 rounded text-sm font-mono">Shift</kbd>
                  <span className="text-slate-300 text-sm">Прямая линия (горизонтальная/вертикальная)</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3">
                  <kbd className="px-2 py-1 bg-slate-700 text-slate-200 rounded text-sm font-mono">Ctrl</kbd>
                  <span className="text-slate-300 text-sm">+</span>
                  <kbd className="px-2 py-1 bg-slate-700 text-slate-200 rounded text-sm font-mono">Колесо мыши</kbd>
                  <span className="text-slate-300 text-sm">Масштабирование</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3">
                  <kbd className="px-2 py-1 bg-slate-700 text-slate-200 rounded text-sm font-mono">Пробел</kbd>
                  <span className="text-slate-300 text-sm">Перемещение изображения</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3">
                  <kbd className="px-2 py-1 bg-slate-700 text-slate-200 rounded text-sm font-mono">Колесо мыши</kbd>
                  <span className="text-slate-300 text-sm">Перемещение изображения (зажать и тащить)</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3">
                  <span className="text-slate-300 text-sm">Двойной клик на точку</span>
                  <span className="text-slate-400 text-xs">→</span>
                  <span className="text-slate-300 text-sm">Удалить точку</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3">
                  <span className="text-slate-300 text-sm">Двойной клик на линию</span>
                  <span className="text-slate-400 text-xs">→</span>
                  <span className="text-slate-300 text-sm">Добавить точку</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowHelpModal(false)}
              className="w-full mt-6 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export { MeasurementCanvas };

