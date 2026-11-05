import React, { useState, useEffect, useRef } from 'react';
import { Settings, Copy, Check, FileText, FileSignature, AlertTriangle, Plus, Trash2, Image } from 'lucide-react';
import html2canvas from 'html2canvas';
import { OfficialKPPdfButton } from './OfficialKPPdf';
import { UsefulLinks } from './UsefulLinks';
import logo from '../logo.png';

interface FloorArea {
  id: string;
  name: string;
  area: number;
}
import { CostCategory } from '../types';

interface CostEstimatorProps {
  area: number;
  onAreaChange: (newArea: number) => void;
  onRequestManualMeasure: () => void;
}

const DEFAULT_CATEGORIES: CostCategory[] = [
  { id: 'heating', name: 'Системы отопления, водоснабжения, котельная', pricePerEb: 200, isEnabled: true },
  { id: 'sewage', name: 'Канализация', pricePerEb: 60, isEnabled: false },
  { id: 'ventilation', name: 'Вентиляция', pricePerEb: 140, isEnabled: false },
  { id: 'ac', name: 'Кондиционирование', pricePerEb: 140, isEnabled: false },
  { id: 'electric', name: 'Электрические сети', pricePerEb: 240, isEnabled: false },
];

const MIN_PRICE = 25000;
const ELECTRIC_MIN_PRICE = 35000;

/** Базовая цена ₽/м² по умолчанию — от неё считается процент изменения минималки. */
const DEFAULT_PRICE_BY_ID: Record<string, number> = Object.fromEntries(
  DEFAULT_CATEGORIES.map(c => [c.id, c.pricePerEb])
);

/** Базовая минималка раздела при цене по умолчанию. */
const BASE_MIN_BY_ID: Record<string, number> = {
  heating: MIN_PRICE,
  ventilation: MIN_PRICE,
  ac: MIN_PRICE,
  electric: ELECTRIC_MIN_PRICE,
};

/**
 * Минималка раздела масштабируется пропорционально изменению цены за м².
 * Пример: отопление 200→220 ₽/м² (+10%) → мин. 25 000→27 500 ₽.
 */
const getScaledMinPrice = (cat: CostCategory): number => {
  const baseMin = BASE_MIN_BY_ID[cat.id];
  if (!baseMin) return 0;
  const defaultPrice = DEFAULT_PRICE_BY_ID[cat.id];
  if (!defaultPrice || cat.pricePerEb <= 0) return baseMin;
  return Math.round(baseMin * (cat.pricePerEb / defaultPrice));
};

export const CostEstimator: React.FC<CostEstimatorProps> = ({ area, onAreaChange, onRequestManualMeasure }) => {
  const [categories, setCategories] = useState<CostCategory[]>(DEFAULT_CATEGORIES);
  const [showSettings, setShowSettings] = useState(false);
  const [cpCopied, setCpCopied] = useState(false);
  const [contractCopied, setContractCopied] = useState(false);
  const [pricesCopied, setPricesCopied] = useState(false);
  const [isB2B, setIsB2B] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const cpImageRef = useRef<HTMLDivElement>(null);

  // Дополнительные площади с названиями
  const [floorAreas, setFloorAreas] = useState<FloorArea[]>([]);
  const [newFloorName, setNewFloorName] = useState('');
  const [newFloorArea, setNewFloorArea] = useState<number>(0);

  // Вычисляем общую площадь: основная + все дополнительные
  const totalFloorArea = floorAreas.reduce((sum, floor) => sum + floor.area, 0);
  const combinedArea = (isNaN(area) ? 0 : area) + totalFloorArea;
  
  // Safe area for calculations
  const safeArea = isNaN(combinedArea) ? 0 : Math.round(combinedArea);

  // Добавление новой площади
  const addFloorArea = () => {
    if (newFloorName.trim() && newFloorArea > 0) {
      const newFloor: FloorArea = {
        id: Date.now().toString(),
        name: newFloorName.trim(),
        area: newFloorArea
      };
      setFloorAreas(prev => [...prev, newFloor]);
      setNewFloorName('');
      setNewFloorArea(0);
    }
  };

  // Удаление площади
  const removeFloorArea = (id: string) => {
    setFloorAreas(prev => prev.filter(floor => floor.id !== id));
  };

  // Обновление площади
  const updateFloorArea = (id: string, newArea: number) => {
    setFloorAreas(prev => prev.map(floor => 
      floor.id === id ? { ...floor, area: isNaN(newArea) ? 0 : newArea } : floor
    ));
  };

  // Обновление названия
  const updateFloorName = (id: string, newName: string) => {
    setFloorAreas(prev => prev.map(floor => 
      floor.id === id ? { ...floor, name: newName } : floor
    ));
  };

  const enabledCategories = categories.filter(c => c.isEnabled);
  const disabledCategories = categories.filter(c => !c.isEnabled);

  const getCategoryCost = (cat: CostCategory) => {
    if (!safeArea) return 0;
    const raw = cat.pricePerEb * safeArea;
    
    // Канализация считается без минимальной стоимости
    if (cat.id === 'sewage') {
      return raw;
    }
    // Кондиционирование вместе с вентиляцией — как канализация, без минималки
    if (cat.id === 'ac' && enabledCategories.some(c => c.id === 'ventilation')) {
      return raw;
    }
    // Остальные разделы с минималкой (масштабируется от изменения цены за м²)
    const scaledMin = getScaledMinPrice(cat);
    if (scaledMin > 0) {
      return Math.max(raw, scaledMin);
    }
    return Math.max(raw, MIN_PRICE);
  };

  /** Стоимость раздела в блоке «Также вы можете заказать» (с примечанием про минималку). */
  const getSuggestedCategoryCost = (cat: CostCategory): { sum: number; minNote: string } => {
    const raw = cat.pricePerEb * safeArea;

    if (cat.id === 'sewage') {
      return { sum: raw, minNote: '' };
    }

    // Кондиционирование без минималки, если вентиляция уже в заказе
    if (cat.id === 'ac' && enabledCategories.some(c => c.id === 'ventilation')) {
      return { sum: raw, minNote: '' };
    }

    const scaledMin = getScaledMinPrice(cat) || MIN_PRICE;
    const sum = Math.max(raw, scaledMin);
    return {
      sum,
      minNote: raw < scaledMin ? ` (мин. ${scaledMin.toLocaleString('ru-RU')} ₽)` : '',
    };
  };

  const minAdjustedTotal = enabledCategories.reduce((acc, curr) => acc + getCategoryCost(curr), 0);
  const finalTotalCost = safeArea > 0 ? minAdjustedTotal : 0;
  
  const totalPricePerM2 = enabledCategories.reduce((acc, curr) => acc + curr.pricePerEb, 0);

  // Вычисляем сырую стоимость (без применения минимума)
  const rawTotalCostWithoutMin = enabledCategories.reduce((acc, curr) => acc + curr.pricePerEb * safeArea, 0);
  
  // Проверяем, была ли применена минимальная стоимость
  const isMinPriceApplied = safeArea > 0 && finalTotalCost > rawTotalCostWithoutMin;

  const toggleCategory = (id: string) => {
    setCategories(prev => {
      // Если пытаются включить канализацию, проверяем, включено ли отопление
      if (id === 'sewage') {
        const heatingCategory = prev.find(c => c.id === 'heating');
        const sewageCategory = prev.find(c => c.id === 'sewage');
        // Если канализацию пытаются включить, а отопление выключено - запрещаем
        if (!sewageCategory?.isEnabled && !heatingCategory?.isEnabled) {
          return prev; // Не изменяем состояние
        }
      }
      
      // Если выключают отопление, автоматически выключаем канализацию
      if (id === 'heating') {
        const heatingCategory = prev.find(c => c.id === 'heating');
        if (heatingCategory?.isEnabled) {
          // Отопление выключается, выключаем и канализацию
          return prev.map(c => {
            if (c.id === 'heating') {
              return { ...c, isEnabled: false };
            }
            if (c.id === 'sewage') {
              return { ...c, isEnabled: false };
            }
            return c;
          });
        }
      }
      
      return prev.map(c => c.id === id ? { ...c, isEnabled: !c.isEnabled } : c);
    });
  };

  const updatePrice = (id: string, newPrice: number) => {
    if (isNaN(newPrice)) return;
    setCategories(prev => prev.map(c => c.id === id ? { ...c, pricePerEb: newPrice } : c));
  };

  const adjustPrice = (id: string, delta: number) => {
    setCategories(prev =>
      prev.map(c => {
        if (c.id !== id) return c;
        const next = Math.max(0, c.pricePerEb + delta);
        // Округляем к шагу 10
        const rounded = Math.round(next / 10) * 10;
        return { ...c, pricePerEb: rounded };
      })
    );
  };

  const getCategoryDisplayPrice = (cat: CostCategory) => {
      if (!cat.isEnabled || safeArea === 0) return 0;
      return getCategoryCost(cat);
  };

  // --- Text Generation Helpers for Clipboard ---
  const generateCPText = () => {
    const mainArea = isNaN(area) ? 0 : Math.round(area);
    
    const lines = [
      `Подготовили расчет стоимости проекта по отапливаемой площади дома.`,
      ``
    ];

    // Если есть дополнительные площади, показываем детализацию
    if (floorAreas.length > 0) {
      lines.push(`Детализация площади:`);
      if (mainArea > 0) {
        lines.push(`• Основная площадь: ${mainArea} м²`);
      }
      floorAreas.forEach(floor => {
        lines.push(`• ${floor.name}: ${Math.round(floor.area)} м²`);
      });
      lines.push(`Итого отапливаемая площадь: ${safeArea} м²`);
    } else {
      lines.push(`Отапливаемая площадь: ${safeArea} м²`);
    }
    
    lines.push(`Цена за м² (сумма): ${totalPricePerM2.toFixed(2)} ₽/м²`);
    lines.push(`Итого к оплате: ${finalTotalCost.toLocaleString('ru-RU')} ₽`);
    lines.push(``);
    lines.push(`Детализация по разделам:`);

    enabledCategories.forEach(cat => {
        const sum = getCategoryCost(cat);
        lines.push(`• ${cat.name} (сумма) — ${sum.toLocaleString('ru-RU')} ₽`);
    });

    if (!isB2B) {
      lines.push(``);
      lines.push(`Скачать PDF примеров проектов: https://t.me/galfdesign/1952`);
    }
    
    if (disabledCategories.length > 0) {
        lines.push(``);
        lines.push(`Также вы можете заказать проектирование:`);
        disabledCategories.forEach(cat => {
            const { sum, minNote } = getSuggestedCategoryCost(cat);
            lines.push(`- ${cat.name}: ${cat.pricePerEb} ₽/м² → за ${safeArea} м² = ${sum.toLocaleString('ru-RU')} ₽${minNote}`);
        });
    }
    return lines.join('\n');
  };

  const generateContractText = () => {
      return `Для заключения договора на разработку проектной документации, прошу предоставить данные физического лица:
• ФИО
• паспорт: серия и номер, кем и когда выдан
• адрес прописки
• контактный номер телефона и эл. почта.
• адрес объекта
Либо реквизиты юридического лица.
Обращаю Ваше внимание, что при условии оплаты на расчетный счет стоимость договора увеличивается на 10%. Без НДС.`;
  };

  const generatePricesText = () => {
    const lines = [
      `Стоимость проектирования по разделам:`,
      ``
    ];
    categories.forEach(cat => {
      lines.push(`• ${cat.name}: ${cat.pricePerEb} ₽/м²`);
    });
    lines.push(``);
    lines.push(`* Базовая минимальная стоимость раздела — ${MIN_PRICE.toLocaleString('ru-RU')} ₽ (растёт/падает пропорционально изменению цены за м²)`);
    lines.push(`* Базовая минимальная стоимость раздела "Электрические сети" — ${ELECTRIC_MIN_PRICE.toLocaleString('ru-RU')} ₽`);
    return lines.join('\n');
  };

  const copyCP = () => {
    navigator.clipboard.writeText(generateCPText());
    setCpCopied(true);
    setTimeout(() => setCpCopied(false), 2000);
  };

  const copyContract = () => {
    navigator.clipboard.writeText(generateContractText());
    setContractCopied(true);
    setTimeout(() => setContractCopied(false), 2000);
  };

  const copyPrices = () => {
    navigator.clipboard.writeText(generatePricesText());
    setPricesCopied(true);
    setTimeout(() => setPricesCopied(false), 2000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText('Скачать PDF примеров проектов: https://t.me/galfdesign/1952');
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const copyAsImage = async () => {
    if (!cpImageRef.current || imageLoading) return;
    
    setImageLoading(true);
    try {
      const canvas = await html2canvas(cpImageRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
      });
      
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            setImageCopied(true);
            setTimeout(() => setImageCopied(false), 2000);
          } catch (err) {
            // Fallback: скачать изображение если копирование не поддерживается
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'kp.png';
            a.click();
            URL.revokeObjectURL(url);
          }
        }
        setImageLoading(false);
      }, 'image/png');
    } catch (err) {
      console.error('Error creating image:', err);
      setImageLoading(false);
    }
  };

  // Генерация контента для изображения
  const renderCPContent = () => {
    const mainArea = isNaN(area) ? 0 : Math.round(area);

    return (
      <>
        {/* Шапка с логотипом - только для частных клиентов */}
        {!isB2B && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #4f46e5' }}>
            <img src={logo} alt="Logo" style={{ width: '100px', height: 'auto', objectFit: 'contain', marginRight: '20px' }} />
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e1b4b' }}>Коммерческое предложение</div>
              <div style={{ fontSize: '12px', color: '#6366f1' }}>на проектирование инженерных систем</div>
            </div>
          </div>
        )}
        
        <p style={{ marginBottom: '12px' }}>Подготовили расчет стоимости проекта по отапливаемой площади дома.</p>
        
        {floorAreas.length > 0 ? (
          <>
            <p style={{ color: '#666', marginBottom: '4px' }}>Детализация площади:</p>
            {mainArea > 0 && <p>• Основная площадь: <strong>{mainArea} м²</strong></p>}
            {floorAreas.map(floor => (
              <p key={floor.id}>• {floor.name}: <strong>{Math.round(floor.area)} м²</strong></p>
            ))}
            <p style={{ marginTop: '4px' }}>Итого отапливаемая площадь: <strong>{safeArea} м²</strong></p>
          </>
        ) : (
          <p>Отапливаемая площадь: <strong>{safeArea} м²</strong></p>
        )}
        
        <p>Цена за м² (сумма): {totalPricePerM2} ₽/м²</p>
        <p style={{ fontWeight: 'bold', marginBottom: '12px' }}>Итого к оплате: {finalTotalCost.toLocaleString('ru-RU')} ₽</p>
        
        <p style={{ marginBottom: '4px' }}>Детализация по разделам:</p>
        {enabledCategories.map(cat => (
          <p key={cat.id}>• {cat.name} — {getCategoryCost(cat).toLocaleString('ru-RU')} ₽</p>
        ))}
        
        {disabledCategories.length > 0 && (
          <>
            <p style={{ marginTop: '12px', color: '#c00' }}>Также вы можете заказать проектирование:</p>
            {disabledCategories.map(cat => {
              const { sum, minNote } = getSuggestedCategoryCost(cat);
              return (
                <p key={cat.id} style={{ color: '#c00' }}>
                  - {cat.name}: {cat.pricePerEb} ₽/м² → за {safeArea} м² = {sum.toLocaleString('ru-RU')} ₽{minNote}
                </p>
              );
            })}
          </>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Hidden block for image rendering */}
      <div 
        ref={cpImageRef}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          width: '500px',
          padding: '24px',
          backgroundColor: '#ffffff',
          color: '#000000',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '14px',
          lineHeight: '1.6',
        }}
      >
        {renderCPContent()}
      </div>
      
      {/* 1. Calculator Card */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-slate-700">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div className="flex-1 w-full space-y-4">
              {/* Основная площадь */}
              <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-slate-400 min-w-[180px]">Основная площадь (м²)</label>
                  <input
                    type="number"
                    value={area === 0 ? '' : area}
                    placeholder="0"
                    onChange={(e) => onAreaChange(parseFloat(e.target.value))}
                    className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white w-32 font-mono text-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                  />
              </div>

              {/* Список дополнительных площадей */}
              {floorAreas.length > 0 && (
                <div className="space-y-2 pl-0 md:pl-4 border-l-2 border-slate-700 ml-0 md:ml-2">
                  {floorAreas.map((floor) => (
                    <div key={floor.id} className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200">
                      <input
                        type="text"
                        value={floor.name}
                        onChange={(e) => updateFloorName(floor.id, e.target.value)}
                        className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-slate-300 w-36 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        placeholder="Название"
                      />
                      <input
                        type="number"
                        value={floor.area === 0 ? '' : floor.area}
                        onChange={(e) => updateFloorArea(floor.id, parseFloat(e.target.value))}
                        className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-white w-24 font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                        placeholder="0"
                      />
                      <span className="text-slate-500 text-sm">м²</span>
                      <button
                        onClick={() => removeFloorArea(floor.id)}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Форма добавления новой площади */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  value={newFloorName}
                  onChange={(e) => setNewFloorName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addFloorArea()}
                  className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-slate-300 w-36 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-500"
                  placeholder="Название (1 этаж)"
                />
                <input
                  type="number"
                  value={newFloorArea === 0 ? '' : newFloorArea}
                  onChange={(e) => setNewFloorArea(parseFloat(e.target.value))}
                  onKeyDown={(e) => e.key === 'Enter' && addFloorArea()}
                  className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-white w-24 font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600"
                  placeholder="0"
                />
                <span className="text-slate-500 text-sm">м²</span>
                <button
                  onClick={addFloorArea}
                  disabled={!newFloorName.trim() || newFloorArea <= 0}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  Добавить
                </button>
              </div>

              {/* Итого площадь если есть дополнительные */}
              {floorAreas.length > 0 && (
                <div className="flex items-center gap-3 pt-2 border-t border-slate-700">
                  <span className="text-sm font-medium text-indigo-400">Итого площадь:</span>
                  <span className="font-mono text-lg text-white font-bold">{safeArea} м²</span>
                </div>
              )}
            </div>
          <div className="flex flex-col items-end gap-2">
             <div className="flex items-center gap-3">
                {isMinPriceApplied && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span className="text-amber-300/90">Применен минимум</span>
                  </div>
                )}
             <div className="text-3xl font-bold text-white tracking-tight">
                {finalTotalCost.toLocaleString('ru-RU')} ₽
                </div>
             </div>
             <div className="text-sm text-slate-400">Итоговая стоимость</div>
          </div>
          </div>
        </div>

        {/* Categories Settings */}
        <div className="p-6 bg-slate-900/30">
             <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Разделы проекта</h4>
                <button onClick={() => setShowSettings(!showSettings)} className="text-slate-500 hover:text-white transition-colors">
                    <Settings className="w-4 h-4" />
                </button>
             </div>
             <div className="space-y-3">
                {categories.map((cat) => {
                    const heatingCategory = categories.find(c => c.id === 'heating');
                    const isSewageDisabled = cat.id === 'sewage' && !heatingCategory?.isEnabled;
                    
                    return (
                    <div key={cat.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${cat.isEnabled ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-slate-800/50 border-slate-700 opacity-70 hover:opacity-100'} ${isSewageDisabled ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-3 flex-1">
                            {/* Toggle Switch */}
                            <button
                                onClick={() => !isSewageDisabled && toggleCategory(cat.id)}
                                disabled={isSewageDisabled}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  cat.isEnabled ? 'bg-indigo-600' : 'bg-slate-700'
                                } ${isSewageDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                                role="switch"
                                aria-checked={cat.isEnabled}
                                title={isSewageDisabled ? 'Сначала включите отопление' : ''}
                            >
                                <span
                                  aria-hidden="true"
                                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    cat.isEnabled ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                            </button>

                            <div className={`flex flex-col ${isSewageDisabled ? '' : 'cursor-pointer'}`} onClick={() => !isSewageDisabled && toggleCategory(cat.id)}>
                                <span className={`font-medium select-none ${cat.isEnabled ? 'text-white' : 'text-slate-400'}`}>{cat.name}</span>
                                {cat.id === 'sewage' && isSewageDisabled && (
                                    <span className="text-xs text-slate-500 mt-0.5">Требуется включить отопление</span>
                                )}
                                {showSettings && (
                                    <div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                                        <span className="text-xs text-slate-500">Цена за м²:</span>
                                        <div className="flex items-center gap-1">
                                        <input 
                                            type="number" 
                                                step={10}
                                            value={cat.pricePerEb} 
                                            onChange={(e) => updatePrice(cat.id, parseFloat(e.target.value))}
                                                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white w-20 focus:ring-1 focus:ring-indigo-500 outline-none"
                                        />
                                            <div className="flex flex-col gap-0.5">
                                                <button
                                                  type="button"
                                                  onClick={() => adjustPrice(cat.id, 10)}
                                                  className="h-5 w-6 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-[10px] text-slate-200 border border-slate-600"
                                                  title="Увеличить на 10"
                                                >
                                                  +
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => adjustPrice(cat.id, -10)}
                                                  className="h-5 w-6 flex items-center justify-center rounded bg-slate-700 hover:bg-slate-600 text-[10px] text-slate-200 border border-slate-600"
                                                  title="Уменьшить на 10"
                                                >
                                                  –
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                             <span className="font-mono text-slate-300">
                                {getCategoryDisplayPrice(cat).toLocaleString('ru-RU')} ₽
                             </span>
                        </div>
                    </div>
                    );
                })}
             </div>
        </div>
      </div>

      {/* Two Column Layout for Text Blocks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 2. Messenger CP Block */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col h-full">
            <div className="flex justify-between items-center mb-4">
               <h3 className="font-semibold text-white text-lg flex items-center gap-2">
                   <FileText className="w-5 h-5 text-indigo-400" />
                   КП для мессенджера
               </h3>
               <div className="flex items-center gap-3">
                   {/* B2B Toggle */}
                   <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${!isB2B ? 'text-white' : 'text-slate-500'}`}>Частный</span>
                      <button
                          onClick={() => setIsB2B(!isB2B)}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isB2B ? 'bg-indigo-600' : 'bg-slate-600'
                          } cursor-pointer`}
                          role="switch"
                          aria-checked={isB2B}
                      >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isB2B ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                      </button>
                      <span className={`text-xs font-medium ${isB2B ? 'text-white' : 'text-slate-500'}`}>B2B</span>
                   </div>
                   {!isB2B && (
                     <button 
                        onClick={copyLink}
                        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs text-white font-medium transition-colors border border-emerald-500"
                     >
                        {linkCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {linkCopied ? 'Скопировано' : 'Ссылка'}
                     </button>
                   )}
               </div>
            </div>
            
            <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-700/50 font-mono text-xs sm:text-sm leading-relaxed shadow-inner flex-1 overflow-y-auto custom-scrollbar">
               <div className="text-slate-300">
                  <p>Подготовили расчет стоимости проекта по отапливаемой площади дома.</p>
                  <div className="h-4"></div>
                  {floorAreas.length > 0 ? (
                    <>
                      <p className="text-slate-400">Детализация площади:</p>
                      {(isNaN(area) ? 0 : area) > 0 && (
                        <p>• Основная площадь: <span className="text-white">{Math.round(area)} м²</span></p>
                      )}
                      {floorAreas.map(floor => (
                        <p key={floor.id}>• {floor.name}: <span className="text-white">{Math.round(floor.area)} м²</span></p>
                      ))}
                      <p className="mt-1">Итого отапливаемая площадь: <span className="text-white font-bold">{safeArea} м²</span></p>
                    </>
                  ) : (
                    <p>Отапливаемая площадь: <span className="text-white font-bold">{safeArea} м²</span></p>
                  )}
                  <p>Цена за м² (сумма): {totalPricePerM2} ₽/м²</p>
                  <p className="font-bold text-white">Итого к оплате: {finalTotalCost.toLocaleString('ru-RU')} ₽</p>
                  <div className="h-4"></div>
                  <p>Детализация по разделам:</p>
                  {enabledCategories.map(cat => (
                         <p key={cat.id}>• {cat.name} (сумма) — {getCategoryCost(cat).toLocaleString('ru-RU')} ₽</p>
                  ))}
                  {!isB2B && (
                    <>
                      <div className="h-4"></div>
                      <p>Скачать PDF примеров проектов: <a href="https://t.me/galfdesign/1952" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">https://t.me/galfdesign/1952</a></p>
                    </>
                  )}
                  
                  {disabledCategories.length > 0 && (
                      <>
                          <div className="h-4"></div>
                          <p className="text-red-400/90 font-medium">Также вы можете заказать проектирование:</p>
                          {disabledCategories.map(cat => {
                              const { sum, minNote } = getSuggestedCategoryCost(cat);
                              return (
                                <p key={cat.id} className="text-red-400/80">
                                    - {cat.name}: {cat.pricePerEb} ₽/м² → за {safeArea} м² = {sum.toLocaleString('ru-RU')} ₽{minNote}
                                </p>
                              );
                          })}
                      </>
                  )}
               </div>
            </div>
            
            {/* Кнопки копирования внизу блока */}
            <div className="flex gap-3 pt-4 border-t border-slate-700">
               <button 
                  onClick={copyCP} 
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm text-white font-medium transition-colors border border-slate-600"
               >
                  {cpCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {cpCopied ? 'Скопировано!' : 'Скопировать как текст'}
               </button>
               <button 
                  onClick={copyAsImage}
                  disabled={imageLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 rounded-xl text-sm text-white font-medium transition-colors border border-indigo-500"
               >
                  {imageLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : imageCopied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Image className="w-4 h-4" />
                  )}
                  {imageCopied ? 'Скопировано!' : 'Скопировать как изображение'}
               </button>
            </div>
        </div>

        {/* 3. Contract Information Block */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col h-full">
             <div className="flex justify-between items-center mb-4">
                 <h3 className="font-semibold text-white text-lg flex items-center gap-2">
                     <FileSignature className="w-5 h-5 text-indigo-400" />
                     Информация для договора
                 </h3>
                 <button 
                    onClick={copyContract} 
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-white font-medium transition-colors border border-slate-600"
                 >
                    {contractCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {contractCopied ? 'Скопировано' : 'Скопировать'}
                 </button>
             </div>
             
             <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-700/50 text-slate-300 font-mono text-xs sm:text-sm leading-relaxed shadow-inner flex-1">
                  <p>Для заключения договора на разработку проектной документации, прошу предоставить данные физического лица:</p>
                  <ul className="list-none mt-2 space-y-1 ml-1">
                      <li>• ФИО</li>
                      <li>• паспорт: серия и номер, кем и когда выдан</li>
                      <li>• адрес прописки</li>
                      <li>• контактный номер телефона и эл. почта.</li>
                      <li>• адрес объекта</li>
                  </ul>
                  <p className="mt-4">Либо реквизиты юридического лица.</p>
                  <p className="mt-4 text-slate-500 text-xs pt-4 border-t border-slate-800">Обращаю Ваше внимание, что при условии оплаты на расчетный счет стоимость договора увеличивается на 10%. Без НДС.</p>
             </div>
        </div>
      </div>

      {/* 4. Section Prices Block */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-xl">
          <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-white text-lg flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-400" />
                  Расценки по разделам
              </h3>
              <button 
                 onClick={copyPrices} 
                 className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-white font-medium transition-colors border border-slate-600"
              >
                 {pricesCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                 {pricesCopied ? 'Скопировано' : 'Скопировать'}
              </button>
          </div>
          
          <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-700/50 text-slate-300 font-mono text-xs sm:text-sm leading-relaxed shadow-inner">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                   {categories.map(cat => (
                       <div key={cat.id} className="flex justify-between items-center border-b border-slate-800/50 py-1">
                           <span className="text-slate-400 truncate mr-2">{cat.name}</span>
                           <span className="text-white font-bold whitespace-nowrap">{cat.pricePerEb} ₽/м²</span>
                       </div>
                   ))}
               </div>
               <div className="mt-4 pt-4 border-t border-slate-800/50 text-[10px] sm:text-xs text-slate-500 italic space-y-1">
                   <p>* Базовая минимальная стоимость раздела — {MIN_PRICE.toLocaleString('ru-RU')} ₽ (растёт/падает пропорционально изменению цены за м²)</p>
                   <p>* Базовая минимальная стоимость раздела "Электрические сети" — {ELECTRIC_MIN_PRICE.toLocaleString('ru-RU')} ₽</p>
               </div>
          </div>
      </div>

      {/* Official PDF CP Block */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900/40 via-slate-800/60 to-slate-800/60 border border-indigo-500/30 rounded-2xl p-6 shadow-xl">
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
              <FileSignature className="w-6 h-6 text-indigo-300" />
            </div>
            <h3 className="font-semibold text-white text-lg leading-tight">
              Официальное коммерческое предложение
            </h3>
          </div>
          <div className="flex-shrink-0">
            <OfficialKPPdfButton
              mainArea={isNaN(area) ? 0 : area}
              floorAreas={floorAreas}
              totalArea={safeArea}
              categories={categories}
              enabledCategories={enabledCategories}
              disabledCategories={disabledCategories}
              finalTotalCost={finalTotalCost}
              totalPricePerM2={totalPricePerM2}
              getCategoryCost={getCategoryCost}
              getCategoryDisplayPrice={getCategoryDisplayPrice}
            />
          </div>
        </div>
      </div>

      {/* Useful links for the manager */}
      <UsefulLinks />

    </div>
  );
};
