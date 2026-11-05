import React, { useState } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  Send,
  Youtube,
  Workflow,
  Boxes,
  Layers,
  Network,
  Phone,
  Link2,
} from 'lucide-react';

interface UsefulLink {
  id: string;
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string; // tailwind text class
  iconBg: string; // tailwind bg+border classes
}

const LINKS: UsefulLink[] = [
  {
    id: 'tg',
    title: 'Наш Telegram',
    url: 'https://t.me/galfdesign',
    icon: Send,
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/10 border-sky-500/30',
  },
  {
    id: 'yt',
    title: 'Наш YouTube',
    url: 'https://www.youtube.com/@galfdesign',
    icon: Youtube,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10 border-red-500/30',
  },
  {
    id: 'process',
    title: 'Процедура заказа',
    url: 'https://galftools.ru/design.html?module=process',
    icon: Workflow,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10 border-emerald-500/30',
  },
  {
    id: 'gl01',
    title: 'Гидромодули GL-01',
    url: 'https://galfai.ru/gl01/#cta',
    icon: Boxes,
    iconColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/10 border-indigo-500/30',
  },
  {
    id: 'transformer',
    title: 'Трансформер',
    url: 'https://galfai.ru/analogi/',
    icon: Layers,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10 border-amber-500/30',
  },
  {
    id: 'schemes',
    title: 'Схемы',
    url: 'https://galfai.ru/sxematest/',
    icon: Network,
    iconColor: 'text-fuchsia-400',
    iconBg: 'bg-fuchsia-500/10 border-fuchsia-500/30',
  },
  {
    id: 'contacts',
    title: 'Все контакты',
    url: 'https://galftools.ru/contacts.html?contact=design',
    icon: Phone,
    iconColor: 'text-teal-400',
    iconBg: 'bg-teal-500/10 border-teal-500/30',
  },
];

const LinkCard: React.FC<{
  link: UsefulLink;
  isCopied: boolean;
  onCopy: () => void;
}> = ({ link, isCopied, onCopy }) => {
  const Icon = link.icon;
  return (
    <div className="group flex items-center gap-3 bg-slate-900/50 border border-slate-700/50 rounded-xl p-3 hover:border-indigo-500/40 hover:bg-slate-900/70 transition-all">
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center ${link.iconBg}`}
      >
        <Icon className={`w-5 h-5 ${link.iconColor}`} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white leading-tight">{link.title}</p>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-400 hover:text-indigo-400 truncate block leading-tight transition-colors"
          title={link.url}
        >
          {link.url.replace(/^https?:\/\//, '')}
        </a>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onCopy}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            isCopied
              ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
              : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
          }`}
          title="Скопировать ссылку"
        >
          {isCopied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Скопировано</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Копировать</span>
            </>
          )}
        </button>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 hover:bg-indigo-600/30 hover:border-indigo-500/50 hover:text-white transition-all"
          title="Открыть в новой вкладке"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};

export const UsefulLinks: React.FC = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (link: UsefulLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId((cur) => (cur === link.id ? null : cur)), 1800);
    } catch (e) {
      console.error('Clipboard copy failed', e);
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-white text-lg flex items-center gap-2">
          <Link2 className="w-5 h-5 text-indigo-400" />
          Полезные ссылки для менеджера
        </h3>
        <span className="text-xs text-slate-500 hidden sm:block">
          {LINKS.length} ссылок · клик на бейдж копирует
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {LINKS.map((link) => (
          <LinkCard
            key={link.id}
            link={link}
            isCopied={copiedId === link.id}
            onCopy={() => handleCopy(link)}
          />
        ))}
      </div>
    </div>
  );
};

export default UsefulLinks;
