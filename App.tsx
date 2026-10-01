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
import { HistoryDrawer } from './components/HistoryDrawer.tsx';
import { KeyboardHelpModal } from './components/KeyboardHelpModal.tsx';
import { 
  Scan, 
  Camera, 
  FlipHorizontal, 
  Upload, 
  MessageSquare, 
  Maximize, 
  Minimize, 
  Settings2, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  Zap, 
  ZapOff, 
  History, 
  Keyboard, 
  Crosshair, 
  MapPin, 
  Sparkles, 
  ShieldAlert, 
  Radio, 
  Layers, 
  Check, 
  Key, 
  Eye, 
  Cpu, 
  Activity, 
  Sliders, 
  ExternalLink,
  ChevronRight,
  Send,
  AlertOctagon,
  X
} from 'lucide-react';

// Settings & Constants
const AUTO_SCAN_INTERVAL = 3200; 
const ANNOUNCE_INTERVAL = 8500;
const CHANGE_THROTTLE = 1000; 
const MATCH_THRESHOLD = 250; 
const SMOOTHING_FACTOR = 0.65; 
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

// Utilities: Levenshtein Distance & Fuzzy Match
const levenshtein = (a: string, b: string): number => {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[][] = [];
  for (let i = 0; i <= bn; ++i) matrix[i] = [i];
  for (let j = 1; j <= an; ++j) matrix[0][j] = j;
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

// Reticle Component
const Reticle = ({ active }: { active: boolean }) => (
  <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all duration-500 ${active ? 'opacity-100 scale-100' : 'opacity-30 scale-90'}`}>
    <div className="relative w-44 h-44 flex items-center justify-center">
      {/* Outer Rotating Ring */}
      <div className={`absolute inset-0 border border-cyan-500/40 rounded-full border-dashed ${active ? 'animate-cyber-spin border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)]' : ''}`} />
      <div className={`absolute inset-3.5 border border-cyan-400/20 rounded-full ${active ? 'animate-cyber-spin-reverse' : ''}`} />
      
      {/* Center Target Crosshairs */}
      <div className="w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_12px_#06b6d4]" />
      <div className="absolute top-0 w-0.5 h-5 bg-cyan-400/80" />
      <div className="absolute bottom-0 w-0.5 h-5 bg-cyan-400/80" />
      <div className="absolute left-0 h-0.5 w-5 bg-cyan-400/80" />
      <div className="absolute right-0 h-0.5 w-5 bg-cyan-400/80" />
      
      {/* Corner Brackets */}
      <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-cyan-400" />
      <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-400" />
      <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-cyan-400" />
      <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-cyan-400" />

      {/* Azimuth / Degree Ticks */}
      <div className="absolute -top-5 font-mono text-[9px] text-cyan-400 tracking-widest">
        000° TRK
      </div>
    </div>
  </div>
);

// Audio Wave Visualizer
const AudioWave = ({ listening }: { listening: boolean }) => (
  <div className={`flex items-center gap-1 h-4 transition-opacity duration-300 ${listening ? 'opacity-100' : 'opacity-40'}`}>
    {[1, 2, 3, 4, 5, 6].map(i => (
      <div 
        key={i} 
        className={`w-0.5 bg-cyan-400 rounded-full transition-all duration-150 ${listening ? 'animate-tech-pulse' : 'h-1.5'}`} 
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
  const [torchActive, setTorchActive] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState<string | null>(null);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [isAutoScanEnabled, setIsAutoScanEnabled] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Theme State
  const [currentTheme, setCurrentTheme] = useState<'cyan' | 'matrix' | 'amber' | 'crimson' | 'violet'>('cyan');

  // History & Hotkeys Modals
  const [scanHistory, setScanHistory] = useState<{ id: string; timestamp: string; result: DetectionResult }[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showHotkeysModal, setShowHotkeysModal] = useState(false);

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
  const mediaStreamRef = useRef<MediaStream | null>(null);
  
  const historyRef = useRef<DetectedObject[]>([]);
  const liveObjectsRef = useRef<DetectedObject[]>([]);
  const lastAnnounceTimeRef = useRef<number>(0);
  const lastAnnouncedNamesRef = useRef<string[]>([]);
  const startListeningRef = useRef<() => void>(() => {});

  useEffect(() => { liveObjectsRef.current = liveObjects; }, [liveObjects]);

  // Apply Theme to Document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

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
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.2);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);
      }
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // AudioContext fallback
    }
  }, [getAudioContext]);

  const playAudio = useCallback((text: string, currentCallId: number): Promise<void> => {
    return new Promise((resolve) => {
      if (currentCallId !== abortControllerRef.current) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      isSpeakingRef.current = true;
      setAppState(AppState.SPEAKING);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = settingsRef.current.speechRate;
      utterance.pitch = 1.0 + (settingsRef.current.voicePitch / 400);

      if (settingsRef.current.selectedVoiceURI && voices.length > 0) {
        const foundVoice = voices.find(v => v.voiceURI === settingsRef.current.selectedVoiceURI);
        if (foundVoice) utterance.voice = foundVoice;
      }

      utterance.onend = () => {
        isSpeakingRef.current = false;
        if (currentCallId === abortControllerRef.current) {
          setAppState(AppState.IDLE);
        }
        resolve();
      };

      utterance.onerror = () => {
        isSpeakingRef.current = false;
        if (currentCallId === abortControllerRef.current) {
          setAppState(AppState.IDLE);
        }
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }, [voices]);

  // Frame Capture Utility
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return dataUrl.split(',')[1] || null;
  }, []);

  // Torch / Flashlight Control
  const toggleTorch = async () => {
    try {
      if (mediaStreamRef.current) {
        const track = mediaStreamRef.current.getVideoTracks()[0];
        const capabilities = (track as any).getCapabilities?.() || {};
        if (capabilities.torch) {
          await (track as any).applyConstraints({
            advanced: [{ torch: !torchActive }]
          });
          setTorchActive(!torchActive);
          playChime('click');
        } else {
          setAgentMessage("Flashlight hardware not available on this camera.");
          setTimeout(() => setAgentMessage(null), 3000);
        }
      }
    } catch (err) {
      console.warn("Torch error:", err);
    }
  };

  // Camera Management
  const startCamera = useCallback(async (facing = cameraFacing) => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setIsCameraActive(true);
      setError(null);
    } catch (err: any) {
      console.warn("Camera init error:", err);
      setIsCameraActive(false);
      setError({
        type: 'camera',
        message: 'Camera access denied or unavailable. You can upload an image or run in simulated demo mode.'
      });
    }
  }, [cameraFacing]);

  const toggleCameraFacing = () => {
    const next = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(next);
    startCamera(next);
    playChime('click');
  };

  // Sector GPS Geocoding
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const name = await describeLocation(position.coords.latitude, position.coords.longitude);
          setLocationName(name);
        },
        () => {
          setLocationName("SECTOR [ALPHA-1 // TACTICAL]");
        },
        { timeout: 8000 }
      );
    } else {
      setLocationName("SECTOR [ALPHA-1 // TACTICAL]");
    }
  }, []);

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          manualScan();
          break;
        case 'a':
          e.preventDefault();
          setIsAutoScanEnabled(prev => !prev);
          playChime('click');
          break;
        case 'm':
          e.preventDefault();
          startListeningRef.current();
          playChime('click');
          break;
        case 'q':
        case 't':
          e.preventDefault();
          setShowPromptModal(true);
          playChime('click');
          break;
        case 'c':
          e.preventDefault();
          toggleCameraFacing();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'h':
          e.preventDefault();
          setShowHistoryDrawer(prev => !prev);
          playChime('click');
          break;
        case 's':
          e.preventDefault();
          setShowSettings(prev => !prev);
          playChime('click');
          break;
        case 'escape':
          e.preventDefault();
          setResult(null);
          setShowPromptModal(false);
          setShowSettings(false);
          setShowHistoryDrawer(false);
          setShowHotkeysModal(false);
          stopAudio();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Save Scanned Result to History
  const recordResultInHistory = useCallback((res: DetectionResult) => {
    const newItem = {
      id: `scan-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      result: res
    };
    setScanHistory(prev => [newItem, ...prev.slice(0, 49)]); // Keep latest 50
  }, []);

  // Manual Scan
  const manualScan = useCallback(async (targetName?: string) => {
    const callId = ++abortControllerRef.current;
    stopAudio();
    playChime('scan');
    setAppState(AppState.SCANNING);

    const base64 = captureFrame();
    if (!base64) {
      // In offline / fallback mode without camera
      const demoRes = {
        objectName: targetName || "Tactical Workstation",
        details: "Analytical visual scan of active terminal.",
        spokenDescription: `Target acquired: ${targetName || "Tactical Workstation"}. Operational status nominal.`,
        safetyWarning: undefined,
        expiryDate: undefined
      };
      setResult(demoRes);
      recordResultInHistory(demoRes);
      await playAudio(demoRes.spokenDescription, callId);
      return;
    }

    try {
      const res = await identifyObject(base64, targetName);
      if (callId === abortControllerRef.current) {
        setResult(res);
        recordResultInHistory(res);
        playChime('success');
        await playAudio(res.spokenDescription, callId);
      }
    } catch (err: any) {
      if (callId === abortControllerRef.current) {
        setError({ message: err?.message || "Failed to analyze target.", type: "scan" });
        setAppState(AppState.ERROR);
        playChime('error');
      }
    }
  }, [captureFrame, stopAudio, playAudio, playChime, recordResultInHistory]);

  // Spatial Object Tracking Loop
  useEffect(() => {
    let isMounted = true;
    let scanTimeout: number;

    const runSpatialDetection = async () => {
      if (!isMounted) return;
      if (isCameraActive && appState === AppState.IDLE) {
        const frame = captureFrame();
        if (frame) {
          try {
            const detected = await detectObjectsLive(frame);
            if (isMounted) {
              setLiveObjects(detected);
            }
          } catch (e) {
            // Ignore spatial error in background
          }
        }
      }
      scanTimeout = window.setTimeout(runSpatialDetection, AUTO_SCAN_INTERVAL);
    };

    runSpatialDetection();
    return () => {
      isMounted = false;
      clearTimeout(scanTimeout);
    };
  }, [isCameraActive, appState, captureFrame]);

  // Voice Interaction / Direct Chat
  const handleChatInteraction = async (query: string) => {
    const callId = ++abortControllerRef.current;
    stopAudio();
    setAppState(AppState.SCANNING);
    playChime('scan');
    setAgentMessage(`Processing: "${query}"`);

    const frame = captureFrame() || '';
    try {
      const reply = await chatWithScene(frame, query);
      if (callId === abortControllerRef.current) {
        setAgentMessage(reply);
        const res: DetectionResult = {
          objectName: query.length > 25 ? `${query.slice(0, 22)}...` : query,
          details: `Direct Query Result: ${query}`,
          spokenDescription: reply
        };
        setResult(res);
        recordResultInHistory(res);
        playChime('success');
        await playAudio(reply, callId);
      }
    } catch (e: any) {
      if (callId === abortControllerRef.current) {
        setError({ message: "Unable to process tactical query.", type: "query" });
        setAppState(AppState.ERROR);
      }
    }
  };

  // Image Upload Analysis
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      if (base64) {
        const callId = ++abortControllerRef.current;
        stopAudio();
        setAppState(AppState.SCANNING);
        playChime('scan');

        try {
          const res = await identifyObject(base64);
          if (callId === abortControllerRef.current) {
            setResult(res);
            recordResultInHistory(res);
            playChime('success');
            await playAudio(res.spokenDescription, callId);
          }
        } catch (err: any) {
          setError({ message: "Failed to analyze uploaded image.", type: "upload" });
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Voice Recognition Engine
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAgentMessage("Speech Recognition API not supported in this browser.");
      setTimeout(() => setAgentMessage(null), 3000);
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        playChime('start');
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join('');
        setRecognizedText(transcript);

        if (event.results[0].isFinal) {
          setIsListening(false);
          handleVoiceCommand(transcript);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      setIsListening(false);
    }
  }, [playChime]);

  startListeningRef.current = startListening;

  const handleVoiceCommand = (transcript: string) => {
    const t = transcript.toLowerCase();
    
    if (checkCommand(t, ['scan', 'identify', 'what is this', 'look', 'examine'])) {
      manualScan();
    } else if (checkCommand(t, ['auto scan', 'start auto', 'continuous', 'surveillance'])) {
      setIsAutoScanEnabled(true);
      playAudio(getRandomResponse("AUTO_ON"), abortControllerRef.current);
    } else if (checkCommand(t, ['stop auto', 'stop scan', 'halt', 'cancel', 'reset'])) {
      setIsAutoScanEnabled(false);
      handleStop();
    } else if (checkCommand(t, ['switch camera', 'flip camera'])) {
      toggleCameraFacing();
    } else if (checkCommand(t, ['flashlight', 'torch'])) {
      toggleTorch();
    } else {
      // General question about the scene
      handleChatInteraction(transcript);
    }
  };

  const handleStop = () => {
    abortControllerRef.current++;
    stopAudio();
    setAppState(AppState.IDLE);
    setResult(null);
    setFocusedId(null);
    setAgentMessage(null);
    playChime('click');
  };

  // Fullscreen Management
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Save API Key Configuration
  const handleSaveApiKeys = () => {
    saveCustomApiKeys(apiKeyInput);
    setApiKeySavedNotice(true);
    playChime('success');
    setTimeout(() => setApiKeySavedNotice(false), 3000);
  };

  // Initialize Camera on Mount
  useEffect(() => {
    startCamera('environment');
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-cyan-100 flex flex-col justify-between font-sans">
      
      {/* Hidden File Input & Canvas */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImageUpload} 
        accept="image/*" 
        className="hidden" 
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* --- CAMERA VIEWPORT & HUD OVERLAYS --- */}
      <div className="absolute inset-0 w-full h-full overflow-hidden bg-black">
        <video 
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover select-none"
        />

        {/* Ambient Holographic Tactical Grid & Scanline */}
        <div className="absolute inset-0 hologram-grid pointer-events-none opacity-40" />
        <div className="absolute inset-0 hologram-scanline pointer-events-none opacity-50" />

        {/* Laser Sweep Scan Beam */}
        {appState === AppState.SCANNING && (
          <div className="animate-laser-sweep" />
        )}

        {/* Central HUD Reticle */}
        <Reticle active={appState === AppState.SCANNING || isAutoScanEnabled} />

        {/* Spatial Object Bounding Boxes Overlay */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {liveObjects.map((obj) => {
            const topPct = (obj.ymin / 1000) * 100;
            const leftPct = (obj.xmin / 1000) * 100;
            const widthPct = ((obj.xmax - obj.xmin) / 1000) * 100;
            const heightPct = ((obj.ymax - obj.ymin) / 1000) * 100;
            const isFocused = focusedId === obj.id;

            return (
              <div 
                key={obj.id}
                onClick={() => {
                  setFocusedId(obj.id);
                  manualScan(obj.name);
                }}
                className={`absolute border pointer-events-auto cursor-pointer transition-all duration-300 rounded-sm group ${
                  isFocused 
                    ? 'border-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.8)] bg-cyan-500/15 scale-102' 
                    : 'border-cyan-500/50 hover:border-cyan-300 hover:bg-cyan-500/10'
                }`}
                style={{
                  top: `${topPct}%`,
                  left: `${leftPct}%`,
                  width: `${Math.max(widthPct, 12)}%`,
                  height: `${Math.max(heightPct, 10)}%`
                }}
              >
                {/* Tactical Chamfered Corner Markers */}
                <div className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-cyan-400" />
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-cyan-400" />
                <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-cyan-400" />
                <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-cyan-400" />

                {/* Object Badge & Info Chip */}
                <div 
                  className="absolute -top-7 left-0 bg-slate-950/90 border border-cyan-500/60 px-2 py-0.5 rounded text-[10px] font-cyber uppercase tracking-wider text-cyan-300 flex items-center gap-1.5 shadow-md whitespace-nowrap"
                  style={{ transform: `scale(${settings.labelScale})`, transformOrigin: 'top left' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="font-bold">{obj.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- TOP TACTICAL HUD HEADER --- */}
      <header className="relative z-30 p-3 sm:p-4 pt-safe flex justify-between items-start pointer-events-none bg-gradient-to-b from-black/85 via-black/40 to-transparent">
        
        {/* Left Telemetry & Brand */}
        <div className="flex flex-col pointer-events-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-cyan-950/80 border border-cyan-500/60 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              <Eye className="w-4 h-4 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-cyber font-black tracking-tight text-white drop-shadow-[0_0_10px_rgba(6,182,212,0.8)] leading-none flex items-center gap-1.5">
                NETRA <span className="text-cyan-400">OS</span>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-500/30">v2.5 PRO</span>
              </h1>
              <div className="flex items-center gap-2 mt-1 font-mono text-[10px]">
                <span className={`inline-flex items-center gap-1 ${isCameraActive ? 'text-emerald-400' : 'text-red-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isCameraActive ? 'bg-emerald-400 animate-ping' : 'bg-red-400'}`} />
                  {isCameraActive ? 'SYS_ONLINE' : 'OFFLINE_MODE'}
                </span>
                <span className="text-cyan-700">|</span>
                <span className="text-cyan-400/80">{activeModel.replace('gemini-', '')}</span>
              </div>
            </div>
          </div>

          {/* Sector Location Telemetry */}
          {locationName && (
            <div className="mt-2 text-[10px] font-mono text-cyan-400/90 flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded border border-cyan-500/20 max-w-xs truncate">
              <MapPin className="w-3 h-3 text-cyan-400 flex-shrink-0" />
              <span className="truncate">{locationName}</span>
            </div>
          )}
        </div>

        {/* Right Action & Control Toolbar */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-md p-1 rounded-lg border border-cyan-500/30 shadow-lg">
            
            {/* Flashlight / Torch */}
            <button 
              onClick={toggleTorch}
              title="Toggle Flashlight / Torch"
              className={`p-2 rounded-md transition-all duration-150 ${
                torchActive 
                  ? 'bg-amber-500/30 text-amber-300 border border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]' 
                  : 'text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/15'
              }`}
            >
              {torchActive ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
            </button>

            {/* Camera Switch */}
            <button 
              onClick={toggleCameraFacing} 
              title="Switch Camera (Front/Back/Webcam) [HotKey: C]"
              className="p-2 rounded-md text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/15 transition-all duration-150"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>

            {/* Upload Photo */}
            <button 
              onClick={() => fileInputRef.current?.click()} 
              title="Upload Image for Analysis"
              className="p-2 rounded-md text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/15 transition-all duration-150"
            >
              <Upload className="w-4 h-4" />
            </button>

            {/* Direct Query / Chat Modal */}
            <button 
              onClick={() => setShowPromptModal(true)} 
              title="Ask Agent Netra / Direct Query [HotKey: Q]"
              className="p-2 rounded-md text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/15 transition-all duration-150"
            >
              <MessageSquare className="w-4 h-4" />
            </button>

            {/* History Log Drawer */}
            <button 
              onClick={() => setShowHistoryDrawer(true)} 
              title="View Telemetry Scan Log [HotKey: H]"
              className="relative p-2 rounded-md text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/15 transition-all duration-150"
            >
              <History className="w-4 h-4" />
              {scanHistory.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400" />
              )}
            </button>

            {/* Keyboard Shortcuts */}
            <button 
              onClick={() => setShowHotkeysModal(true)} 
              title="Keyboard Shortcuts [HotKey: ?]"
              className="p-2 rounded-md text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/15 transition-all duration-150 hidden sm:block"
            >
              <Keyboard className="w-4 h-4" />
            </button>

            {/* Fullscreen Toggle */}
            <button 
              onClick={toggleFullscreen} 
              title="Toggle Fullscreen [HotKey: F]"
              className="p-2 rounded-md text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/15 transition-all duration-150 hidden sm:block"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>

            {/* System Config & API Keys */}
            <button 
              onClick={() => setShowSettings(true)} 
              title="System Configuration & API Keys [HotKey: S]"
              className="p-2 rounded-md text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/15 transition-all duration-150"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>

          {/* Voice Microphone Telemetry Status */}
          <div className="flex items-center gap-2 bg-black/70 px-2.5 py-1 rounded-md border border-cyan-500/20 text-[10px] font-mono">
            <span className={isListening ? "text-cyan-300 font-bold" : "text-cyan-600"}>
              {isListening ? "VOICE_LINK_HOT" : "VOICE_STANDBY"}
            </span>
            <AudioWave listening={isListening} />
          </div>
        </div>
      </header>

      {/* --- CENTER NOTIFICATIONS / TRANSCRIPTION BADGES --- */}
      <div className="relative z-20 px-4 flex flex-col items-center gap-2 pointer-events-none">
        {recognizedText && (
          <div className="bg-slate-950/90 border border-cyan-400/80 px-4 py-2 rounded-lg text-cyan-200 text-xs font-mono shadow-xl animate-in fade-in slide-in-from-top-4 flex items-center gap-2">
            <Mic className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>&ldquo;{recognizedText}&rdquo;</span>
          </div>
        )}

        {agentMessage && !result && (
          <div className="bg-cyan-950/90 border border-cyan-500/60 px-4 py-2 rounded-lg text-cyan-100 text-xs font-mono shadow-xl animate-in fade-in slide-in-from-top-4 flex items-center gap-2 max-w-md text-center">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <span>{agentMessage}</span>
          </div>
        )}
      </div>

      {/* --- CENTER / LOWER TARGET INTELLIGENCE CARD --- */}
      {result && (
        <div className="relative z-30 px-3 sm:px-4 max-w-xl mx-auto w-full mb-2 pointer-events-auto">
          <InfoCard 
            result={result} 
            onDismiss={() => setResult(null)} 
            onReplayAudio={(t) => playAudio(t, abortControllerRef.current)} 
          />
        </div>
      )}

      {/* --- BOTTOM TACTICAL COMMAND DECK --- */}
      <footer className="relative z-30 p-3 sm:p-4 pb-safe bg-gradient-to-t from-black/95 via-black/60 to-transparent">
        <div className="max-w-xl mx-auto bg-slate-950/90 backdrop-blur-2xl border border-cyan-500/40 rounded-xl p-3 shadow-[0_0_40px_rgba(0,0,0,0.8)] clip-tech-border">
          
          {/* Main Action Grid */}
          <div className="grid grid-cols-4 gap-2">
            
            {/* 1. INSTANT SCAN */}
            <button 
              onClick={() => manualScan()}
              className="h-14 flex flex-col items-center justify-center rounded-lg border transition-all duration-200 bg-cyan-950/40 border-cyan-500/50 text-cyan-200 hover:bg-cyan-500/25 hover:border-cyan-300 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-95 group"
            >
              <Scan className="w-5 h-5 text-cyan-400 group-hover:scale-110 mb-0.5" />
              <span className="text-[10px] font-cyber font-bold uppercase tracking-wider">Scan</span>
            </button>

            {/* 2. AUTO-TRACKING */}
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
              className={`h-14 flex flex-col items-center justify-center rounded-lg border transition-all duration-200 active:scale-95 group ${
                isAutoScanEnabled 
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.4)]' 
                  : 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/25'
              }`}
            >
              <Radio className={`w-5 h-5 mb-0.5 ${isAutoScanEnabled ? 'text-emerald-400 animate-pulse' : 'text-cyan-400'}`} />
              <span className="text-[10px] font-cyber font-bold uppercase tracking-wider">
                {isAutoScanEnabled ? 'Tracking' : 'Auto'}
              </span>
            </button>

            {/* 3. DIRECT QUERY */}
            <button 
              onClick={() => setShowPromptModal(true)}
              className="h-14 flex flex-col items-center justify-center rounded-lg border transition-all duration-200 bg-cyan-950/40 border-cyan-500/50 text-cyan-200 hover:bg-cyan-500/25 hover:border-cyan-300 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-95 group"
            >
              <MessageSquare className="w-5 h-5 text-cyan-400 group-hover:scale-110 mb-0.5" />
              <span className="text-[10px] font-cyber font-bold uppercase tracking-wider">Query</span>
            </button>

            {/* 4. RESET / ABORT */}
            <button 
              onClick={() => handleStop()}
              className="h-14 flex flex-col items-center justify-center rounded-lg border transition-all duration-200 bg-cyan-950/40 border-cyan-500/50 text-cyan-400 hover:text-red-400 hover:border-red-500 hover:bg-red-950/40 active:scale-95 group"
            >
              <RotateCcw className="w-5 h-5 group-hover:-rotate-90 transition-transform duration-300 mb-0.5" />
              <span className="text-[10px] font-cyber font-bold uppercase tracking-wider">Reset</span>
            </button>
          </div>

          {/* Sub Control Bar: Voice Mic & Status */}
          <div className="mt-2.5 pt-2 border-t border-cyan-500/15 flex justify-between items-center px-1">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-[9px] font-mono text-cyan-400/90 uppercase">
                {appState === AppState.SCANNING 
                  ? "ANALYZING MULTIMODAL FEED..." 
                  : appState === AppState.SPEAKING 
                    ? "TRANSMITTING TELEMETRY..." 
                    : isListening 
                      ? "LISTENING FOR COMMANDS..." 
                      : "STANDBY // READY FOR TARGET"}
              </span>
            </div>

            <button 
              onClick={() => { startListening(); playChime('click'); }} 
              className="text-[10px] font-mono text-cyan-400 hover:text-cyan-200 uppercase flex items-center gap-1.5 bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-1 rounded hover:bg-cyan-500/20 transition-all"
            >
              <Mic className="w-3.5 h-3.5 text-cyan-400" />
              <span>VOICE MIC</span>
            </button>
          </div>
        </div>
      </footer>

      {/* --- DIRECT SCENE QUERY MODAL --- */}
      {showPromptModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-950 border border-cyan-500/60 p-5 w-full max-w-lg clip-tech-border shadow-[0_0_45px_rgba(6,182,212,0.35)]">
            <div className="flex justify-between items-center mb-4 border-b border-cyan-500/30 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                <h2 className="text-cyan-300 font-cyber font-bold tracking-wider text-base uppercase">
                  DIRECT SCENE QUERY // AGENT NETRA
                </h2>
              </div>
              <button onClick={() => setShowPromptModal(false)} className="text-cyan-500 hover:text-cyan-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-cyan-300/80 mb-3 font-mono">
              Inquire about any aspect of the visual feed (e.g. read labels, barcode text, safety hazards, or navigation).
            </p>

            <form onSubmit={(e) => { e.preventDefault(); if (textPrompt.trim()) { handleChatInteraction(textPrompt); setShowPromptModal(false); setTextPrompt(''); } }}>
              <div className="relative mb-3">
                <input 
                  type="text"
                  value={textPrompt}
                  onChange={(e) => setTextPrompt(e.target.value)}
                  placeholder="e.g. 'Read the text on this label' or 'What safety hazards are in front of me?'"
                  className="w-full bg-cyan-950/40 border border-cyan-500/50 rounded-lg p-3 text-cyan-100 placeholder-cyan-700 text-sm font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                  autoFocus
                />
              </div>

              {/* Quick Tactical Preset Chips */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {[
                  "Read any visible text or barcodes",
                  "Identify any safety hazards",
                  "Check for expiration dates",
                  "Describe obstacles in my path",
                  "Identify currency / monetary notes",
                  "Full tactical scene description"
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { setTextPrompt(chip); handleChatInteraction(chip); setShowPromptModal(false); }}
                    className="text-[11px] font-mono bg-cyan-950/60 border border-cyan-500/30 hover:border-cyan-400 hover:text-cyan-200 text-cyan-400 px-2.5 py-1 rounded transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPromptModal(false)}
                  className="px-4 py-2 border border-cyan-800 text-cyan-500 hover:text-cyan-300 font-mono text-xs uppercase rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!textPrompt.trim()}
                  className="px-5 py-2 bg-cyan-500/25 border border-cyan-400 text-cyan-200 hover:bg-cyan-500/35 disabled:opacity-40 font-cyber text-xs uppercase font-bold flex items-center gap-1.5 rounded"
                >
                  <Send className="w-4 h-4" />
                  Transmit Query
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- SYSTEM CONFIGURATION MODAL --- */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-lg flex items-center justify-center p-4 animate-in fade-in duration-300 overflow-y-auto">
          <div className="bg-slate-950 border border-cyan-500/50 p-6 w-full max-w-lg clip-tech-border shadow-[0_0_45px_rgba(6,182,212,0.3)] my-auto max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            <div className="flex justify-between items-center mb-5 border-b border-cyan-500/30 pb-3">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-cyan-400" />
                <h2 className="text-cyan-300 font-cyber font-bold tracking-tight text-xl">
                  NETRA SYSTEM CONFIG
                </h2>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-cyan-500 hover:text-cyan-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-5">
              
              {/* Theme Selector */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 mb-2">
                  <Layers className="w-4 h-4" />
                  <span>HUD_TACTICAL_PALETTE</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { id: 'cyan', label: 'Cyan', color: '#06b6d4' },
                    { id: 'matrix', label: 'Matrix', color: '#10b981' },
                    { id: 'amber', label: 'Amber', color: '#f59e0b' },
                    { id: 'crimson', label: 'Combat', color: '#f43f5e' },
                    { id: 'violet', label: 'Violet', color: '#a855f7' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setCurrentTheme(t.id as any); playChime('click'); }}
                      className={`p-2 rounded border text-center font-mono text-[10px] uppercase transition-all ${
                        currentTheme === t.id 
                          ? 'border-cyan-300 bg-cyan-500/20 text-white shadow-md' 
                          : 'border-cyan-900 bg-black/40 text-cyan-600 hover:border-cyan-700'
                      }`}
                    >
                      <div className="w-3 h-3 rounded-full mx-auto mb-1" style={{ backgroundColor: t.color }} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gemini API Keys Configuration */}
              <div className="bg-cyan-950/30 border border-cyan-500/30 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-cyber text-cyan-300 flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-cyan-400" />
                    GEMINI_API_KEYS (Rotation Enabled)
                  </span>
                  <a 
                    href="https://aistudio.google.com/apikey" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-[10px] font-mono text-cyan-400 hover:text-cyan-200 underline flex items-center gap-0.5"
                  >
                    <span>Get Key</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-[11px] text-cyan-300/70 font-mono mb-2.5">
                  Enter one or multiple comma-separated keys for auto-rotation and rate-limit resilience.
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
                    className="bg-cyan-500/20 border border-cyan-400 hover:bg-cyan-500/30 text-cyan-200 px-3 py-1 font-mono text-xs uppercase flex items-center gap-1 rounded"
                  >
                    <Check className="w-4 h-4 text-emerald-400" />
                    Save
                  </button>
                </div>
                {apiKeySavedNotice && (
                  <p className="text-[11px] font-mono text-emerald-400 mt-2 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    API Key Configuration Saved Successfully.
                  </p>
                )}
              </div>

              {/* Multimodal AI Model Selection */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-cyan-400">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-4 h-4" />
                    VISION_AI_MODEL
                  </span>
                  <span className="text-cyan-400 font-bold">{activeModel}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Ultra-Fast)' },
                    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Stable)' },
                    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
                    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Deep Analysis)' }
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setActiveModel(m.id); saveSelectedModel(m.id); playChime('click'); }}
                      className={`p-2.5 rounded-lg text-left border font-mono text-[11px] transition-colors ${
                        activeModel === m.id 
                          ? 'bg-cyan-500/25 border-cyan-400 text-cyan-100 shadow' 
                          : 'bg-cyan-950/20 border-cyan-800/40 text-cyan-600 hover:border-cyan-700 hover:text-cyan-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Rate Control */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-cyan-400">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-4 h-4" />
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

              {/* Audio Sound FX Toggle */}
              <div className="flex justify-between items-center pt-2">
                <span className="text-xs font-mono text-cyan-400 flex items-center gap-1.5">
                  {settings.soundFx ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  TACTICAL_AUDIO_FX
                </span>
                <button
                  onClick={() => setSettings(p => ({...p, soundFx: !p.soundFx}))}
                  className={`px-3 py-1 rounded font-mono text-xs uppercase border ${
                    settings.soundFx ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200' : 'bg-black border-cyan-900 text-cyan-700'
                  }`}
                >
                  {settings.soundFx ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            </div>

            <div className="mt-7 pt-4 border-t border-cyan-500/30 flex justify-between gap-3">
              <button 
                onClick={() => {
                  setSettings({ speechRate: 1.0, voicePitch: 0, labelScale: 1.0, soundFx: true, selectedVoiceURI: '' });
                  setActiveModel('gemini-2.5-flash');
                  playChime('click');
                }}
                className="py-2 px-4 bg-cyan-950/40 border border-cyan-800 text-cyan-500 font-mono text-xs uppercase hover:bg-cyan-900/50 hover:text-cyan-300 transition-colors rounded"
              >
                Reset Defaults
              </button>

              <button 
                onClick={() => setShowSettings(false)}
                className="py-2 px-6 bg-cyan-500/25 border border-cyan-400 text-cyan-200 font-cyber text-xs uppercase hover:bg-cyan-500/35 transition-colors rounded"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- HISTORY DRAWER --- */}
      <HistoryDrawer 
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        history={scanHistory}
        onSelectResult={(res) => setResult(res)}
        onClearHistory={() => setScanHistory([])}
        onReplayAudio={(t) => playAudio(t, abortControllerRef.current)}
      />

      {/* --- KEYBOARD SHORTCUTS MODAL --- */}
      <KeyboardHelpModal 
        isOpen={showHotkeysModal}
        onClose={() => setShowHotkeysModal(false)}
      />

      {/* --- ERROR TOAST / OVERLAY --- */}
      {error && (
        <div className="fixed inset-0 flex items-center justify-center p-6 bg-black/90 z-50 animate-in fade-in duration-200">
          <div className="border border-red-500/70 bg-red-950/30 backdrop-blur-xl p-6 max-w-sm text-center clip-tech-border shadow-[0_0_40px_rgba(239,68,68,0.35)]">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-950/60 border border-red-500 flex items-center justify-center mb-3">
              <AlertOctagon className="w-7 h-7 text-red-400 animate-bounce" />
            </div>
            <h2 className="text-red-400 font-cyber text-xl font-bold uppercase mb-2">SYSTEM EXCEPTION</h2>
            <p className="text-red-200/90 text-xs font-mono mb-5 leading-relaxed">{error.message}</p>
            
            <div className="flex gap-2 justify-center">
              {error.type === 'camera' && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-500 text-cyan-300 px-4 py-2 text-xs font-mono uppercase flex items-center gap-1 rounded"
                >
                  <Upload className="w-4 h-4" />
                  Upload Image
                </button>
              )}
              
              <button 
                onClick={() => { setError(null); handleStop(); }} 
                className="bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/60 px-5 py-2 text-xs font-mono uppercase font-bold flex items-center gap-1 rounded"
              >
                <RotateCcw className="w-4 h-4" />
                Reboot Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};