import React from 'react';
import { DetectionResult } from '../types.ts';

interface InfoCardProps {
  result: DetectionResult;
  onDismiss?: () => void;
}

export const InfoCard: React.FC<InfoCardProps> = ({ result, onDismiss }) => {
  return (
    <div className="relative group perspective-1000">
      {/* Holographic Container */}
      <div className="relative bg-slate-900/90 backdrop-blur-xl border border-cyan-500/30 text-cyan-50 p-6 rounded-sm shadow-[0_0_50px_-10px_rgba(6,182,212,0.3)] animate-in slide-in-from-bottom-8 fade-in zoom-in-95 duration-500 clip-tech-border max-h-[60vh] flex flex-col">
        
        {/* Animated Scan Line Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent opacity-50 pointer-events-none animate-pulse" />
        
        {/* Technical Deco Header */}
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 mb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-cyan-500 rounded-sm animate-ping" />
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">Target_Locked</span>
          </div>
          <span className="text-[10px] font-mono text-cyan-700">ID: {Math.floor(Math.random() * 99999)}</span>
        </div>

        <header className="pr-8 mb-4 flex-shrink-0">
          <h2 className="text-2xl font-bold uppercase tracking-tighter text-white drop-shadow-[0_0_10px_rgba(6,182,212,0.8)] leading-none">
            {result.objectName}
          </h2>
          <div className="h-0.5 w-12 bg-cyan-500 mt-2" />
        </header>

        {onDismiss && (
          <button 
            onClick={onDismiss}
            aria-label="Close"
            className="absolute top-2 right-2 p-3 text-cyan-500/50 hover:text-cyan-400 hover:rotate-90 transition-all duration-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}

        <section className="space-y-4 relative z-10 overflow-y-auto pr-2 custom-scrollbar">
          <p className="text-sm text-cyan-100/90 leading-relaxed font-light border-l-2 border-cyan-500/30 pl-3">
            {result.spokenDescription}
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            {result.expiryDate && (
              <div className="flex items-center gap-2 bg-rose-950/50 border border-rose-500/50 px-3 py-1.5 rounded-sm">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-mono uppercase text-rose-300">EXP: {result.expiryDate}</span>
              </div>
            )}

            {result.safetyWarning && (
              <div className="flex items-center gap-2 bg-amber-950/50 border border-amber-500/50 px-3 py-1.5 rounded-sm w-full">
                <svg className="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <span className="text-[10px] font-mono uppercase text-amber-300 leading-tight">{result.safetyWarning}</span>
              </div>
            )}
          </div>
        </section>

        <footer className="mt-6 flex justify-between items-end opacity-50 flex-shrink-0">
           <div className="flex gap-1">
             <div className="w-1 h-3 bg-cyan-500" />
             <div className="w-1 h-2 bg-cyan-500" />
             <div className="w-1 h-4 bg-cyan-500" />
           </div>
           <span className="text-[8px] font-mono">NETRA SYSTEM V2.0</span>
        </footer>
      </div>
    </div>
  );
};