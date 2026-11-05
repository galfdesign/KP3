import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { AnalysisData } from '../types';
import { ShieldCheck, AlertTriangle, HelpCircle } from 'lucide-react';

interface AnalysisChartProps {
  data: AnalysisData;
}

export const AnalysisChart: React.FC<AnalysisChartProps> = ({ data }) => {
  // Use confidence score, default to 75 if undefined (for backward compatibility or fallback)
  const score = data.confidenceScore ?? 75;
  
  // Determine color based on score
  let scoreColor = '#10b981'; // emerald-500
  let icon = <ShieldCheck className="w-6 h-6 text-emerald-400" />;
  let label = "Высокая";
  
  if (score < 50) {
      scoreColor = '#ef4444'; // red-500
      icon = <AlertTriangle className="w-6 h-6 text-red-400" />;
      label = "Низкая";
  } else if (score < 85) {
      scoreColor = '#f59e0b'; // amber-500
      icon = <HelpCircle className="w-6 h-6 text-amber-400" />;
      label = "Средняя";
  }

  const chartData = [
    { name: 'Confidence', value: score },
    { name: 'Remaining', value: 100 - score },
  ];

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-xl h-full flex flex-col">
      <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
        <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
        Достоверность анализа
      </h3>
      
      <div className="flex flex-col md:flex-row items-center gap-8 flex-1">
        
        {/* Gauge Chart */}
        <div className="relative w-48 h-48 md:w-56 md:h-56 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={80}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                stroke="none"
              >
                <Cell key="cell-score" fill={scoreColor} />
                <Cell key="cell-remaining" fill="#1e293b" /> {/* slate-800 */}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          
          {/* Center Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
             <span className="text-3xl font-bold text-white tracking-tight">{score}%</span>
             <span className="text-xs text-slate-400 uppercase font-medium mt-1 tracking-wide">{label}</span>
          </div>
        </div>

        {/* Details Panel */}
        <div className="flex flex-col gap-4 w-full">
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 flex items-start gap-4">
                <div className="bg-slate-800 p-2 rounded-lg border border-slate-700">
                    {icon}
                </div>
                <div>
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Предварительная оценка</span>
                    <p className="text-lg font-medium text-white mt-1 leading-snug">
                        {data.estimatedRealWorldArea || "Масштаб не определен"}
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="h-px bg-slate-700 flex-1"></div>
                    <span className="text-xs text-slate-500 uppercase font-bold">Выводы AI</span>
                    <div className="h-px bg-slate-700 flex-1"></div>
                </div>
                <div className="text-sm text-slate-300 leading-relaxed bg-slate-800/30 p-3 rounded-lg border border-slate-700/30 whitespace-pre-line">
                    {data.summary}
                </div>
            </div>
        </div>
      </div>
      
      {score < 50 && (
          <div className="mt-6 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-200">
                  Внимание: Низкая точность. Рекомендуется использовать функцию "Улучшить (HD)" или ручной замер для корректного расчета сметы.
              </p>
          </div>
      )}
    </div>
  );
};