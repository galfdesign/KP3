import React, { useRef, useState } from 'react';
import { UploadCloud, Image as ImageIcon, Loader2, FileText } from 'lucide-react';

interface ImageUploadProps {
  onImageSelected: (file: File) => void;
  isLoading: boolean;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ onImageSelected, isLoading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndPass(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndPass(e.target.files[0]);
    }
  };

  const validateAndPass = (file: File) => {
    // We now accept Word and PDF.
    // DWG is binary and hard for Gemini without conversion, so we warn about it,
    // but we can try to pass PDF/Doc.
    
    // Check extension
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const isWord = file.name.match(/\.(doc|docx)$/i) || file.type.includes('wordprocessingml') || file.type.includes('msword');
    
    if (file.name.match(/\.(dwg|dxf)$/i)) {
      alert('Файлы DWG не поддерживаются напрямую для визуального анализа в браузере. Пожалуйста, сохраните ваш проект в PDF для наилучшего результата.');
      return;
    }

    if (!isImage && !isPdf && !isWord) {
      alert('Пожалуйста, загрузите изображение, PDF проект или Word документ.');
      return;
    }
    onImageSelected(file);
  };

  return (
    <div
      className={`relative group border-2 border-dashed rounded-2xl p-12 transition-all duration-300 ease-in-out cursor-pointer overflow-hidden bg-slate-800/50 shadow-xl
        ${isDragging 
          ? 'border-indigo-500 bg-indigo-500/10' 
          : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800'
        }
        ${isLoading ? 'opacity-50 pointer-events-none' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleChange}
        accept="image/*,application/pdf,.doc,.docx"
        className="hidden"
      />
      
      <div className="flex flex-col items-center justify-center text-center space-y-4">
        <div className={`p-4 rounded-full transition-all duration-300 ${isDragging ? 'bg-indigo-600' : 'bg-slate-700/50 group-hover:bg-slate-700 group-hover:shadow-md'}`}>
          {isLoading ? (
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          ) : (
            <div className="relative">
                <UploadCloud className={`w-8 h-8 ${isDragging ? 'text-white' : 'text-indigo-400'}`} />
                <FileText className={`w-4 h-4 absolute -bottom-1 -right-1 ${isDragging ? 'text-white' : 'text-indigo-300'}`} />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold text-slate-200">
            {isLoading ? 'Обработка проекта...' : 'Загрузить проект (PDF, Image, Word)'}
          </p>
          <p className="text-sm text-slate-400">
            Полная поддержка многостраничных PDF
          </p>
          <p className="text-xs text-slate-500 pt-2 group-hover:text-slate-400 transition-colors">
            DWG рекомендуем сохранить как PDF
          </p>
        </div>
      </div>
      
      {/* Decorative gradient blob */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl transition-opacity duration-500 opacity-0 group-hover:opacity-100" />
    </div>
  );
};