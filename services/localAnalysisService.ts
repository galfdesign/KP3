// Declare pdfjsLib which is loaded via CDN in index.html
declare const pdfjsLib: any;

import { AnalysisData } from '../types';
import { createWorker } from 'tesseract.js';

interface FloorInfo {
  floorNumber: string;
  area: number;
}

interface AnalysisResult {
  foundArea: number | null;
  foundText: boolean;
  foundNumbers: boolean;
  foundAreaKeywords: boolean;
  extractedText: string;
  confidence: number;
  floors: FloorInfo[];
  totalFloors: number;
}

/**
 * Извлекает текст из PDF файла
 */
const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    const pagesToProcess = Math.min(pdf.numPages, 20);
    
    for (let i = 1; i <= pagesToProcess; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }
    
    return fullText;
  } catch (error) {
    console.error('PDF text extraction error:', error);
    throw error;
  }
};

/**
 * Извлекает текст из изображения используя OCR (Tesseract.js)
 */
const extractTextFromImage = async (file: File): Promise<string> => {
  try {
    const worker = await createWorker('rus+eng');
    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();
    return text;
  } catch (error) {
    console.error('OCR error:', error);
    // Если OCR не сработал, возвращаем имя файла
    return file.name || '';
  }
};

/**
 * Анализирует текст и ищет площади этажей, возвращает детальную информацию
 */
const analyzeTextForArea = (text: string): AnalysisResult => {
  const floors: FloorInfo[] = [];
  let foundText = text.trim().length > 0;
  let foundNumbers = false;
  let foundAreaKeywords = false;
  
  // Проверяем наличие ключевых слов
  const areaKeywords = /площадь|экспликация|помещени|м[²2]|кв\.?\s*м/gi;
  foundAreaKeywords = areaKeywords.test(text);
  
  // Проверяем наличие чисел
  const numberPattern = /\d+[.,]?\d*/g;
  const numbers = text.match(numberPattern);
  foundNumbers = numbers !== null && numbers.length > 0;
  
  // Словарь для преобразования названий этажей в числа
  const floorNames: { [key: string]: number } = {
    'первый': 1, '1-й': 1, '1й': 1, '1': 1,
    'второй': 2, '2-й': 2, '2й': 2, '2': 2,
    'третий': 3, '3-й': 3, '3й': 3, '3': 3,
    'четвертый': 4, '4-й': 4, '4й': 4, '4': 4,
    'пятый': 5, '5-й': 5, '5й': 5, '5': 5,
    'шестой': 6, '6-й': 6, '6й': 6, '6': 6,
  };
  
  // Паттерны для поиска площадей этажей с указанием номера
  const floorPatterns = [
    // "1-й этаж: 120 м²" или "первый этаж 150 м²"
    /(?:(\d+[-й]?|первый|второй|третий|четвертый|пятый|шестой)\s+этаж[ае]?|этаж\s+№?\s*(\d+))\s*[:\-]?\s*(\d+[.,]?\d*)\s*м[²2]/gi,
    // "План 1-го этажа: 120 м²"
    /(?:план|чертеж)\s+(?:(\d+[-й]?|первого|второго|третьего|четвертого|пятого|шестого)\s+этажа|этажа\s+№?\s*(\d+))\s*[:\-]?\s*(\d+[.,]?\d*)\s*м[²2]/gi,
    // "Общая площадь 1-го этажа: 120 м²"
    /(?:общая\s+)?площадь\s+(?:(\d+[-й]?|первого|второго|третьего|четвертого|пятого|шестого)\s+этажа|этажа\s+№?\s*(\d+))\s*[:\-]?\s*(\d+[.,]?\d*)\s*м[²2]/gi,
    // "Этаж 1: 120 м²"
    /этаж[ае]?\s*№?\s*(\d+)\s*[:\-]?\s*(\d+[.,]?\d*)\s*м[²2]/gi,
  ];
  
  // Ищем площади каждого этажа
  for (const pattern of floorPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const floorStr = (match[1] || match[2] || '').toLowerCase().trim();
      const areaStr = match[3] || match[4] || match[2];
      const areaNum = parseFloat(areaStr.replace(',', '.').replace(/[^\d.]/g, ''));
      
      if (!isNaN(areaNum) && areaNum > 20 && areaNum < 10000) {
        let floorNum = 0;
        
        // Пытаемся определить номер этажа
        if (floorStr) {
          // Извлекаем число из строки
          const numMatch = floorStr.match(/\d+/);
          if (numMatch) {
            floorNum = parseInt(numMatch[0]);
          } else if (floorNames[floorStr]) {
            floorNum = floorNames[floorStr];
          }
        }
        
        // Если не удалось определить номер, используем порядковый номер
        if (floorNum === 0) {
          floorNum = floors.length + 1;
        }
        
        floors.push({
          floorNumber: floorNum.toString(),
          area: areaNum,
        });
      }
    }
  }
  
  // Если нашли этажи, удаляем дубликаты и суммируем
  if (floors.length > 0) {
    // Группируем по номеру этажа и берем максимальную площадь (если есть дубликаты)
    const floorMap = new Map<number, number>();
    for (const floor of floors) {
      const num = parseInt(floor.floorNumber);
      const existing = floorMap.get(num);
      if (!existing || floor.area > existing) {
        floorMap.set(num, floor.area);
      }
    }
    
    // Преобразуем обратно в массив и сортируем по номеру этажа
    const uniqueFloors: FloorInfo[] = Array.from(floorMap.entries())
      .map(([num, area]) => ({ floorNumber: num.toString(), area }))
      .sort((a, b) => parseInt(a.floorNumber) - parseInt(b.floorNumber));
    
    const totalArea = uniqueFloors.reduce((sum, floor) => sum + floor.area, 0);
    
    return {
      foundArea: totalArea,
      foundText,
      foundNumbers,
      foundAreaKeywords: true,
      extractedText: text,
      confidence: uniqueFloors.length > 1 ? 85 : 75,
      floors: uniqueFloors,
      totalFloors: uniqueFloors.length,
    };
  }
  
  // Если не нашли этажи, ищем общую площадь здания
  const generalAreaPatterns = [
    /(?:общая\s+площадь\s+(?:здания|дома|строения)|площадь\s+здания|площадь\s+дома)\s*:?\s*(\d+[.,]?\d*)\s*м[²2]/gi,
    /(?:общая\s+площадь|площадь\s+общая|S\s*[=:]\s*общая)\s*:?\s*(\d+[.,]?\d*)\s*м[²2]/gi,
    /(?:итого|сумма|всего)\s*:?\s*(\d+[.,]?\d*)\s*м[²2]/gi,
  ];
  
  const foundAreas: number[] = [];
  for (const pattern of generalAreaPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const areaStr = match[1];
      const areaNum = parseFloat(areaStr.replace(',', '.').replace(/[^\d.]/g, ''));
      if (!isNaN(areaNum) && areaNum > 20 && areaNum < 10000) {
        foundAreas.push(areaNum);
      }
    }
  }
  
  if (foundAreas.length > 0) {
    const maxArea = Math.max(...foundAreas);
    return {
      foundArea: maxArea,
      foundText,
      foundNumbers,
      foundAreaKeywords: true,
      extractedText: text,
      confidence: 70,
      floors: [],
      totalFloors: 0,
    };
  }
  
  // Определяем уверенность
  let confidence = 30;
  if (foundAreaKeywords && foundNumbers) {
    confidence = 50;
  } else if (foundText && !foundNumbers) {
    confidence = 20;
  }
  
  return {
    foundArea: null,
    foundText,
    foundNumbers,
    foundAreaKeywords,
    extractedText: text,
    confidence,
    floors: [],
    totalFloors: 0,
  };
};

/**
 * Локальный анализ файла без использования AI
 */
export const analyzeFileLocally = async (file: File): Promise<AnalysisData> => {
  let analysisResult: AnalysisResult;
  
  try {
    let extractedText = '';
    
    if (file.type === 'application/pdf') {
      extractedText = await extractTextFromPDF(file);
    } else if (file.type.startsWith('image/')) {
      extractedText = await extractTextFromImage(file);
    } else {
      throw new Error('Неподдерживаемый тип файла для локального анализа');
    }
    
    // Анализируем текст
    analysisResult = analyzeTextForArea(extractedText);
    
    // Формируем детальное описание
    const details: string[] = [];
    
    if (!analysisResult.foundText) {
      details.push('❌ Текст не извлечен из файла');
    } else {
      details.push('✅ Текст успешно извлечен');
    }
    
    if (!analysisResult.foundNumbers) {
      details.push('❌ Числа не найдены в тексте');
    } else {
      details.push('✅ Числа найдены в тексте');
    }
    
    if (!analysisResult.foundAreaKeywords) {
      details.push('❌ Ключевые слова (площадь, м²) не найдены');
    } else {
      details.push('✅ Ключевые слова (площадь, м²) найдены');
    }
    
    // Информация об этажах
    if (analysisResult.totalFloors > 0) {
      details.push(`✅ Найдено этажей: ${analysisResult.totalFloors}`);
      analysisResult.floors.forEach((floor) => {
        details.push(`  • Этаж ${floor.floorNumber}: ${floor.area.toFixed(2)} м²`);
      });
      if (analysisResult.foundArea) {
        details.push(`✅ Сумма площадей всех этажей: ${analysisResult.foundArea.toFixed(2)} м²`);
      }
    } else {
      details.push('❌ Этажи не найдены в документе');
    }
    
    if (!analysisResult.foundArea) {
      details.push('❌ Площадь не определена автоматически');
    }
    
    // Создаем композицию с детальной информацией
    const composition = analysisResult.foundArea
      ? analysisResult.floors.length > 0
        ? analysisResult.floors.map((floor, idx) => ({
            name: `Этаж ${floor.floorNumber}`,
            percentage: (floor.area / analysisResult.foundArea!) * 100,
            description: `Площадь ${floor.floorNumber}-го этажа: ${floor.area.toFixed(2)} м²`,
            fill: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][idx % 6],
          }))
        : [
            {
              name: 'Найденная площадь',
              percentage: 100,
              description: `Локальный анализ: ${analysisResult.foundArea.toFixed(2)} м²`,
              fill: '#3b82f6',
            },
          ]
      : [
          {
            name: 'Площадь не найдена',
            percentage: 100,
            description: 'Автоматическое определение не удалось',
            fill: '#64748b',
          },
        ];
    
    // Формируем summary с детальной информацией
    let summary = `Локальный анализ выполнен.\n\nРезультаты:\n${details.join('\n')}\n\n`;
    
    if (analysisResult.totalFloors > 0 && analysisResult.foundArea) {
      summary += `Найдено ${analysisResult.totalFloors} этаж${analysisResult.totalFloors > 1 ? 'ей' : ''}.\n`;
      summary += `Общая площадь всех этажей: ${analysisResult.foundArea.toFixed(2)} м².\n\n`;
      summary += `Для более точного анализа рекомендуется использовать AI анализ или ручной замер.`;
    } else if (analysisResult.foundArea) {
      summary += `Найдена площадь: ${analysisResult.foundArea.toFixed(2)} м².\n`;
      summary += `Для более точного анализа рекомендуется использовать AI анализ или ручной замер.`;
    } else {
      summary += `Площадь не найдена автоматически.\n`;
      summary += `Рекомендуется использовать AI анализ (распознает изображения и таблицы) или ручной замер для точного определения.`;
    }
    
    return {
      summary,
      composition,
      estimatedRealWorldArea: analysisResult.foundArea ? `~${analysisResult.foundArea.toFixed(2)} м²` : undefined,
      confidenceScore: analysisResult.confidence,
    };
  } catch (error) {
    console.error('Local analysis error:', error);
    throw new Error('Ошибка при локальном анализе файла');
  }
};
