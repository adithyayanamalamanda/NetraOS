import React from 'react';
import { Keyboard, X, Command } from 'lucide-react';

interface KeyboardHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardHelpModal: React.FC<KeyboardHelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Space', desc: 'Trigger Instant Visual Scan' },
    { key: 'A', desc: 'Toggle Continuous Auto-Tracking' },
    { key: 'M', desc: 'Activate Voice Microphone Command' },
    { key: 'Q / T', desc: 'Open Direct Scene Query / Chat Prompt' },
    { key: 'C', desc: 'Switch Camera Facing Mode' },
    { key: 'F', desc: 'Toggle Fullscreen Mode' },
    { key: 'H', desc: 'Open Telemetry History Log' },
    { key: 'S', desc: 'Open System Config & API Keys' },
    { key: 'Esc', desc: 'Dismiss Active Target / Abort Audio' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-950 border border-cyan-500/50 p-6 w-full max-w-md clip-tech-border shadow-[0_0_40px_rgba(6,182,212,0.3)]">
        <div className="flex justify-between items-center mb-4 border-b border-cyan-500/30 pb-3">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-cyan-400" />
            <h2 className="text-cyan-300 font-cyber font-bold tracking-wider text-base uppercase">
              TACTICAL KEYBOARD HOTKEYS
            </h2>
          </div>
          <button onClick={onClose} className="text-cyan-500 hover:text-cyan-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2.5">
          {shortcuts.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs font-mono py-1 border-b border-cyan-950/60">
              <span className="text-cyan-200/90">{s.desc}</span>
              <kbd className="bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 px-2 py-0.5 rounded text-[11px] font-bold shadow">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-3 border-t border-cyan-500/20 text-center">
          <button
            onClick={onClose}
            className="w-full py-2 bg-cyan-500/20 border border-cyan-400 text-cyan-300 font-cyber text-xs uppercase hover:bg-cyan-500/30 rounded transition-colors"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
};
