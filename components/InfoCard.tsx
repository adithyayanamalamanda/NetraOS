import React from 'react';
import { DetectionResult } from '../types.ts';
import { GoogleIcon } from './GoogleIcon.tsx';

interface InfoCardProps {
  result: DetectionResult;
  onDismiss?: () => void;
  onReplayAudio?: (text: string) => void;
}

export const InfoCard: React.FC<InfoCardProps> = ({ result, onDismiss, onReplayAudio }) => {
  return (
    <div className="relative group w-full">
      {/* Holographic Cyber Container */}
      <div className="relative bg-slate-950/90 backdrop-blur-2xl border border-cyan-500/40 text-cyan-50 p-5 sm:p-6 rounded-sm shadow-[0_0_50px_-10px_rgba(6,182,212,0.4)] animate-in slide-in-from-bottom-6 fade-in zoom-in-95 duration-400 clip-tech-border max-h-[75vh] flex flex-col overflow-hidden">
        
        {/* Hologram Scan Line & Grid Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent opacity-60 pointer-events-none animate-pulse" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Technical Deco Header */}
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 mb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
            <span className="text-[11px] font-cyber tracking-widest text-cyan-400 uppercase font-semibold flex items-center gap-1">
              <GoogleIcon name="center_focus_strong" size={14} className="text-cyan-400" />
              TARGET_LOCKED
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-cyan-600 font-semibold tracking-wider">
              SIG-{Math.floor(1000 + Math.random() * 9000)}
            </span>
            {onDismiss && (
              <button 
                onClick={onDismiss}
                aria-label="Close"
                className="text-cyan-500/60 hover:text-cyan-300 hover:bg-cyan-500/10 p-1 rounded transition-all duration-200"
              >
                <GoogleIcon name="close" size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Target Title */}
        <header className="mb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl sm:text-3xl font-cyber font-bold uppercase tracking-tight text-white drop-shadow-[0_0_12px_rgba(6,182,212,0.9)] leading-tight">
              {result.objectName}
            </h2>
            {onReplayAudio && (
              <button
                onClick={() => onReplayAudio(result.spokenDescription)}
                className="flex items-center gap-1 text-xs text-cyan-400 bg-cyan-950/70 border border-cyan-500/30 px-2 py-1 rounded hover:bg-cyan-900/60 transition-colors"
                title="Play Audio Description"
              >
                <GoogleIcon name="volume_up" size={16} />
                <span className="hidden sm:inline font-mono text-[10px]">REPEAT</span>
              </button>
            )}
          </div>
          <div className="h-0.5 w-16 bg-gradient-to-r from-cyan-400 via-cyan-500 to-transparent mt-2" />
        </header>

        {/* Content Body */}
        <section className="space-y-3 relative z-10 overflow-y-auto pr-1 custom-scrollbar flex-1">
          <div className="bg-cyan-950/30 border-l-2 border-cyan-400/80 p-3 rounded-r-sm">
            <p className="text-sm sm:text-base text-cyan-100/95 leading-relaxed font-normal">
              {result.spokenDescription}
            </p>
          </div>

          {/* Details if distinct */}
          {result.details && result.details !== result.spokenDescription && (
            <p className="text-xs font-mono text-cyan-400/80 leading-normal pl-1">
              <span className="text-cyan-600 uppercase mr-1">DATA:</span> {result.details}
            </p>
          )}

          {/* Warning Badges */}
          <div className="flex flex-col gap-2 pt-1">
            {result.expiryDate && (
              <div className="flex items-center gap-2 bg-rose-950/70 border border-rose-500/60 px-3 py-2 rounded-sm text-rose-200">
                <GoogleIcon name="event_busy" size={16} className="text-rose-400 animate-pulse" />
                <span className="text-xs font-mono font-bold uppercase tracking-wide">
                  EXPIRY: {result.expiryDate}
                </span>
              </div>
            )}

            {result.safetyWarning && (
              <div className="flex items-start gap-2 bg-amber-950/70 border border-amber-500/60 px-3 py-2 rounded-sm text-amber-200">
                <GoogleIcon name="warning" size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs font-mono leading-tight">
                  <span className="font-bold text-amber-300 block uppercase mb-0.5">HAZARD ALERT:</span>
                  {result.safetyWarning}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Tactical Footer */}
        <footer className="mt-4 pt-2 border-t border-cyan-500/10 flex justify-between items-center opacity-70 flex-shrink-0 text-[10px] font-mono text-cyan-500">
          <div className="flex items-center gap-1.5">
            <GoogleIcon name="memory" size={14} className="text-cyan-400" />
            <span>NETRA OS TACTICAL AR</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-sm" />
            <div className="w-1 h-2 bg-cyan-400 rounded-sm" />
            <div className="w-1.5 h-3 bg-cyan-400 rounded-sm" />
          </div>
        </footer>
      </div>
    </div>
  );
};