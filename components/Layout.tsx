import React from 'react';
import { Send, Globe, RotateCcw } from 'lucide-react';
import logo from '../logo.png';

interface LayoutProps {
  children: React.ReactNode;
  toolbar?: React.ReactNode;
  onReset?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, toolbar, onReset }) => {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 selection:bg-indigo-500 selection:text-white">
      <header className="fixed top-0 left-0 right-0 z-[100] bg-slate-900/95 backdrop-blur-md border-b border-slate-700/50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="h-10 w-auto object-contain" />
          </div>
          <nav className="flex items-center gap-4">
            {onReset && (
              <button
                onClick={onReset}
                className="p-2 text-slate-400 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-800/50 flex items-center gap-2"
                title="Сбросить все проекты"
              >
                <RotateCcw className="w-5 h-5" />
                <span className="text-sm font-medium hidden sm:inline">Сброс</span>
              </button>
            )}
            <a
              href="https://t.me/galfdesign"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-slate-400 hover:text-indigo-400 transition-colors rounded-lg hover:bg-slate-800/50"
              title="Telegram канал GalfDesign"
            >
              <Send className="w-5 h-5" />
            </a>
            <a
              href="https://galftools.ru/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-slate-400 hover:text-indigo-400 transition-colors rounded-lg hover:bg-slate-800/50"
              title="GalfTools - Инженерные сервисы"
            >
              <Globe className="w-5 h-5" />
            </a>
          </nav>
        </div>
        
        {toolbar && (
           <div className="border-t border-slate-800/50 animate-in slide-in-from-top-2 duration-200">
             <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
               {toolbar}
             </div>
           </div>
        )}
      </header>

      <main className={`px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-12 transition-all duration-200 ${toolbar ? 'pt-[11rem]' : 'pt-24'}`}>
        {children}
      </main>
    </div>
  );
};