import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { ImageUpload } from './components/ImageUpload';
import { AnalysisChart } from './components/AnalysisChart';
import { MeasurementCanvas } from './components/MeasurementCanvas';
import { CostEstimator } from './components/CostEstimator';
import { processFile, analyzeImageArea, enhanceImageQuality, isAiAvailable } from './services/geminiService';
import { AnalysisData, AppState } from './types';
import { Wand2, Ruler, ArrowRight, Download, RefreshCw, AlertCircle, Calculator, BrainCircuit, ScanLine, PencilRuler, Plus } from 'lucide-react';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [activeTab, setActiveTab] = useState<'ai' | 'manual'>(isAiAvailable ? 'ai' : 'manual');
  
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  // Data for AI Analysis (Raw PDF or Image)
  const [aiBase64, setAiBase64] = useState<string | null>(null);
  const [aiMimeType, setAiMimeType] = useState<string>('image/jpeg');

  // Data for UI Display/Manual Measure (Stitched Image or Original Image)
  const [uiBase64, setUiBase64] = useState<string | null>(null);
  
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // Data
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [enhancedImage, setEnhancedImage] = useState<string | null>(null);
  
  // Logic to switch between original and enhanced for measurement
  const [manualCanvasSource, setManualCanvasSource] = useState<string | null>(null);

  // Active Area State - Single source of truth for calculator
  const [activeArea, setActiveArea] = useState<number>(0);
  
  // Projects state - список проектов с их площадями
  const [projects, setProjects] = useState<number[]>([]);
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreview && !imagePreview.startsWith('data:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleFileSelect = async (file: File) => {
    setCurrentFile(file);
    setAppState(AppState.ANALYZING); 
    
    try {
        const result = await processFile(file);
        
        setAiBase64(result.aiBase64);
        setAiMimeType(result.aiMimeType);
        setUiBase64(result.uiBase64);
        setImagePreview(result.previewUrl);
        
        setManualCanvasSource(null);
        setAnalysisData(null);
        setEnhancedImage(null);
        setActiveArea(0);
        setErrorMsg(null);
        setActiveTab(isAiAvailable ? 'ai' : 'manual');
        setAppState(AppState.IDLE);
        
    } catch (err) {
        console.error("File processing error", err);
        setErrorMsg("Не удалось обработать файл. Если это PDF, убедитесь, что он не поврежден.");
        setAppState(AppState.ERROR);
    }
  };

  // Paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (appState === AppState.ANALYZING || appState === AppState.ENHANCING) return;
      if (e.clipboardData && e.clipboardData.items) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              handleFileSelect(file);
              break;
            }
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [appState]);

  const runAnalysis = async () => {
    if (!isAiAvailable || !aiBase64) return;
    setAppState(AppState.ANALYZING);
    setErrorMsg(null);
    try {
      // Send the raw file (PDF/Doc/Image) to AI
      const data = await analyzeImageArea(aiBase64, aiMimeType);
      setAnalysisData(data);
      
      // Auto-update area if AI found a number
      if (data.estimatedRealWorldArea) {
        const match = data.estimatedRealWorldArea.match(/(\d+[.,]?\d*)/);
        if (match) {
            const aiArea = parseFloat(match[0].replace(',', '.'));
            if (!isNaN(aiArea) && aiArea > 0) {
                setActiveArea(aiArea);
            }
        }
      }

      setAppState(AppState.COMPLETE);
    } catch (err) {
      console.error(err);
      setErrorMsg("Не удалось проанализировать файл. Попробуйте еще раз.");
      setAppState(AppState.ERROR);
    }
  };

  const runEnhancement = async () => {
    if (!isAiAvailable || !uiBase64) return;
    setAppState(AppState.ENHANCING);
    setErrorMsg(null);
    try {
      // For enhancement, we always use the VISUAL representation (uiBase64)
      // because Image-to-Image models need an image, not a PDF.
      // If it's a stitched PDF, this enhances the long strip.
      const newImageBase64 = await enhanceImageQuality(uiBase64, 'image/jpeg');
      setEnhancedImage(`data:image/jpeg;base64,${newImageBase64}`);
      setAppState(AppState.COMPLETE);
    } catch (err: any) {
       console.error(err);
       if (err.message === "NOT_A_PLAN") {
           setErrorMsg("Чертеж не распознан. Пожалуйста, загрузите корректный план или схему помещения.");
       } else {
           setErrorMsg("Не удалось улучшить изображение. Попробуйте еще раз.");
       }
       setAppState(AppState.ERROR);
    }
  };

  const openEnhancedInManual = () => {
      if (enhancedImage) {
          setManualCanvasSource(enhancedImage);
          setActiveTab('manual');
          window.scrollTo({ top: 0, behavior: 'smooth' });
      }
  };

  // Добавление нового проекта - площадь суммируется
  const addProject = () => {
      // Добавляем текущую площадь к общей сумме
      if (activeArea > 0) {
          setProjects(prev => [...prev, activeArea]);
      }
      
      // Сбрасываем текущий проект для нового
      setCurrentFile(null);
      setImagePreview(null);
      setAiBase64(null);
      setUiBase64(null);
      setManualCanvasSource(null);
      setAnalysisData(null);
      setEnhancedImage(null);
      setActiveArea(0);
      setAppState(AppState.IDLE);
      setErrorMsg(null);
  };

  // Полный сброс всех проектов
  const resetAll = () => {
      setCurrentFile(null);
      setImagePreview(null);
      setAiBase64(null);
      setUiBase64(null);
      setManualCanvasSource(null);
      setAnalysisData(null);
      setEnhancedImage(null);
      setActiveArea(0);
      setProjects([]);
      setAppState(AppState.IDLE);
      setErrorMsg(null);
  };

  // Вычисляем общую площадь всех проектов + текущий проект
  const totalArea = projects.reduce((sum, area) => sum + area, 0) + activeArea;

  return (
    <Layout
      onReset={resetAll}
      toolbar={imagePreview && (
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex gap-2 p-1 bg-slate-800 rounded-xl overflow-x-auto w-full md:w-auto border border-slate-700">
                <button 
                    onClick={() => setActiveTab('ai')}
                    disabled={!isAiAvailable}
                    title={!isAiAvailable ? 'ИИ-анализ пока недоступен. Используйте ручной замер.' : undefined}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${activeTab === 'ai' ? 'bg-slate-700 text-white shadow-sm border border-slate-600' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                >
                    <BrainCircuit className="w-4 h-4" />
                    AI Анализ
                </button>
                <button 
                    onClick={() => setActiveTab('manual')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'manual' ? 'bg-slate-700 text-white shadow-sm border border-slate-600' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                >
                    <ScanLine className="w-4 h-4" />
                    Ручной замер
                </button>
            </div>

            <div className="flex items-center gap-4 bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 shadow-sm">
                <div className="text-right">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                        {projects.length > 0 ? 'Общая площадь' : 'Активная площадь'}
                    </p>
                    <p className="text-lg font-mono text-indigo-400 font-bold leading-none">
                        {totalArea.toFixed(2)} м²
                    </p>
                    {projects.length > 0 && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                            ({projects.length} проект{projects.length > 1 ? 'ов' : ''} + текущий)
                        </p>
                    )}
                </div>
                <div className="h-8 w-px bg-slate-700"></div>
                <button onClick={addProject} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-emerald-900/20 transition-colors">
                    <Plus className="w-3 h-3" /> Добавить проект
                </button>
            </div>
        </div>
      )}
    >
      <div className="flex flex-col gap-8 pb-20">
        {!isAiAvailable && (
            <p className="text-sm text-slate-400 text-center">
                ИИ-анализ пока отключён. Доступны ручной замер, расчёт стоимости и создание PDF.
            </p>
        )}

        {appState === AppState.ERROR && errorMsg && (
            <div role="alert" className="bg-red-900/20 border border-red-900/50 p-4 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-red-200 text-sm font-medium">{errorMsg}</p>
            </div>
        )}
        
        {/* Main Work Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-12">
                {!imagePreview ? (
                     <div className="max-w-2xl mx-auto mt-6">
                        <ImageUpload 
                            onImageSelected={handleFileSelect} 
                            isLoading={appState === AppState.ANALYZING || appState === AppState.ENHANCING} 
                        />
                     </div>
                ) : (
                    <>
                        {/* Tab Content: AI Analysis */}
                        {activeTab === 'ai' && (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-300">
                                <div className="lg:col-span-5 space-y-6">
                                    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-md">
                                         <h2 className="text-xl font-semibold mb-4 text-white">
                                            {aiMimeType.includes('pdf') ? 'Просмотр PDF (Все страницы)' : 'Изображение проекта'}
                                         </h2>
                                         <div className="relative rounded-xl overflow-hidden border border-slate-700 group bg-slate-900/50 max-h-[600px] overflow-y-auto custom-scrollbar">
                                            <img src={imagePreview} alt="Uploaded" className="w-full h-auto object-cover" />
                                         </div>
                                         <div className="grid grid-cols-2 gap-4 mt-6">
                                            <button onClick={runAnalysis} disabled={!isAiAvailable || appState === AppState.ANALYZING || appState === AppState.ENHANCING} className="btn-primary flex flex-col items-center justify-center p-4 rounded-xl bg-slate-800 hover:bg-indigo-900/20 border border-slate-700 hover:border-indigo-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group">
                                                <Ruler className="w-6 h-6 mb-2 text-indigo-400 group-hover:text-indigo-300" />
                                                <span className="font-medium text-sm text-slate-300 group-hover:text-indigo-300">AI Анализ</span>
                                            </button>
                                            <button onClick={runEnhancement} disabled={!isAiAvailable || appState === AppState.ENHANCING || appState === AppState.ANALYZING || !uiBase64} className="btn-primary flex flex-col items-center justify-center p-4 rounded-xl bg-slate-800 hover:bg-emerald-900/20 border border-slate-700 hover:border-emerald-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group">
                                                <Wand2 className="w-6 h-6 mb-2 text-emerald-400 group-hover:text-emerald-300" />
                                                <span className="font-medium text-sm text-slate-300 group-hover:text-emerald-300">Улучшить (HD)</span>
                                            </button>
                                         </div>
                                    </div>
                                    {(appState === AppState.ANALYZING || appState === AppState.ENHANCING) && (
                                        <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-xl flex items-center gap-3 animate-pulse shadow-sm">
                                            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                                            <span className="text-indigo-300 text-sm font-medium">
                                                {appState === AppState.ANALYZING ? "GalfAI анализ проекта..." : "Galf AI улучшает чертеж..."}
                                            </span>
                                        </div>
                                    )}

                                </div>
                                <div className="lg:col-span-7 space-y-6">
                                    {analysisData ? (
                                        <AnalysisChart data={analysisData} />
                                    ) : enhancedImage ? (
                                         <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-md h-full flex flex-col">
                                            <h3 className="text-lg font-semibold text-white mb-4">Улучшенное изображение</h3>
                                            <div className="flex-grow flex items-center justify-center bg-slate-900/50 rounded-xl overflow-hidden border border-slate-700 overflow-y-auto max-h-[500px] custom-scrollbar">
                                                <img src={enhancedImage} className="w-full h-auto object-contain" />
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-700">
                                                <a 
                                                    href={enhancedImage} 
                                                    download="enhanced_plan.jpg" 
                                                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white transition-colors font-medium text-sm border border-slate-600"
                                                >
                                                    <Download className="w-4 h-4"/> 
                                                    Скачать
                                                </a>
                                                <button 
                                                    onClick={openEnhancedInManual}
                                                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors font-medium text-sm shadow-md shadow-indigo-900/20"
                                                >
                                                    <PencilRuler className="w-4 h-4"/>
                                                    Ручной замер
                                                </button>
                                            </div>
                                         </div>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-2xl bg-slate-800/30 p-12 text-slate-500">
                                            <BrainCircuit className="w-12 h-12 mb-4 opacity-50" />
                                            <p>Запустите анализ (обрабатывает PDF целиком)</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Tab Content: Manual Measurement */}
                        {activeTab === 'manual' && (
                            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-md animate-in fade-in duration-300">
                                    {manualCanvasSource && (
                                    <div className="mb-4 flex justify-end">
                                        <button 
                                            onClick={() => setManualCanvasSource(null)}
                                            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                                        >
                                            Вернуть оригинал
                                        </button>
                                    </div>
                                    )}
                                <MeasurementCanvas 
                                    imageSrc={manualCanvasSource || imagePreview || ''} 
                                    onAreaChanged={setActiveArea} 
                                    onFinish={() => {
                                        if (isAiAvailable) setActiveTab('ai');
                                        else document.getElementById('cost-estimator')?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                />
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>

        {/* Cost Estimator Section - ALWAYS VISIBLE AT BOTTOM */}
        <div id="cost-estimator" className="border-t border-slate-700/50 pt-8 scroll-mt-48 animate-in fade-in slide-in-from-bottom-8 duration-700">
             <CostEstimator 
                area={totalArea} 
                onAreaChange={setActiveArea} 
                onRequestManualMeasure={() => {
                    setActiveTab('manual');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
             />
        </div>

      </div>
    </Layout>
  );
};

export default App;
