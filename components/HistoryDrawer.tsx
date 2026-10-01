import React from 'react';
import { DetectionResult } from '../types.ts';
import { 
  History, 
  X, 
  Trash2, 
  Volume2, 
  ExternalLink, 
  ShieldAlert, 
  Calendar,
  Sparkles,
  Download
} from 'lucide-react';

interface HistoryItem {
  id: string;
  timestamp: string;
  result: DetectionResult;
}

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onSelectResult: (result: DetectionResult) => void;
  onClearHistory: () => void;
  onReplayAudio: (text: string) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onSelectResult,
  onClearHistory,
  onReplayAudio
}) => {
  if (!isOpen) return null;

  const exportHistoryJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `netra_telemetry_history_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex justify-end animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-slate-950/95 border-l border-cyan-500/40 h-full flex flex-col shadow-[-10px_0_40px_rgba(6,182,212,0.2)] animate-in slide-in-from-right duration-300"
      >
        {/* Header */}
        <div className="p-4 border-b border-cyan-500/30 flex items-center justify-between bg-cyan-950/30">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            <h2 className="text-cyan-300 font-cyber font-bold tracking-wider text-base uppercase">
              SECTOR SCAN LOG ({history.length})
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="text-cyan-400 hover:text-cyan-200 p-1 rounded hover:bg-cyan-500/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {history.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center text-cyan-500/60 font-mono text-xs">
              <Sparkles className="w-8 h-8 text-cyan-500/40 mb-2" />
              <p>NO TELEMETRY LOGS RECORDED YET.</p>
              <p className="text-[10px] text-cyan-600/70 mt-1">Initiate a Scan or Auto-Tracking to capture objects.</p>
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.id}
                className="bg-black/60 border border-cyan-500/30 hover:border-cyan-400/80 rounded-md p-3.5 transition-all duration-200 group relative"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="text-sm font-cyber font-bold uppercase text-white group-hover:text-cyan-300 transition-colors">
                    {item.result.objectName}
                  </h3>
                  <span className="text-[10px] font-mono text-cyan-500/80 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/20">
                    {item.timestamp}
                  </span>
                </div>

                <p className="text-xs text-cyan-100/80 font-sans line-clamp-2 mb-2 leading-relaxed">
                  {item.result.spokenDescription}
                </p>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {item.result.safetyWarning && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-amber-950/60 border border-amber-500/40 text-amber-300 px-1.5 py-0.5 rounded">
                      <ShieldAlert className="w-3 h-3" />
                      Hazard
                    </span>
                  )}
                  {item.result.expiryDate && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-rose-950/60 border border-rose-500/40 text-rose-300 px-1.5 py-0.5 rounded">
                      <Calendar className="w-3 h-3" />
                      {item.result.expiryDate}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-cyan-500/10 text-[11px] font-mono">
                  <button
                    onClick={() => {
                      onSelectResult(item.result);
                      onClose();
                    }}
                    className="text-cyan-400 hover:text-cyan-200 flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View Target HUD</span>
                  </button>

                  <button
                    onClick={() => onReplayAudio(item.result.spokenDescription)}
                    className="text-cyan-400/80 hover:text-cyan-200 p-1 hover:bg-cyan-500/20 rounded"
                    title="Play Audio"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer actions */}
        {history.length > 0 && (
          <div className="p-3 border-t border-cyan-500/30 bg-cyan-950/30 flex items-center justify-between gap-2">
            <button
              onClick={exportHistoryJSON}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/60 rounded text-xs font-mono"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Log</span>
            </button>

            <button
              onClick={onClearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/40 border border-red-500/40 text-red-300 hover:bg-red-900/40 rounded text-xs font-mono"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Log</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
