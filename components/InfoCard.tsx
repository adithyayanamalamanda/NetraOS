import React, { useState } from 'react';
import { DetectionResult } from '../types.ts';
import { 
  Crosshair, 
  Volume2, 
  VolumeX, 
  Copy, 
  Check, 
  X, 
  AlertTriangle, 
  Calendar, 
  Cpu, 
  Sparkles,
  Share2,
  ShieldCheck
} from 'lucide-react';

interface InfoCardProps {
  result: DetectionResult;
  onDismiss?: () => void;
  onReplayAudio?: (text: string) => void;
}

export const InfoCard: React.FC<InfoCardProps> = ({ result, onDismiss, onReplayAudio }) => {
  const [copied, setCopied] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const handleCopy = () => {
    const reportText = `[NETRA-OS INTEL REPORT]
Target: ${result.objectName}
Description: ${result.spokenDescription}
${result.details ? `Details: ${result.details}\n` : ''}${result.safetyWarning ? `Hazard Alert: ${result.safetyWarning}\n` : ''}${result.expiryDate ? `Expiry Date: ${result.expiryDate}\n` : ''}`;
    
    navigator.clipboard.writeText(reportText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSpeech = () => {
    if (onReplayAudio) {
      setIsPlayingAudio(true);
      onReplayAudio(result.spokenDescription);
      setTimeout(() => setIsPlayingAudio(false), 3000);
    }
  };

  return (
    <div className="relative group w-full select-none animate-in slide-in-from-bottom-5 fade-in zoom-in-98 duration-300">
      {/* Outer Hologram Container */}
      <div className="relative bg-slate-950/90 backdrop-blur-2xl border border-cyan-500/40 text-cyan-50 p-5 sm:p-6 rounded-lg shadow-[0_0_50px_-10px_rgba(6,182,212,0.45)] clip-tech-border max-h-[75vh] flex flex-col overflow-hidden">
        
        {/* Hologram Grid & Ambient Glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent opacity-60 pointer-events-none" />
        <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Technical Deco Header */}
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 mb-3.5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400"></span>
            </span>
            <span className="text-[11px] font-cyber tracking-widest text-cyan-400 uppercase font-semibold flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
              <span>TARGET_LOCKED // AI_VISION</span>
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-cyan-500/80 font-semibold tracking-wider bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/20">
              ID-{Math.floor(1000 + Math.random() * 9000)}
            </span>
            {onDismiss && (
              <button 
                onClick={onDismiss}
                aria-label="Close"
                className="text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-500/15 p-1 rounded-md transition-all duration-150"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Target Title & Primary Actions */}
        <header className="mb-3.5 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl sm:text-3xl font-cyber font-bold uppercase tracking-tight text-white drop-shadow-[0_0_12px_rgba(6,182,212,0.8)] leading-tight truncate">
                {result.objectName}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/30">
                  <ShieldCheck className="w-3 h-3" />
                  CONFIRMED_MATCH
                </span>
              </div>
            </div>

            {/* Quick Action Toolbar */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {onReplayAudio && (
                <button
                  onClick={handleSpeech}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border transition-all duration-200 ${
                    isPlayingAudio
                      ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.5)]'
                      : 'bg-cyan-950/60 border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/60 hover:border-cyan-400'
                  }`}
                  title="Speak Intelligence Description"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline font-mono text-[10px] uppercase">Audio</span>
                </button>
              )}

              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/60 hover:border-cyan-400 px-2.5 py-1.5 rounded transition-all duration-200"
                title="Copy Intelligence Report"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline font-mono text-[10px] uppercase">{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
          <div className="h-0.5 w-24 bg-gradient-to-r from-cyan-400 via-cyan-500 to-transparent mt-2.5" />
        </header>

        {/* Content Body */}
        <section className="space-y-3.5 relative z-10 overflow-y-auto pr-1 custom-scrollbar flex-1">
          {/* Spoken / Summary Description */}
          <div className="bg-cyan-950/30 border-l-2 border-cyan-400 p-3.5 rounded-r-md">
            <div className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 uppercase mb-1">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>MULTIMODAL SYNTHESIS</span>
            </div>
            <p className="text-sm sm:text-base text-cyan-100/95 leading-relaxed font-normal">
              {result.spokenDescription}
            </p>
          </div>

          {/* Technical Details if distinct */}
          {result.details && result.details !== result.spokenDescription && (
            <div className="bg-black/40 border border-cyan-500/20 p-3 rounded-md">
              <span className="text-[10px] font-mono text-cyan-500 uppercase tracking-wider block mb-1">
                ANALYTICAL TELEMETRY:
              </span>
              <p className="text-xs font-mono text-cyan-300/90 leading-relaxed">
                {result.details}
              </p>
            </div>
          )}

          {/* Hazard & Expiry Badges */}
          <div className="flex flex-col gap-2 pt-0.5">
            {result.expiryDate && (
              <div className="flex items-center gap-2.5 bg-rose-950/60 border border-rose-500/50 px-3.5 py-2.5 rounded-md text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                <Calendar className="w-4 h-4 text-rose-400 animate-pulse flex-shrink-0" />
                <div className="text-xs font-mono font-bold uppercase tracking-wide">
                  <span className="text-rose-400 mr-1.5">EXPIRY DETECTED:</span>
                  <span>{result.expiryDate}</span>
                </div>
              </div>
            )}

            {result.safetyWarning && (
              <div className="flex items-start gap-2.5 bg-amber-950/60 border border-amber-500/60 px-3.5 py-2.5 rounded-md text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5 animate-bounce" />
                <div className="text-xs font-mono leading-tight">
                  <span className="font-bold text-amber-300 block uppercase mb-1">SAFETY HAZARD ADVISORY</span>
                  <span className="text-amber-100/90 leading-relaxed block">{result.safetyWarning}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Tactical Card Footer */}
        <footer className="mt-4 pt-2.5 border-t border-cyan-500/15 flex justify-between items-center opacity-80 flex-shrink-0 text-[10px] font-mono text-cyan-500">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>NETRA OS TACTICAL AR</span>
          </div>
          <div className="flex items-center gap-1 text-cyan-400 font-mono">
            <span>READY</span>
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
          </div>
        </footer>
      </div>
    </div>
  );
};