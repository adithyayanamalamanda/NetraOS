import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AppState, DetectionResult, DetectedObject } from './types.ts';
import { 
  identifyObject, 
  detectObjectsLive, 
  chatWithScene, 
  describeLocation,
  getAvailableApiKeys,
  saveCustomApiKeys,
  getSelectedModel,
  saveSelectedModel
} from './services/geminiService.ts';
import { InfoCard } from './components/InfoCard.tsx';
import { GoogleIcon } from './components/GoogleIcon.tsx';

// Settings & Constants
const AUTO_SCAN_INTERVAL = 3500; 
const ANNOUNCE_INTERVAL = 9000;
const CHANGE_THROTTLE = 1200; 
const MATCH_THRESHOLD = 250; 
const SMOOTHING_FACTOR = 0.6; 
const FUZZY_THRESHOLD = 0.35; 

// Voice Response Banks
const RESPONSES = {
  ACKNOWLEDGE: ["Copy.", "Understood.", "Command received.", "Tactical link active.", "Executing."],
  SCANNING: ["Scanning sector.", "Visual sweep initiated.", "Sensors active.", "Processing visual feed.", "Acquiring targets."],
  AUTO_ON: ["Surveillance mode: Engaged.", "Continuous tracking: Active.", "Auto-scan initialized."],
  AUTO_OFF: ["Surveillance mode: Disengaged.", "Manual control restored.", "Holding position."],
  STOP: ["Aborting.", "Systems reset.", "Command cancelled.", "Standing by."],
  ERROR: ["Signal lost.", "Visual interference detected.", "Negative.", "Sensor link interrupted."]
};

const getRandomResponse = (category: keyof typeof RESPONSES) => {
  const options = RESPONSES[category];
  return options[Math.floor(Math.random() * options.length)];
};

// Utilities: Fuzzy Matching
const levenshtein = (a: string, b: string): number => {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[][] = [];
  for (let i = 0; i <= bn; ++i) {
    matrix[i] = [i];
  }
  for (let j = 1; j <= an; ++j) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1],
          matrix[i][j - 1],
          matrix[i - 1][j]
        ) + 1;
      }
    }
  }
  return matrix[bn][an];
};

const isFuzzyMatch = (transcript: string, keyword: string, threshold = FUZZY_THRESHOLD): boolean => {
  const tLower = transcript.toLowerCase();
  const kLower = keyword.toLowerCase();
  
  try {
    const escapedKeyword = kLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    if (regex.test(tLower)) return true;
  } catch (e) {
    if (tLower.includes(kLower)) return true;
  }

  const tWords = tLower.split(/\s+/);
  const kWords = kLower.split(/\s+/);

  if (kWords.length > 1) {
    if (tWords.length < kWords.length) return false;
    for (let i = 0; i <= tWords.length - kWords.length; i++) {
      const windowPhrase = tWords.slice(i, i + kWords.length).join(' ');
      const dist = levenshtein(windowPhrase, kLower);
      if (dist / Math.max(windowPhrase.length, kLower.length) <= threshold) return true;
    }
    return false;
  } else {
    return tWords.some(w => {
      const dist = levenshtein(w, kLower);
      const localThreshold = w.length < 4 ? 0.2 : threshold; 
      return dist / Math.max(w.length, kLower.length) <= localThreshold;
    });
  }
};

const checkCommand = (transcript: string, keywords: string[]): boolean => {
  return keywords.some(k => isFuzzyMatch(transcript, k));
};

// Reticle and Audio Wave Components
const Reticle = ({ active }: { active: boolean }) => (
  <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all duration-500 ${active ? 'opacity-100 scale-100' : 'opacity-35 scale-90'}`}>
    <div className="relative w-40 h-40 flex items-center justify-center">
      {/* Outer Rotating Ring */}
      <div className={`absolute inset-0 border border-cyan-500/40 rounded-full border-dashed ${active ? 'animate-cyber-spin border-cyan-400' : ''}`} />
      <div className={`absolute inset-3 border border-cyan-400/20 rounded-full ${active ? 'animate-cyber-spin-reverse' : ''}`} />
      
      {/* Center Target Crosshairs */}
      <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full shadow-[0_0_10px_#06b6d4]" />
      <div className="absolute top-0 w-0.5 h-4 bg-cyan-400/80" />
      <div className="absolute bottom-0 w-0.5 h-4 bg-cyan-400/80" />
      <div className="absolute left-0 h-0.5 w-4 bg-cyan-400/80" />
      <div className="absolute right-0 h-0.5 w-4 bg-cyan-400/80" />
      
      {/* Corner Brackets */}
      <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-cyan-400" />
      <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-cyan-400" />
      <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-cyan-400" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-cyan-400" />
    </div>
  </div>
);

const AudioWave = ({ listening }: { listening: boolean }) => (
  <div className={`flex items-center gap-0.5 h-4 transition-opacity duration-300 ${listening ? 'opacity-100' : 'opacity-40'}`}>
    {[1, 2, 3, 4, 5, 6].map(i => (
      <div 
        key={i} 
        className={`w-0.5 bg-cyan-400 rounded-full transition-all duration-150 ${listening ? 'animate-tech-pulse' : 'h-1'}`} 
        style={{ 
          height: listening ? `${Math.max(4, (i % 3 + 1) * 5 + Math.random() * 8)}px` : '3px',
          animationDelay: `${i * 0.08}s` 
        }} 
      />
    ))}
  </div>
);

export const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [liveObjects, setLiveObjects] = useState<DetectedObject[]>([]);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<{ message: string; type: string } | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState<string | null>(null);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [isAutoScanEnabled, setIsAutoScanEnabled] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Tactical Chat / Direct Input Prompt
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [textPrompt, setTextPrompt] = useState('');

  // Settings & API Keys
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySavedNotice, setApiKeySavedNotice] = useState(false);
  const [activeModel, setActiveModel] = useState(getSelectedModel());
  const [settings, setSettings] = useState({
    speechRate: 1.0,
    voicePitch: 0,
    labelScale: 1.0,
    soundFx: true,
    selectedVoiceURI: ''
  });
  const settingsRef = useRef(settings);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const abortControllerRef = useRef<number>(0);
  const timeoutIdRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const isSpeakingRef = useRef<boolean>(false);
  
  const historyRef = useRef<DetectedObject[]>([]);
  const liveObjectsRef = useRef<DetectedObject[]>([]);
  const lastAnnounceTimeRef = useRef<number>(0);
  const lastAnnouncedNamesRef = useRef<string[]>([]);
  const startListeningRef = useRef<() => void>(() => {});

  useEffect(() => { liveObjectsRef.current = liveObjects; }, [liveObjects]);

  // Load API Keys into settings input on mount
  useEffect(() => {
    const keys = getAvailableApiKeys();
    setApiKeyInput(keys.join(', '));
  }, []);

  // Load Speech Voices
  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // Audio Engine
  const stopAudio = useCallback(() => {
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
  }, []);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const playChime = useCallback((type: 'start' | 'success' | 'click' | 'error' | 'scan') => {
    if (!settingsRef.current.soundFx) return;
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      if (type === 'start') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.25);
      } else if (type === 'scan') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(900, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.15);
      } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.25);
      } else if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
        osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.16); // D6
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.04);
      }
      
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.29);
    } catch (e) {}
  }, [getAudioContext]);

  const triggerHaptic = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }, []);

  const playAudio = useCallback(async (text: string, sessionId: number): Promise<void> => {
    window.speechSynthesis.cancel();
    if (sessionId !== abortControllerRef.current) return;

    isSpeakingRef.current = true;
    setAgentMessage(text); 
    
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      
      if (settingsRef.current.selectedVoiceURI) {
        const userVoice = voices.find(v => v.voiceURI === settingsRef.current.selectedVoiceURI);
        if (userVoice) utterance.voice = userVoice;
      }
      
      if (!utterance.voice) {
        const preferredVoice = voices.find(v => v.name.includes("Google US English") || v.name.includes("Natural")) ||
                               voices.find(v => v.name.includes("Zira")) ||
                               voices.find(v => v.name.includes("Samantha")) ||
                               voices.find(v => v.lang === 'en-US' && v.name.toLowerCase().includes("female")) ||
                               voices.find(v => v.lang.startsWith('en'));
        if (preferredVoice) utterance.voice = preferredVoice;
      }

      utterance.pitch = 1 + (settingsRef.current.voicePitch / 800);
      utterance.rate = settingsRef.current.speechRate;

      utterance.onend = () => { 
        isSpeakingRef.current = false;
        setAgentMessage(null);
        resolve(); 
      };

      utterance.onerror = () => {
        isSpeakingRef.current = false;
        setAgentMessage(null);
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }, [voices]);

  // Frame Capture for Vision Inference
  const captureFrame = useCallback((quality = 0.4, customScale?: number) => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // If video is active and playing
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const scale = customScale ?? 0.5; 
      canvas.width = Math.max(320, video.videoWidth * scale);
      canvas.height = Math.max(240, video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality).split(',')[1];
    }
    
    // If canvas already has an image drawn (e.g. uploaded photo)
    if (canvas.width > 0 && canvas.height > 0) {
      return canvas.toDataURL('image/jpeg', quality).split(',')[1];
    }
    
    return null;
  }, []);

  const handleStop = useCallback(() => {
    abortControllerRef.current += 1;
    stopAudio();
    setAppState(AppState.IDLE);
    setResult(null);
    setFocusedId(null);
    setRecognizedText(null);
    setAgentMessage(null);
  }, [stopAudio]);

  const reportLocation = useCallback(async (id: number) => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (id !== abortControllerRef.current) return;
          try {
            const { latitude, longitude } = position.coords;
            const description = await describeLocation(latitude, longitude);
            
            if (id === abortControllerRef.current) {
              setLocationName(description);
              
              const locResult: DetectionResult = {
                objectName: "CURRENT SECTOR",
                details: "GPS & Telemetry Geolocation",
                spokenDescription: `Sector telemetry confirmed. You are located in ${description}.`,
                safetyWarning: "Standard spatial awareness advised."
              };
              
              setResult(locResult);
              setAppState(AppState.SPEAKING);
              
              await playAudio(locResult.spokenDescription, id);
              if (id === abortControllerRef.current) startListeningRef.current();
            }
          } catch (e) {
            if (id === abortControllerRef.current) {
              await playAudio("Location telemetry unavailable.", id);
              startListeningRef.current();
            }
          }
        },
        async () => {
          if (id === abortControllerRef.current) {
            await playAudio("GPS sensor permission not granted.", id);
            startListeningRef.current();
          }
        },
        { timeout: 8000, enableHighAccuracy: false }
      );
    } else {
      if (id === abortControllerRef.current) {
        await playAudio("GPS hardware node offline.", id);
        startListeningRef.current();
      }
    }
  }, [playAudio]);

  const matchAndSmooth = useCallback((incoming: DetectedObject[]) => {
    const prev = historyRef.current;
    const smoothed = incoming.map(obj => {
      const currentCenter = { x: (obj.xmin + obj.xmax) / 2, y: (obj.ymin + obj.ymax) / 2 };
      let bestMatch: DetectedObject | null = null;
      let minDistance = MATCH_THRESHOLD;
      prev.forEach(p => {
        if (p.name.toLowerCase() === obj.name.toLowerCase()) {
          const pCenter = { x: (p.xmin + p.xmax) / 2, y: (p.ymin + p.ymax) / 2 };
          const dist = Math.sqrt(Math.pow(currentCenter.x - pCenter.x, 2) + Math.pow(currentCenter.y - pCenter.y, 2));
          if (dist < minDistance) { minDistance = dist; bestMatch = p; }
        }
      });
      if (bestMatch) {
        const m = bestMatch as DetectedObject;
        return {
          ...obj,
          id: m.id,
          ymin: m.ymin + (obj.ymin - m.ymin) * SMOOTHING_FACTOR,
          xmin: m.xmin + (obj.xmin - m.xmin) * SMOOTHING_FACTOR,
          ymax: m.ymax + (obj.ymax - m.ymax) * SMOOTHING_FACTOR,
          xmax: m.xmax + (obj.xmax - m.xmax) * SMOOTHING_FACTOR,
        };
      }
      return obj;
    });
    historyRef.current = smoothed;
    return smoothed;
  }, []);

  const manualScan = useCallback(async () => {
    setAppState(AppState.SCANNING);
    setError(null);
    setResult(null);
    setFocusedId(null);
    const id = ++abortControllerRef.current;
    const base64 = captureFrame(0.35, 0.4);
    
    playChime('scan');
    
    try {
      const objects = await detectObjectsLive(base64 || "");
      if (id !== abortControllerRef.current) return;
      
      setLiveObjects(matchAndSmooth(objects));
      setAppState(AppState.IDLE); 
      
      const names = Array.from(new Set(objects.map(o => o.name)));
      let speech = "";
      if (names.length > 0) {
        speech = `Visual scan complete. Detected: ${names.slice(0, 4).join(', ')}. Select a target for tactical telemetry.`;
      } else {
        speech = "Scan complete. No interactive targets identified in sector.";
      }
      
      await playAudio(speech, id);
      if (id === abortControllerRef.current) startListeningRef.current(); 

    } catch (e: any) {
      if (e?.message?.includes('NO_API_KEY')) {
        setShowSettings(true);
      }
      setError({ message: e?.message || "Optical sensor processing failure.", type: 'analysis' });
      setAppState(AppState.IDLE);
    }
  }, [playChime, captureFrame, matchAndSmooth, playAudio]);

  const handleChatInteraction = useCallback(async (promptText: string) => {
    if (!promptText.trim()) return;
    const sessionId = ++abortControllerRef.current;
    setAppState(AppState.SCANNING); 
    setRecognizedText(promptText);
    playChime('click');
    
    try {
      const base64 = captureFrame(0.4, 0.45);
      const responseText = await chatWithScene(base64 || "", promptText);
      if (sessionId !== abortControllerRef.current) return;
      
      setAppState(AppState.SPEAKING);
      await playAudio(responseText, sessionId);
      if (sessionId === abortControllerRef.current) {
        setAppState(AppState.IDLE);
        startListeningRef.current();
      }
    } catch (e) {
      if (sessionId === abortControllerRef.current) startListeningRef.current();
      setAppState(AppState.IDLE);
    }
  }, [captureFrame, playAudio, playChime]);

  const handleObjectClick = useCallback(async (obj: DetectedObject) => {
    if (focusedId === obj.id && appState === AppState.SPEAKING) return;
    playChime('success');
    triggerHaptic(25);
    const sessionId = ++abortControllerRef.current;
    setFocusedId(obj.id);
    setAppState(AppState.SCANNING); 
    setResult(null); 
    setError(null);
    
    const checkingAudioPromise = playAudio(`Acquiring telemetry: ${obj.name}.`, sessionId);
    try {
      const base64 = captureFrame(0.4, 0.45); 
      const detectionPromise = identifyObject(base64 || "", obj.name);
      const [_, detection] = await Promise.all([checkingAudioPromise, detectionPromise]);
      
      if (sessionId !== abortControllerRef.current) return;
      setResult(detection); 
      setAppState(AppState.SPEAKING);
      
      const speechParts = [
        detection.spokenDescription, 
        detection.safetyWarning ? `Warning: ${detection.safetyWarning}.` : '',
        detection.expiryDate ? `Expiry date: ${detection.expiryDate}.` : ''
      ].filter(Boolean);
      
      await playAudio(speechParts.join(' '), sessionId);
      if (sessionId === abortControllerRef.current) startListeningRef.current();
    } catch (err: any) {
      if (sessionId === abortControllerRef.current) handleStop(); 
    }
  }, [focusedId, appState, playAudio, playChime, handleStop, triggerHaptic, captureFrame]);

  // Voice Command Processor
  const processVoiceCommand = useCallback(async (transcript: string) => {
    const lower = transcript.toLowerCase().trim();
    const id = ++abortControllerRef.current;
    setRecognizedText(transcript);

    // 1. Abort / Reset Commands
    if (checkCommand(lower, ["stop", "cancel", "reset", "shut down", "exit", "silence", "abort", "standby"])) {
      setAppState(AppState.IDLE);
      const msg = getRandomResponse("STOP");
      if (isAutoScanEnabled) {
        setIsAutoScanEnabled(false);
        await playAudio(getRandomResponse("AUTO_OFF"), id);
      } else {
        handleStop();
        await playAudio(msg, id);
      }
      startListeningRef.current();
      return;
    }

    // 2. Surveillance Mode
    if (checkCommand(lower, ["auto scan", "continuous", "surveillance", "tracking mode", "auto mode", "start tracking"])) {
      if (!isAutoScanEnabled) {
        setIsAutoScanEnabled(true);
        setFocusedId(null);
        await playAudio(getRandomResponse("AUTO_ON"), id);
      }
      startListeningRef.current();
      return;
    }

    // 3. Scan Command
    if (checkCommand(lower, ["scan", "look around", "what's around", "analyze scene", "what do you see", "report sector", "sweep"])) {
      await playAudio(getRandomResponse("SCANNING"), id);
      manualScan();
      return;
    }
    
    // 4. Location Command
    if (checkCommand(lower, ["where am i", "report location", "my position", "coordinates", "gps", "sector"])) {
      await playAudio(getRandomResponse("ACKNOWLEDGE"), id);
      await reportLocation(id);
      return;
    }

    // 5. Help / Status
    if (checkCommand(lower, ["help", "status", "commands", "options", "who are you"])) {
      await playAudio("Agent NETRA tactical system online. Voice commands available: Scan Sector, Auto Surveillance, 'Describe [Object]', Report Location, Read Text, or Ask any visual query.", id);
      startListeningRef.current();
      return;
    }

    // 6. Object Focus Intent
    const intentPrefixes = ["describe", "tell me about", "analyze", "inspect", "what is", "look at", "check", "examine", "read"];
    let searchTarget = lower;
    let hasIntent = false;
    
    const matchedPrefix = intentPrefixes.find(p => lower.startsWith(p));
    if (matchedPrefix) {
      hasIntent = true;
      searchTarget = lower.slice(matchedPrefix.length).trim().replace(/^(the|a|an|this|that)\s+/g, "");
    }

    const match = liveObjectsRef.current.find(obj => {
      const cleanName = obj.name.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
      if (hasIntent) {
        return isFuzzyMatch(searchTarget, cleanName, FUZZY_THRESHOLD);
      }
      return isFuzzyMatch(lower, cleanName, FUZZY_THRESHOLD);
    });

    if (match) {
      handleObjectClick(match);
      return;
    }

    // 7. Conversational Scene Query Fallthrough
    if (transcript.trim().length > 1) {
      await playAudio(getRandomResponse("ACKNOWLEDGE"), id); 
      handleChatInteraction(transcript);
      return;
    }
    
    startListeningRef.current();
  }, [isAutoScanEnabled, manualScan, handleChatInteraction, handleStop, handleObjectClick, playAudio, reportLocation]);

  // Web Speech Recognition
  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
    if (isSpeakingRef.current) return;
    if (recognitionRef.current) { 
      try { recognitionRef.current.stop(); } catch(e) {} 
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false; 
    recognition.interimResults = false; 
    recognition.lang = 'en-US';
    
    recognition.onstart = () => { setIsListening(true); };
    recognition.onend = () => { setIsListening(false); };
    recognition.onerror = () => { setIsListening(false); };
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setRecognizedText(transcript);
      processVoiceCommand(transcript);
    };
    
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {}
  }, [processVoiceCommand]);

  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // Surveillance Automation Loop
  useEffect(() => {
    if (liveObjects.length === 0 || focusedId !== null) return;
    const now = Date.now();
    const currentNames = Array.from(new Set(liveObjects.map(o => o.name.toLowerCase()))).sort();
    if (currentNames.length === 0) return;
    const hasChanged = JSON.stringify(currentNames) !== JSON.stringify(lastAnnouncedNamesRef.current);
    const timeSinceLast = now - lastAnnounceTimeRef.current;
    
    if ((hasChanged && timeSinceLast > CHANGE_THROTTLE) || timeSinceLast > ANNOUNCE_INTERVAL) {
      if (isAutoScanEnabled) {
        const text = `Identified: ${currentNames.slice(0, 4).join(', ')}.`;
        const sessionId = abortControllerRef.current;
        playAudio(text, sessionId).then(() => { 
          if (sessionId === abortControllerRef.current) startListening(); 
        });
        lastAnnounceTimeRef.current = now;
        lastAnnouncedNamesRef.current = currentNames;
      }
    }
  }, [liveObjects, focusedId, playAudio, startListening, isAutoScanEnabled]);

  const runDetectionLoop = useCallback(async () => {
    if (!isCameraActive || !isAutoScanEnabled || focusedId !== null || error) {
      timeoutIdRef.current = window.setTimeout(runDetectionLoop, 1000); 
      return;
    }
    const base64 = captureFrame(0.25, 0.25);
    try {
      const objects = await detectObjectsLive(base64 || "");
      if (focusedId !== null) { 
        timeoutIdRef.current = window.setTimeout(runDetectionLoop, 1000); 
        return; 
      }
      setLiveObjects(matchAndSmooth(objects));
      timeoutIdRef.current = window.setTimeout(runDetectionLoop, AUTO_SCAN_INTERVAL);
    } catch (e: any) { 
      timeoutIdRef.current = window.setTimeout(runDetectionLoop, 3000); 
    }
  }, [isCameraActive, isAutoScanEnabled, focusedId, error, matchAndSmooth, captureFrame]);

  useEffect(() => { 
    if (isCameraActive && isAutoScanEnabled) runDetectionLoop(); 
    return () => { 
      if (timeoutIdRef.current) window.clearTimeout(timeoutIdRef.current); 
    }; 
  }, [isCameraActive, isAutoScanEnabled, runDetectionLoop]);

  // Camera Management (Front/Back/Webcam Auto-fallback)
  const startCameraStream = useCallback(async (facing: 'environment' | 'user') => {
    try {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
      
      let stream: MediaStream | null = null;
      try {
        // Try requested facing mode first
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch (err1) {
        // Fallback to any available video device on desktop/laptop
        stream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }

      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        setIsCameraActive(true);
        setCameraFacing(facing);
        setError(null);
      }
    } catch (err: any) {
      console.warn("Camera stream error:", err);
      setIsCameraActive(false);
      setError({ message: "Camera sensor offline or permission denied. You can also upload test imagery.", type: 'camera' });
    }
  }, []);

  useEffect(() => {
    startCameraStream(cameraFacing);
    return () => { 
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraFacing, startCameraStream]);

  // Toggle Camera Facing
  const toggleCameraFacing = useCallback(() => {
    playChime('click');
    setCameraFacing(prev => prev === 'environment' ? 'user' : 'environment');
  }, [playChime]);

  // Image Upload / Drag and Drop Handler for Testing Without Camera
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            manualScan();
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Initialization Handler
  const initializeSystem = useCallback(() => {
    const ctx = getAudioContext();
    ctx.resume().then(() => {
      setHasInitialized(true);
      const id = abortControllerRef.current;
      playChime('start');
      setTimeout(() => {
        playAudio("Agent NETRA online. Tactical visual link established. Awaiting command.", id).then(() => {
          reportLocation(id);
        });
      }, 700);
    });
  }, [getAudioContext, playChime, playAudio, reportLocation]);

  // Save API Key Configuration
  const handleSaveApiKeys = () => {
    saveCustomApiKeys(apiKeyInput);
    saveSelectedModel(activeModel);
    setApiKeySavedNotice(true);
    playChime('success');
    setTimeout(() => setApiKeySavedNotice(false), 2500);
  };

  const hasKeys = getAvailableApiKeys().length > 0;

  return (
    <div className="relative w-full h-dvh bg-[#030712] overflow-hidden select-none font-sans text-cyan-50">
      
      {/* Video Feed Layer */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="w-full h-full object-cover z-0" 
      />
      <canvas ref={canvasRef} className="hidden" />
      <input 
        ref={fileInputRef} 
        type="file" 
        accept="image/*" 
        className="hidden" 
        onChange={handleImageUpload} 
      />

      {/* --- INITIALIZATION OVERLAY (Audio & Web Access Unlock) --- */}
      {!hasInitialized && (
        <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 hologram-grid">
          <div className="text-center space-y-6 max-w-md animate-in fade-in zoom-in-95 duration-700 bg-slate-950/80 border border-cyan-500/40 p-8 rounded-sm clip-tech-border shadow-[0_0_60px_rgba(6,182,212,0.25)]">
            
            <div className="flex justify-center mb-2">
              <div className="w-16 h-16 rounded-full bg-cyan-950/80 border border-cyan-400 flex items-center justify-center shadow-[0_0_20px_#06b6d4]">
                <GoogleIcon name="visibility" size={36} className="text-cyan-400 animate-pulse" />
              </div>
            </div>

            <div>
              <h1 className="text-3xl sm:text-4xl font-cyber font-black tracking-tight text-white drop-shadow-[0_0_15px_rgba(6,182,212,0.9)]">
                NETRA <span className="text-cyan-400">OS</span>
              </h1>
              <p className="text-cyan-500 font-mono text-xs sm:text-sm tracking-widest uppercase mt-1">
                Tactical AR Visual Assistant V2.4
              </p>
            </div>

            <p className="text-xs sm:text-sm text-cyan-100/70 font-light leading-relaxed">
              Multimodal optical intelligence designed for spatial awareness, hazard detection, object telemetry, and situational voice interaction.
            </p>

            {!hasKeys && (
              <div className="bg-amber-950/50 border border-amber-500/40 p-3 rounded-sm text-left">
                <div className="flex items-center gap-2 text-amber-300 font-mono text-xs font-bold uppercase mb-1">
                  <GoogleIcon name="key" size={16} />
                  <span>Setup Gemini API Key</span>
                </div>
                <p className="text-[11px] text-amber-200/80">
                  Optional: You can enter your Gemini API key in Config or start right now in Demo mode.
                </p>
              </div>
            )}

            <div className="pt-2 flex flex-col gap-3">
              <button 
                onClick={initializeSystem}
                className="w-full bg-cyan-500/20 border border-cyan-400 text-cyan-300 px-6 py-4 font-cyber font-bold uppercase tracking-widest text-base hover:bg-cyan-500/30 hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] transition-all duration-300 clip-tech-border flex items-center justify-center gap-2"
              >
                <GoogleIcon name="power_settings_new" size={20} />
                INITIALIZE TACTICAL LINK
              </button>

              <button 
                onClick={() => { setShowSettings(true); initializeSystem(); }}
                className="text-xs font-mono text-cyan-600 hover:text-cyan-400 flex items-center justify-center gap-1 transition-colors py-1"
              >
                <GoogleIcon name="tune" size={14} />
                Configure API Keys & Telemetry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- HUD GRAPHICS & RETICLE LAYER --- */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.75)_100%)] opacity-85" />
        <div className="absolute inset-0 hologram-grid opacity-15" />
        <div className="absolute inset-0 hologram-scanline pointer-events-none" />
        
        <Reticle active={appState === AppState.SCANNING || appState === AppState.SPEAKING} />

        {/* Tactical Corner Brackets */}
        <div className="absolute top-4 left-4 pt-safe pl-1 text-cyan-500/70">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M1 35V8L8 1H35" stroke="currentColor" strokeWidth="2"/></svg>
        </div>
        <div className="absolute top-4 right-4 pt-safe pr-1 text-cyan-500/70 rotate-90">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M1 35V8L8 1H35" stroke="currentColor" strokeWidth="2"/></svg>
        </div>
        <div className="absolute bottom-4 left-4 pb-safe pl-1 text-cyan-500/70 -rotate-90">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M1 35V8L8 1H35" stroke="currentColor" strokeWidth="2"/></svg>
        </div>
        <div className="absolute bottom-4 right-4 pb-safe pr-1 text-cyan-500/70 rotate-180">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none"><path d="M1 35V8L8 1H35" stroke="currentColor" strokeWidth="2"/></svg>
        </div>

        {/* Animated Laser Sweep during Scan */}
        {appState === AppState.SCANNING && <div className="animate-laser-sweep" />}
      </div>

      {/* --- AR BOUNDING BOXES & INTERACTIVE NODES --- */}
      <div className="absolute inset-0 pointer-events-none z-20">
        {liveObjects.map((obj) => {
          const isThisFocused = focusedId === obj.id;
          const isAnyFocused = focusedId !== null;
          
          return (
            <div
              key={obj.id}
              className={`absolute pointer-events-auto cursor-pointer transition-all duration-300 ${
                isThisFocused 
                  ? 'border-2 border-cyan-300 bg-cyan-400/25 z-30 shadow-[0_0_30px_rgba(6,182,212,0.8)]' 
                  : isAnyFocused 
                    ? 'opacity-0 scale-95' 
                    : 'border border-cyan-400/60 bg-cyan-950/20 hover:border-cyan-200 hover:bg-cyan-400/15 hover:shadow-[0_0_20px_rgba(6,182,212,0.5)]'
              }`}
              style={{ 
                top: `${obj.ymin / 10}%`, 
                left: `${obj.xmin / 10}%`, 
                width: `${Math.max(6, (obj.xmax - obj.xmin) / 10)}%`, 
                height: `${Math.max(6, (obj.ymax - obj.ymin) / 10)}%` 
              }}
              onClick={() => handleObjectClick(obj)}
              onMouseEnter={() => triggerHaptic(5)}
            >
              {/* Corner Crosshairs */}
              <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-cyan-300" />
              <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-cyan-300" />
              <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-cyan-300" />
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-cyan-300" />
              
              {/* Object Tag Badge */}
              <div className={`absolute -top-7 left-0 flex items-center gap-1.5 transition-opacity duration-200 ${isAnyFocused && !isThisFocused ? 'opacity-0' : 'opacity-100'}`}>
                <span 
                  className="bg-black/90 border border-cyan-400/70 text-cyan-300 font-bold font-mono px-2 py-0.5 uppercase tracking-wider backdrop-blur-md whitespace-nowrap shadow-lg flex items-center gap-1"
                  style={{ fontSize: `${11 * settings.labelScale}px` }}
                >
                  <GoogleIcon name="touch_app" size={12} className="text-cyan-400" />
                  {obj.name}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* --- GLOBAL INFO CARD MODAL --- */}
      {result && (
        <div 
          className="absolute z-50 pointer-events-auto w-[92vw] max-w-sm" 
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <InfoCard 
            result={result} 
            onDismiss={handleStop}
            onReplayAudio={(text) => playAudio(text, abortControllerRef.current)} 
          />
        </div>
      )}

      {/* --- REAL-TIME VOICE TRANSCRIPTION BANNER --- */}
      {recognizedText && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full flex justify-center mt-safe px-4">
          <div className="bg-black/90 border border-cyan-500/70 px-6 py-2.5 backdrop-blur-xl clip-tech-border max-w-md shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center gap-2">
            <GoogleIcon name="graphic_eq" size={18} className="text-cyan-400 animate-pulse" />
            <span className="text-cyan-300 font-mono text-sm sm:text-base uppercase tracking-wider truncate">
              "{recognizedText}"
            </span>
          </div>
        </div>
      )}

      {/* --- AGENT VOICE SUBTITLES --- */}
      {agentMessage && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full max-w-md flex justify-center px-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-950/95 border border-cyan-500/60 px-5 py-3.5 backdrop-blur-2xl clip-tech-border shadow-[0_0_25px_rgba(6,182,212,0.3)]">
            <div className="flex items-center gap-2 mb-1">
              <GoogleIcon name="smart_toy" size={14} className="text-cyan-400 animate-pulse" />
              <span className="text-[10px] font-cyber text-cyan-400 uppercase tracking-widest">TRANSMISSION // NETRA AGENT</span>
            </div>
            <p className="text-cyan-50 font-mono text-xs sm:text-sm leading-relaxed text-left">
              {agentMessage}
            </p>
          </div>
        </div>
      )}
      
      {/* --- SCANNING / PROCESSING PULSE VISUALIZER --- */}
      {(appState === AppState.SCANNING || appState === AppState.SPEAKING) && !result && !agentMessage && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full border-2 border-cyan-400/40 flex items-center justify-center relative animate-cyber-spin">
            <div className="absolute inset-1 rounded-full border-t-2 border-cyan-400" />
            <GoogleIcon name="radar" size={28} className="text-cyan-300" />
          </div>
          <div className="bg-black/80 px-4 py-1.5 border border-cyan-500/40 rounded-sm clip-tech-border">
            <p className="text-cyan-400 font-cyber text-xs uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-2 h-2 bg-cyan-400 rounded-full animate-ping" />
              {appState === AppState.SPEAKING ? "TRANSMITTING TELEMETRY..." : "PROCESSING MULTIMODAL FEED..."}
            </p>
          </div>
        </div>
      )}

      {/* --- TOP TACTICAL HUD HEADER --- */}
      <header className="absolute top-0 left-0 w-full p-4 pt-safe flex justify-between items-start z-30 pointer-events-none bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <GoogleIcon name="visibility" size={22} className="text-cyan-400 drop-shadow-[0_0_8px_#06b6d4]" />
            <h1 className="text-xl sm:text-2xl font-cyber font-black tracking-tight text-white drop-shadow-[0_0_8px_rgba(6,182,212,0.8)] leading-none">
              NETRA <span className="text-xs font-mono text-cyan-400 font-normal ml-1">OS v2.4</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-3 mt-1.5 font-mono text-[10px]">
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${isCameraActive ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-red-500'}`} />
              <span className={isCameraActive ? "text-emerald-400" : "text-red-400"}>
                {isCameraActive ? "SYS_ONLINE" : "SYS_OFFLINE"}
              </span>
            </div>
            
            <span className="text-cyan-700">|</span>
            <span className="text-cyan-500">{activeModel.replace('gemini-', '')}</span>
          </div>
        </div>

        {/* Top Right Action & Status Bar */}
        <div className="font-mono text-xs text-cyan-400 text-right pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            {/* Camera Switch */}
            <button 
              onClick={toggleCameraFacing} 
              title="Switch Camera (Front/Back/Webcam)"
              className="bg-black/60 hover:bg-cyan-950/80 p-1.5 rounded-sm border border-cyan-500/30 hover:border-cyan-400 text-cyan-400 transition-all duration-200"
            >
              <GoogleIcon name="flip_camera_android" size={18} />
            </button>

            {/* Upload image / Test image */}
            <button 
              onClick={() => fileInputRef.current?.click()} 
              title="Upload Photo for Analysis"
              className="bg-black/60 hover:bg-cyan-950/80 p-1.5 rounded-sm border border-cyan-500/30 hover:border-cyan-400 text-cyan-400 transition-all duration-200"
            >
              <GoogleIcon name="add_photo_alternate" size={18} />
            </button>

            {/* Direct Prompt / Chat */}
            <button 
              onClick={() => setShowPromptModal(true)} 
              title="Send Text Command / Ask Question"
              className="bg-black/60 hover:bg-cyan-950/80 p-1.5 rounded-sm border border-cyan-500/30 hover:border-cyan-400 text-cyan-400 transition-all duration-200"
            >
              <GoogleIcon name="chat" size={18} />
            </button>

            {/* Fullscreen Toggle */}
            <button 
              onClick={toggleFullscreen} 
              title="Toggle Fullscreen"
              className="bg-black/60 hover:bg-cyan-950/80 p-1.5 rounded-sm border border-cyan-500/30 hover:border-cyan-400 text-cyan-400 transition-all duration-200 hidden sm:block"
            >
              <GoogleIcon name={isFullscreen ? "fullscreen_exit" : "fullscreen"} size={18} />
            </button>

            {/* Settings */}
            <button 
              onClick={() => setShowSettings(true)} 
              title="System Configuration & API Keys"
              className="bg-black/60 hover:bg-cyan-950/80 p-1.5 rounded-sm border border-cyan-500/30 hover:border-cyan-400 text-cyan-400 transition-all duration-200"
            >
              <GoogleIcon name="tune" size={18} />
            </button>
          </div>

          {/* Sector Location Telemetry */}
          {locationName && (
            <div className="text-[11px] font-cyber text-cyan-400 font-semibold tracking-wider flex items-center gap-1 animate-in fade-in slide-in-from-right-4 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20">
              <GoogleIcon name="location_on" size={14} className="text-cyan-400" />
              <span>{locationName}</span>
            </div>
          )}

          {/* Mic Telemetry Bar */}
          <div className="flex items-center gap-2 justify-end">
            <span className={`text-[9px] font-mono tracking-widest ${isListening ? 'text-cyan-400 font-bold' : 'text-cyan-800'}`}>
              {isListening ? "VOICE_LINK_HOT" : "VOICE_STANDBY"}
            </span>
            <AudioWave listening={isListening} />
          </div>
        </div>
      </header>

      {/* --- DIRECT TEXT PROMPT / QUERY MODAL --- */}
      {showPromptModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-950 border border-cyan-500/60 p-5 w-full max-w-md clip-tech-border shadow-[0_0_35px_rgba(6,182,212,0.3)]">
            <div className="flex justify-between items-center mb-4 border-b border-cyan-500/30 pb-2">
              <div className="flex items-center gap-2">
                <GoogleIcon name="smart_toy" size={20} className="text-cyan-400" />
                <h2 className="text-cyan-400 font-cyber font-bold tracking-wider text-base uppercase">TACTICAL SCENE QUERY</h2>
              </div>
              <button onClick={() => setShowPromptModal(false)} className="text-cyan-600 hover:text-cyan-300">
                <GoogleIcon name="close" size={20} />
              </button>
            </div>

            <p className="text-xs text-cyan-300/80 mb-3 font-mono">
              Ask Agent NETRA anything about the active visual feed or enter a direct command.
            </p>

            <form onSubmit={(e) => { e.preventDefault(); handleChatInteraction(textPrompt); setShowPromptModal(false); setTextPrompt(''); }}>
              <div className="relative mb-4">
                <input 
                  type="text"
                  value={textPrompt}
                  onChange={(e) => setTextPrompt(e.target.value)}
                  placeholder="e.g. 'Read the text on this label' or 'What is in front of me?'"
                  className="w-full bg-cyan-950/40 border border-cyan-500/50 rounded p-3 text-cyan-100 placeholder-cyan-700 text-sm font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                  autoFocus
                />
              </div>

              {/* Quick Command Chips */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {[
                  "Read any visible text",
                  "Identify any safety hazards",
                  "Check for expiration dates",
                  "Describe obstacles nearby"
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { setTextPrompt(chip); handleChatInteraction(chip); setShowPromptModal(false); }}
                    className="text-[11px] font-mono bg-cyan-950/60 border border-cyan-500/30 hover:border-cyan-400 hover:text-cyan-300 text-cyan-400/90 px-2.5 py-1 rounded-sm transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPromptModal(false)}
                  className="px-4 py-2 border border-cyan-800 text-cyan-600 hover:text-cyan-400 font-mono text-xs uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!textPrompt.trim()}
                  className="px-5 py-2 bg-cyan-500/20 border border-cyan-400 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40 font-cyber text-xs uppercase font-bold flex items-center gap-1.5"
                >
                  <GoogleIcon name="send" size={16} />
                  Transmit Query
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- SYSTEM CONFIG & SETTINGS MODAL --- */}
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-lg flex items-center justify-center p-4 animate-in fade-in duration-300 overflow-y-auto">
          <div className="bg-slate-950 border border-cyan-500/50 p-6 w-full max-w-lg clip-tech-border shadow-[0_0_40px_rgba(6,182,212,0.25)] my-auto max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            <div className="flex justify-between items-center mb-5 border-b border-cyan-500/30 pb-3">
              <div className="flex items-center gap-2">
                <GoogleIcon name="tune" size={22} className="text-cyan-400" />
                <h2 className="text-cyan-400 font-cyber font-bold tracking-tight text-xl">NETRA SYSTEM CONFIG</h2>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-cyan-600 hover:text-cyan-300">
                <GoogleIcon name="close" size={22} />
              </button>
            </div>
            
            <div className="space-y-6">
              
              {/* Gemini API Keys Configuration */}
              <div className="bg-cyan-950/30 border border-cyan-500/30 p-4 rounded-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-cyber text-cyan-400 flex items-center gap-1">
                    <GoogleIcon name="key" size={16} />
                    GEMINI_API_KEYS (Rotation Supported)
                  </span>
                  <a 
                    href="https://aistudio.google.com/apikey" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-[10px] font-mono text-cyan-500 hover:text-cyan-300 underline flex items-center gap-0.5"
                  >
                    <span>Get Key</span>
                    <GoogleIcon name="open_in_new" size={12} />
                  </a>
                </div>
                <p className="text-[11px] text-cyan-300/70 font-mono mb-2">
                  Enter one or more comma-separated Gemini API keys for automated key rotation & rate-limit resilience.
                </p>
                <div className="flex gap-2">
                  <input 
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy... (Paste keys separated by commas)"
                    className="flex-1 bg-black/80 border border-cyan-500/40 rounded p-2 text-cyan-100 placeholder-cyan-800 text-xs font-mono focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    onClick={handleSaveApiKeys}
                    className="bg-cyan-500/20 border border-cyan-400 hover:bg-cyan-500/30 text-cyan-300 px-3 py-1 font-mono text-xs uppercase flex items-center gap-1"
                  >
                    <GoogleIcon name="save" size={16} />
                    Save
                  </button>
                </div>
                {apiKeySavedNotice && (
                  <p className="text-[11px] font-mono text-emerald-400 mt-2 flex items-center gap-1">
                    <GoogleIcon name="check_circle" size={14} />
                    API Key Configuration Saved Successfully.
                  </p>
                )}
              </div>

              {/* Multimodal AI Model Selection */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-cyan-400">
                  <span className="flex items-center gap-1">
                    <GoogleIcon name="memory" size={16} />
                    VISION_AI_MODEL
                  </span>
                  <span className="text-cyan-500 font-bold">{activeModel}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recommended)' },
                    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
                    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
                    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Deep)' }
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setActiveModel(m.id); saveSelectedModel(m.id); playChime('click'); }}
                      className={`p-2 rounded text-left border font-mono text-[11px] transition-colors ${
                        activeModel === m.id 
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' 
                          : 'bg-cyan-950/20 border-cyan-800/40 text-cyan-600 hover:border-cyan-700 hover:text-cyan-400'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Rate Control */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-cyan-400">
                  <span className="flex items-center gap-1">
                    <GoogleIcon name="speed" size={16} />
                    VOICE_SPEED_RATE
                  </span>
                  <span>{settings.speechRate.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="2.0" step="0.1"
                  value={settings.speechRate}
                  onChange={(e) => setSettings(p => ({...p, speechRate: parseFloat(e.target.value)}))}
                  className="w-full accent-cyan-400 h-1.5 bg-cyan-950 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Voice Pitch Control */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-cyan-400">
                  <span className="flex items-center gap-1">
                    <GoogleIcon name="graphic_eq" size={16} />
                    VOICE_PITCH
                  </span>
                  <span>{settings.voicePitch > 0 ? '+' : ''}{settings.voicePitch}</span>
                </div>
                <input 
                  type="range" min="-400" max="400" step="50"
                  value={settings.voicePitch}
                  onChange={(e) => setSettings(p => ({...p, voicePitch: parseInt(e.target.value)}))}
                  className="w-full accent-cyan-400 h-1.5 bg-cyan-950 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* AR Label Scale */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-cyan-400">
                  <span className="flex items-center gap-1">
                    <GoogleIcon name="format_size" size={16} />
                    AR_HUD_LABEL_SCALE
                  </span>
                  <span>{Math.round(settings.labelScale * 100)}%</span>
                </div>
                <input 
                  type="range" min="0.8" max="2.0" step="0.1"
                  value={settings.labelScale}
                  onChange={(e) => setSettings(p => ({...p, labelScale: parseFloat(e.target.value)}))}
                  className="w-full accent-cyan-400 h-1.5 bg-cyan-950 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Audio Sound FX Toggle */}
              <div className="flex justify-between items-center pt-2">
                <span className="text-xs font-mono text-cyan-400 flex items-center gap-1">
                  <GoogleIcon name={settings.soundFx ? "volume_up" : "volume_off"} size={16} />
                  TACTICAL_AUDIO_FX
                </span>
                <button
                  onClick={() => setSettings(p => ({...p, soundFx: !p.soundFx}))}
                  className={`px-3 py-1 rounded font-mono text-xs uppercase border ${
                    settings.soundFx ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-black border-cyan-900 text-cyan-700'
                  }`}
                >
                  {settings.soundFx ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-cyan-500/30 flex justify-between gap-3">
              <button 
                onClick={() => {
                  setSettings({ speechRate: 1.0, voicePitch: 0, labelScale: 1.0, soundFx: true, selectedVoiceURI: '' });
                  setActiveModel('gemini-2.5-flash');
                  playChime('click');
                }}
                className="py-2 px-4 bg-cyan-950/40 border border-cyan-800 text-cyan-500 font-mono text-xs uppercase hover:bg-cyan-900/50 hover:text-cyan-300 transition-colors"
              >
                Reset Defaults
              </button>

              <button 
                onClick={() => setShowSettings(false)}
                className="py-2 px-6 bg-cyan-500/20 border border-cyan-400 text-cyan-300 font-cyber text-xs uppercase hover:bg-cyan-500/30 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- BOTTOM TACTICAL COMMAND DECK --- */}
      <footer className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-40 pointer-events-auto p-3 pb-6 pb-safe bg-gradient-to-t from-black/90 via-black/50 to-transparent">
        <div className="bg-slate-950/85 backdrop-blur-2xl border border-cyan-500/30 clip-tech-border p-2.5 shadow-[0_0_35px_rgba(0,0,0,0.8)]">
          
          {/* Main Tactical Action Grid */}
          <div className="grid grid-cols-4 gap-2">
            
            {/* SCAN BUTTON */}
            <button 
              onClick={() => manualScan()}
              className="relative h-14 flex flex-col items-center justify-center border transition-all duration-200 clip-tech-corner-tl bg-cyan-950/30 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-300 active:scale-95 group"
            >
              <GoogleIcon name="radar" size={20} className="text-cyan-400 group-hover:scale-110 mb-0.5" />
              <span className="text-[10px] font-cyber font-bold uppercase tracking-wider">Scan</span>
              <div className="absolute bottom-0 w-full h-0.5 bg-cyan-500/50" />
            </button>

            {/* AUTO SURVEILLANCE TOGGLE */}
            <button 
              onClick={() => {
                if (!isAutoScanEnabled) {
                  setIsAutoScanEnabled(true); 
                  playAudio(getRandomResponse("AUTO_ON"), abortControllerRef.current).then(() => startListeningRef.current());
                } else {
                  setIsAutoScanEnabled(false);
                  playAudio(getRandomResponse("AUTO_OFF"), abortControllerRef.current);
                }
              }}
              className={`relative h-14 flex flex-col items-center justify-center border transition-all duration-200 active:scale-95 group ${
                isAutoScanEnabled 
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                  : 'bg-cyan-950/30 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/20'
              }`}
            >
              <GoogleIcon 
                name={isAutoScanEnabled ? "security" : "auto_mode"} 
                size={20} 
                className={`${isAutoScanEnabled ? 'text-emerald-400 animate-pulse' : 'text-cyan-400'} group-hover:scale-110 mb-0.5`} 
              />
              <span className="text-[10px] font-cyber font-bold uppercase tracking-wider">
                {isAutoScanEnabled ? 'Tracking' : 'Auto'}
              </span>
              <div className={`absolute bottom-0 w-full h-0.5 ${isAutoScanEnabled ? 'bg-emerald-400' : 'bg-transparent'}`} />
            </button>

            {/* DIRECT QUERY / CHAT */}
            <button 
              onClick={() => setShowPromptModal(true)}
              className="relative h-14 flex flex-col items-center justify-center border transition-all duration-200 bg-cyan-950/30 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-300 active:scale-95 group"
            >
              <GoogleIcon name="chat" size={20} className="text-cyan-400 group-hover:scale-110 mb-0.5" />
              <span className="text-[10px] font-cyber font-bold uppercase tracking-wider">Query</span>
              <div className="absolute bottom-0 w-full h-0.5 bg-cyan-500/50" />
            </button>

            {/* RESET / ABORT */}
            <button 
              onClick={() => handleStop()}
              className="relative h-14 flex flex-col items-center justify-center border transition-all duration-200 clip-tech-corner-br bg-cyan-950/30 border-cyan-500/40 text-cyan-400 hover:text-red-400 hover:border-red-500 hover:bg-red-950/30 active:scale-95 group"
            >
              <GoogleIcon name="restart_alt" size={20} className="group-hover:rotate-180 transition-transform duration-300 mb-0.5" />
              <span className="text-[10px] font-cyber font-bold uppercase tracking-wider">Reset</span>
            </button>
          </div>

          {/* Status Sub-bar */}
          <div className="mt-2 pt-1 border-t border-cyan-500/10 flex justify-between items-center px-1">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
              <span className="text-[9px] font-mono text-cyan-400/80 uppercase">
                {appState === AppState.SCANNING 
                  ? "ANALYZING SECTOR..." 
                  : appState === AppState.SPEAKING 
                    ? "TRANSMITTING TELEMETRY..." 
                    : isListening 
                      ? "LISTENING FOR VOICE..." 
                      : "STANDBY // READY"}
              </span>
            </div>

            <button 
              onClick={() => { startListeningRef.current(); playChime('click'); }} 
              className="text-[9px] font-mono text-cyan-500 hover:text-cyan-300 uppercase flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-cyan-500/10 transition-colors"
            >
              <GoogleIcon name="mic" size={13} className="text-cyan-400" />
              <span>ACTIVATE_MIC</span>
            </button>
          </div>
        </div>
      </footer>

      {/* --- ERROR TOAST / OVERLAY --- */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/90 z-50 animate-in fade-in duration-200">
          <div className="border border-red-500/70 bg-red-950/30 backdrop-blur-xl p-6 max-w-sm text-center clip-tech-border shadow-[0_0_35px_rgba(239,68,68,0.3)]">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-950/60 border border-red-500 flex items-center justify-center mb-3">
              <GoogleIcon name="warning" size={28} className="text-red-400" />
            </div>
            <h2 className="text-red-400 font-cyber text-xl font-bold uppercase mb-2">SYSTEM EXCEPTION</h2>
            <p className="text-red-200/90 text-xs font-mono mb-5 leading-relaxed">{error.message}</p>
            
            <div className="flex gap-2 justify-center">
              {error.type === 'camera' && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-500 text-cyan-300 px-4 py-2 text-xs font-mono uppercase flex items-center gap-1"
                >
                  <GoogleIcon name="add_photo_alternate" size={16} />
                  Upload Image
                </button>
              )}
              
              <button 
                onClick={() => { setError(null); handleStop(); }} 
                className="bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/60 px-5 py-2 text-xs font-mono uppercase font-bold flex items-center gap-1"
              >
                <GoogleIcon name="refresh" size={16} />
                Reboot Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};