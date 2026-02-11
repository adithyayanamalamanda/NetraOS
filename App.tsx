import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AppState, DetectionResult, DetectedObject } from './types.ts';
import { identifyObject, detectObjectsLive, chatWithScene, describeLocation } from './services/geminiService.ts';
import { InfoCard } from './components/InfoCard.tsx';

// Settings
const AUTO_SCAN_INTERVAL = 0; 
const ANNOUNCE_INTERVAL = 8000;
const CHANGE_THROTTLE = 1000; 
const MATCH_THRESHOLD = 250; 
const SMOOTHING_FACTOR = 0.6; 
// Fuzzy Match Threshold (0.0 = exact, 0.4 = loose)
const FUZZY_THRESHOLD = 0.35; 

// --- VOICE RESPONSE BANKS ---
const RESPONSES = {
    ACKNOWLEDGE: ["Copy.", "Understood.", "Command received.", "On it.", "Executing."],
    SCANNING: ["Scanning sector.", "Visual sweep initiated.", "Sensors active.", "Processing visual feed.", "Acquiring targets."],
    AUTO_ON: ["Surveillance mode: Engaged.", "Continuous tracking: On.", "Auto-scan active."],
    AUTO_OFF: ["Surveillance mode: Disengaged.", "Manual control restored.", "Holding position."],
    STOP: ["Aborting.", "Systems reset.", "Command cancelled.", "Standing by."],
    ERROR: ["Signal lost.", "Visual interference detected.", "Negative.", "System sensor malfunction."]
};

const getRandomResponse = (category: keyof typeof RESPONSES) => {
    const options = RESPONSES[category];
    return options[Math.floor(Math.random() * options.length)];
};

// --- UTILITIES: FUZZY MATCHING ---
const levenshtein = (a: string, b: string): number => {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = new Array(bn + 1);
  for (let i = 0; i <= bn; ++i) {
    let row = matrix[i] = new Array(an + 1);
    row[0] = i;
  }
  const firstRow = matrix[0];
  for (let j = 1; j <= an; ++j) {
    firstRow[j] = j;
  }
  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1], // substitution
          matrix[i][j - 1],     // insertion
          matrix[i - 1][j]      // deletion
        ) + 1;
      }
    }
  }
  return matrix[bn][an];
};

const isFuzzyMatch = (transcript: string, keyword: string, threshold = FUZZY_THRESHOLD): boolean => {
    const tLower = transcript.toLowerCase();
    const kLower = keyword.toLowerCase();
    
    // 1. Exact Word Boundary Match (Best for accuracy, prevents "cup" matching "hiccup")
    try {
        const escapedKeyword = kLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
        if (regex.test(tLower)) return true;
    } catch (e) {
        // Fallback for invalid regex
        if (tLower.includes(kLower)) return true;
    }

    const tWords = tLower.split(/\s+/);
    const kWords = kLower.split(/\s+/);

    // If keyword is multi-word (e.g. "auto scan"), check if sliding window sequence matches
    if (kWords.length > 1) {
        if (tWords.length < kWords.length) return false;
        // Construct sliding windows from transcript of same length as keyword
        for (let i = 0; i <= tWords.length - kWords.length; i++) {
            const windowPhrase = tWords.slice(i, i + kWords.length).join(' ');
            const dist = levenshtein(windowPhrase, kLower);
            if (dist / Math.max(windowPhrase.length, kLower.length) <= threshold) return true;
        }
        return false;
    } else {
        // Single word keyword: check against every word in transcript
        return tWords.some(w => {
            const dist = levenshtein(w, kLower);
            // Allow higher threshold for very short words to avoid false negatives, but risk false positives
            const localThreshold = w.length < 4 ? 0.2 : threshold; 
            return dist / Math.max(w.length, kLower.length) <= localThreshold;
        });
    }
};

const checkCommand = (transcript: string, keywords: string[]): boolean => {
    return keywords.some(k => isFuzzyMatch(transcript, k));
};

// --- ICONS ---
const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

// --- HUD SVG COMPONENTS ---
const CornerBracket = ({ className }: { className?: string }) => (
    <svg className={className} width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path d="M1 40V10L10 1H40" stroke="currentColor" strokeWidth="2" />
    </svg>
);

const Reticle = ({ active }: { active: boolean }) => (
    <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all duration-500 ${active ? 'opacity-100 scale-100' : 'opacity-40 scale-90'}`}>
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="28" stroke={active ? "#06b6d4" : "#334155"} strokeWidth="1" strokeDasharray="4 4" className={active ? "animate-[spin-slow_10s_linear_infinite]" : ""} />
            <circle cx="30" cy="30" r="2" fill={active ? "#06b6d4" : "#334155"} />
            <line x1="30" y1="0" x2="30" y2="10" stroke={active ? "#06b6d4" : "#334155"} strokeWidth="2" />
            <line x1="30" y1="50" x2="30" y2="60" stroke={active ? "#06b6d4" : "#334155"} strokeWidth="2" />
            <line x1="0" y1="30" x2="10" y2="30" stroke={active ? "#06b6d4" : "#334155"} strokeWidth="2" />
            <line x1="50" y1="30" x2="60" y2="30" stroke={active ? "#06b6d4" : "#334155"} strokeWidth="2" />
        </svg>
    </div>
);

const AudioWave = ({ listening }: { listening: boolean }) => (
    <div className={`flex items-center gap-1 h-4 transition-opacity duration-300 ${listening ? 'opacity-100' : 'opacity-30'}`}>
        {[1,2,3,4,5].map(i => (
            <div key={i} 
                 className={`w-1 bg-cyan-400 rounded-full transition-all duration-150 ${listening ? 'animate-tech-pulse' : 'h-1'}`} 
                 style={{ 
                     height: listening ? `${Math.random() * 16 + 4}px` : '4px',
                     animationDelay: `${i * 0.1}s` 
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
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState<string | null>(null);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [isAutoScanEnabled, setIsAutoScanEnabled] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [locationName, setLocationName] = useState<string | null>(null);
  
  // Accessibility Settings
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
      speechRate: 1.0,
      voicePitch: 0,
      labelScale: 1.0
  });
  const settingsRef = useRef(settings);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // Load Voices
  useEffect(() => {
    const loadVoices = () => {
        const v = window.speechSynthesis.getVoices();
        setVoices(v);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // --- AUDIO ENGINE ---
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

  const playChime = useCallback((type: 'start' | 'success' | 'click' | 'error') => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    if (type === 'start') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.1);
    } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);
    } else if (type === 'success') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
    } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2000, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.05);
    }
    
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }, [getAudioContext]);

  const triggerHaptic = useCallback((pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }, []);

  const playAudio = useCallback(async (text: string, sessionId: number): Promise<void> => {
    // Cancel any current speech
    window.speechSynthesis.cancel();
    
    // Check abort signal immediately
    if (sessionId !== abortControllerRef.current) return;

    isSpeakingRef.current = true;
    setAgentMessage(text); 
    
    // Temporarily stop listening while speaking
    if (recognitionRef.current) recognitionRef.current.stop();

    return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Voice Selection: Prioritize Female English Voices
        // 1. Google US English (often female)
        // 2. Microsoft Zira (Windows female)
        // 3. Samantha (Mac female)
        // 4. Any voice with "Female" in name
        const preferredVoice = voices.find(v => v.name.includes("Google US English")) ||
                               voices.find(v => v.name.includes("Zira")) ||
                               voices.find(v => v.name.includes("Samantha")) ||
                               voices.find(v => v.lang === 'en-US' && v.name.includes("Female")) ||
                               voices.find(v => v.lang === 'en-US');
        
        if (preferredVoice) utterance.voice = preferredVoice;

        // Map pitch settings: -400..400 (detune style) -> 0.5..1.5 (speech synthesis pitch)
        utterance.pitch = 1 + (settingsRef.current.voicePitch / 800);
        utterance.rate = settingsRef.current.speechRate;

        utterance.onend = () => { 
            isSpeakingRef.current = false;
            setAgentMessage(null); // Hide subtitles when done
            resolve(); 
        };

        utterance.onerror = (e) => {
            console.warn("TTS Error", e);
            isSpeakingRef.current = false;
            setAgentMessage(null);
            resolve();
        };

        window.speechSynthesis.speak(utterance);
    });
  }, [voices]);

  // --- VISION & LOGIC ---
  const captureFrame = (quality = 0.25, customScale?: number) => {
    if (!videoRef.current || !canvasRef.current || !isCameraActive) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const scale = customScale ?? 0.35; 
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
  };

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
                          
                          // NEW: Create a DetectionResult for the location to show the InfoCard
                          const locResult: DetectionResult = {
                              objectName: "CURRENT SECTOR",
                              details: "GPS Triangulation",
                              spokenDescription: `You are currently located in ${description}.`,
                              safetyWarning: "Maintain situational awareness.",
                              boundingBox: undefined // No specific bounding box
                          };
                          
                          setResult(locResult);
                          setAppState(AppState.SPEAKING);
                          
                          await playAudio(locResult.spokenDescription, id);
                          if (id === abortControllerRef.current) startListeningRef.current();
                      }
                  } catch (e) {
                      if (id === abortControllerRef.current) {
                          await playAudio("Location data unavailable.", id);
                          startListeningRef.current();
                      }
                  }
              },
              async (err) => {
                   if (id === abortControllerRef.current) {
                      await playAudio("GPS signal not found.", id);
                      startListeningRef.current();
                   }
              },
              { timeout: 10000, enableHighAccuracy: true }
          );
      } else {
           if (id === abortControllerRef.current) {
               await playAudio("GPS hardware not detected.", id);
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
    if (!isCameraActive || isChatMode) return;
    setAppState(AppState.SCANNING);
    setError(null);
    setResult(null);
    setFocusedId(null);
    const id = ++abortControllerRef.current;
    const base64 = captureFrame(0.15, 0.15);
    
    // Play sound immediately to confirm input
    playChime('click');
    
    try {
      const objects = await detectObjectsLive(base64 || "");
      if (id !== abortControllerRef.current) return;
      
      setLiveObjects(matchAndSmooth(objects));
      setAppState(AppState.IDLE); 
      
      // Speak the findings
      const names = Array.from(new Set(objects.map(o => o.name)));
      let speech = "";
      if (names.length > 0) {
          speech = `Visuals confirmed. I have identified: ${names.slice(0, 4).join(', ')}. Select a target for detailed analysis.`;
      } else {
          speech = "Scan complete. No interactive targets identified in this sector.";
      }
      
      await playAudio(speech, id);
      if (id === abortControllerRef.current) startListeningRef.current(); 

    } catch (e: any) {
        setError({ message: "System sensor malfunction.", type: 'analysis' });
        setAppState(AppState.IDLE);
    }
  }, [playChime, isCameraActive, matchAndSmooth, isChatMode, playAudio]);

  const handleChatInteraction = useCallback(async (text: string) => {
    const sessionId = ++abortControllerRef.current;
    setAppState(AppState.SCANNING); 
    setRecognizedText(text); // Ensure the user's text stays visible
    try {
      const base64 = captureFrame(0.3, 0.3);
      const responseText = await chatWithScene(base64 || "", text);
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
  }, [captureFrame, playAudio]);

  const handleObjectClick = useCallback(async (obj: DetectedObject) => {
    if ((focusedId === obj.id && appState === AppState.SPEAKING) || isChatMode) return;
    playChime('success');
    triggerHaptic(20);
    const sessionId = ++abortControllerRef.current;
    setFocusedId(obj.id);
    setAppState(AppState.SCANNING); 
    setResult(null); 
    setError(null);
    const checkingAudioPromise = playAudio(`Acquiring target: ${obj.name}.`, sessionId);
    try {
      const base64 = captureFrame(0.3, 0.3); 
      const detectionPromise = identifyObject(base64 || "", obj.name);
      const [_, detection] = await Promise.all([checkingAudioPromise, detectionPromise]);
      if (sessionId !== abortControllerRef.current) return;
      setResult(detection); 
      setAppState(AppState.SPEAKING);
      const speechParts = [detection.spokenDescription, detection.safetyWarning ? `Alert: ${detection.safetyWarning}.` : ''].filter(Boolean);
      await playAudio(speechParts.join(' '), sessionId);
      if (sessionId === abortControllerRef.current) startListeningRef.current();
    } catch (err: any) {
      if (sessionId === abortControllerRef.current) handleStop(); 
    }
  }, [focusedId, appState, playAudio, playChime, handleStop, isChatMode, triggerHaptic]);

  // --- VOICE COMMAND PROCESSOR ---
  const processVoiceCommand = useCallback(async (transcript: string) => {
    const lower = transcript.toLowerCase().trim();
    const id = ++abortControllerRef.current;
    setRecognizedText(transcript); // Feedback for user

    // 1. Safety/System Stops
    if (checkCommand(lower, ["stop", "cancel", "reset", "shut down", "exit", "silence", "abort"])) {
        setAppState(AppState.IDLE);
        const msg = getRandomResponse("STOP");
        if (isChatMode) {
             setIsChatMode(false);
             await playAudio(msg, id);
        } else if (isAutoScanEnabled) {
             setIsAutoScanEnabled(false);
             await playAudio(getRandomResponse("AUTO_OFF"), id);
        } else if (focusedId) {
             handleStop();
             await playAudio(msg, id);
        } else {
             handleStop();
             await playAudio(msg, id);
        }
        startListeningRef.current();
        return;
    }

    // 2. Explicit Commands
    if (checkCommand(lower, ["auto scan", "continuous", "surveillance", "tracking mode", "auto mode"])) {
        if (!isAutoScanEnabled) {
            setIsAutoScanEnabled(true);
            setFocusedId(null);
            await playAudio(getRandomResponse("AUTO_ON"), id);
        }
        startListeningRef.current();
        return;
    }

    if (checkCommand(lower, ["scan", "look around", "what's around", "analyze scene", "what do you see", "report"])) {
        await playAudio(getRandomResponse("SCANNING"), id);
        manualScan();
        return;
    }
    
    // NEW: Location Command
    if (checkCommand(lower, ["where am i", "report location", "my position", "coordinates", "gps"])) {
         await playAudio(getRandomResponse("ACKNOWLEDGE"), id);
         await reportLocation(id);
         return;
    }

    if (checkCommand(lower, ["help", "status", "commands", "options"])) {
        await playAudio("NETRA Systems online. State your command. Options: Scan sector, Auto surveillance, 'Describe [object]', Report location.", id);
        startListeningRef.current();
        return;
    }

    // 3. Object Selection (Context-Aware Commands)
    // Supports: "Describe the mug", "Tell me about the laptop", "Analyze the chair"
    const intentPrefixes = ["describe", "tell me about", "analyze", "inspect", "what is", "look at", "check", "examine", "read"];
    let searchTarget = lower;
    let hasIntent = false;
    
    const matchedPrefix = intentPrefixes.find(p => lower.startsWith(p));
    if (matchedPrefix) {
        hasIntent = true;
        // Strip prefix and common articles to isolate the object name
        searchTarget = lower.slice(matchedPrefix.length).trim().replace(/^(the|a|an|this|that)\s+/g, "");
    }

    const match = liveObjectsRef.current.find(obj => {
         const cleanName = obj.name.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
         
         if (hasIntent) {
             // If user explicitly asked to "describe X", check if X matches this object
             return isFuzzyMatch(searchTarget, cleanName, FUZZY_THRESHOLD);
         }
         
         // Fallback: If no explicit prefix, just check if object name is in the sentence
         return isFuzzyMatch(lower, cleanName, FUZZY_THRESHOLD);
    });

    if (match) {
        handleObjectClick(match);
        return;
    }

    // 4. Fallthrough: Agent Chat / Specific Commands
    if (transcript.trim().length > 1) {
        await playAudio(getRandomResponse("ACKNOWLEDGE"), id); 
        handleChatInteraction(transcript);
        return;
    }
    
    // Noise/Short garbage
    startListeningRef.current();
    
  }, [isChatMode, isAutoScanEnabled, focusedId, manualScan, handleChatInteraction, handleStop, handleObjectClick, playAudio, reportLocation]);

  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
    if (isSpeakingRef.current) return; // Don't listen while speaking
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch(e) {} }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false; 
    recognition.interimResults = false; 
    recognition.lang = 'en-US';
    
    recognition.onstart = () => { setIsListening(true); setRecognizedText(null); };
    recognition.onend = () => { setIsListening(false); };
    recognition.onerror = () => { setIsListening(false); };
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setRecognizedText(transcript);
      processVoiceCommand(transcript);
    };
    
    recognitionRef.current = recognition;
    recognition.start();
  }, [processVoiceCommand]);

  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // --- AUTOMATION LOOPS ---
  useEffect(() => {
    if (liveObjects.length === 0 || focusedId !== null || isChatMode) return;
    const now = Date.now();
    const currentNames = Array.from(new Set(liveObjects.map(o => o.name.toLowerCase()))).sort();
    if (currentNames.length === 0) return;
    const hasChanged = JSON.stringify(currentNames) !== JSON.stringify(lastAnnouncedNamesRef.current);
    const timeSinceLast = now - lastAnnounceTimeRef.current;
    if ((hasChanged && timeSinceLast > CHANGE_THROTTLE) || timeSinceLast > ANNOUNCE_INTERVAL) {
        // Only announce automatically in auto-mode or if things change significantly
        // For manual "Scan", we handle speech in the manualScan function directly.
        if (isAutoScanEnabled) {
             const text = `Contacts: ${currentNames.join(', ')}.`;
             const sessionId = abortControllerRef.current;
             playAudio(text, sessionId).then(() => { if (sessionId === abortControllerRef.current) startListening(); });
             lastAnnounceTimeRef.current = now;
             lastAnnouncedNamesRef.current = currentNames;
        }
    }
  }, [liveObjects, focusedId, appState, playAudio, startListening, isListening, isChatMode, isAutoScanEnabled]);

  const runDetectionLoop = useCallback(async () => {
    if (!isCameraActive || !isAutoScanEnabled || focusedId !== null || error || isChatMode) {
      timeoutIdRef.current = window.setTimeout(runDetectionLoop, 1000); return;
    }
    const base64 = captureFrame(0.2, 0.15);
    try {
      const objects = await detectObjectsLive(base64 || "");
      if (focusedId !== null || isChatMode) { timeoutIdRef.current = window.setTimeout(runDetectionLoop, 1000); return; }
      setLiveObjects(matchAndSmooth(objects));
      timeoutIdRef.current = window.setTimeout(runDetectionLoop, AUTO_SCAN_INTERVAL);
    } catch (e: any) { timeoutIdRef.current = window.setTimeout(runDetectionLoop, 2000); }
  }, [isCameraActive, isAutoScanEnabled, focusedId, error, matchAndSmooth, isChatMode]);

  useEffect(() => { if (isCameraActive && isAutoScanEnabled) runDetectionLoop(); return () => { if (timeoutIdRef.current) window.clearTimeout(timeoutIdRef.current); }; }, [isCameraActive, isAutoScanEnabled, runDetectionLoop]);

  // --- STARTUP & PERMISSIONS ---
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, });
        if (videoRef.current) { videoRef.current.srcObject = stream; setIsCameraActive(true); }
      } catch (err) { setError({ message: "Camera sensor offline.", type: 'camera' }); }
    };
    startCamera();
    return () => { if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop()); };
  }, []);

  // System Initialization Handler (Starts Audio & Greetings)
  const initializeSystem = useCallback(() => {
    const ctx = getAudioContext();
    ctx.resume().then(() => {
        setHasInitialized(true);
        const id = abortControllerRef.current;
        playChime('start');
        setTimeout(() => {
            playAudio("Agent NETRA online. Audio link established. Ready for command.", id).then(() => {
                reportLocation(id);
            });
        }, 800);
    });
  }, [getAudioContext, playChime, playAudio, reportLocation]);

  return (
    <div className="relative w-full h-dvh bg-black overflow-hidden select-none font-sans text-cyan-50">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      {/* --- INITIALIZATION OVERLAY (Audio Fix) --- */}
      {!hasInitialized && !error && (
          <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6">
              <div className="text-center space-y-6 max-w-sm animate-in fade-in duration-1000">
                  <h1 className="text-3xl font-bold italic tracking-tighter text-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,0.8)]">
                      NETRA OS
                  </h1>
                  <p className="text-cyan-600 font-mono text-sm">
                      TACTICAL VISUAL ASSISTANT<br/>V2.4 ONLINE
                  </p>
                  <button 
                      onClick={initializeSystem}
                      className="bg-cyan-500/10 border border-cyan-500/50 text-cyan-400 px-8 py-4 font-mono uppercase tracking-widest text-lg hover:bg-cyan-500/20 hover:scale-105 transition-all duration-300 clip-tech-border"
                  >
                      Initialize System
                  </button>
                  <p className="text-xs text-cyan-800 font-mono pt-4">Tap to activate audio sensors</p>
              </div>
          </div>
      )}

      {/* --- HUD LAYER --- */}
      <div className="absolute inset-0 pointer-events-none z-10">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.6)_100%)] opacity-80" />
         <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
         
         <Reticle active={appState === AppState.SCANNING || appState === AppState.SPEAKING} />

         {/* Corner Brackets with Safe Area awareness */}
         <CornerBracket className="absolute top-4 left-4 pt-safe pl-2 text-cyan-500 opacity-80" />
         <CornerBracket className="absolute top-4 right-4 pt-safe pr-2 rotate-90 text-cyan-500 opacity-80" />
         <CornerBracket className="absolute bottom-4 left-4 pb-safe pl-2 -rotate-90 text-cyan-500 opacity-80" />
         <CornerBracket className="absolute bottom-4 right-4 pb-safe pr-2 rotate-180 text-cyan-500 opacity-80" />

         {appState === AppState.SCANNING && <div className="animate-scan-laser" />}
      </div>

      {/* --- AR OVERLAY --- */}
      <div className="absolute inset-0 pointer-events-none z-20">
        {isCameraActive && !error && !isChatMode && liveObjects.map((obj) => {
          const isThisFocused = focusedId === obj.id;
          const isAnyFocused = focusedId !== null;
          
          return (
            <React.Fragment key={obj.id}>
              <div
                className={`absolute pointer-events-auto cursor-pointer transition-all duration-300 ${
                  isThisFocused 
                    ? 'border-2 border-cyan-300 bg-cyan-400/20 z-30 shadow-[0_0_25px_rgba(6,182,212,0.6)]' 
                    : isAnyFocused 
                        ? 'opacity-0 scale-95' 
                        : 'border border-cyan-400/50 hover:border-cyan-300 hover:bg-cyan-400/10 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                }`}
                style={{ 
                    top: `${obj.ymin / 10}%`, left: `${obj.xmin / 10}%`, 
                    width: `${(obj.xmax - obj.xmin) / 10}%`, height: `${(obj.ymax - obj.ymin) / 10}%` 
                }}
                onClick={() => handleObjectClick(obj)}
                onMouseEnter={() => triggerHaptic(5)}
              >
                {!isThisFocused && (
                  <>
                    <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-300 drop-shadow-md" />
                    <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-300 drop-shadow-md" />
                    <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-300 drop-shadow-md" />
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-300 drop-shadow-md" />
                  </>
                )}
                
                <div className={`absolute -top-8 left-0 flex items-center gap-2 transition-opacity ${isAnyFocused && !isThisFocused ? 'opacity-0' : 'opacity-100'}`}>
                    <span 
                      className="bg-black/90 border border-cyan-400/60 text-cyan-300 font-bold font-mono px-3 py-1 uppercase tracking-wider backdrop-blur-md whitespace-nowrap shadow-lg"
                      style={{ fontSize: `${12 * settings.labelScale}px` }}
                    >
                        {obj.name}
                    </span>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* --- GLOBAL INFO CARD OVERLAY --- */}
      {result && (
        <div 
          className="absolute z-50 pointer-events-auto w-[90vw] max-w-sm" 
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <InfoCard result={result} onDismiss={handleStop} />
        </div>
      )}

      {/* --- STATUS OVERLAYS --- */}
      {/* 1. User Voice Transcript */}
      {recognizedText && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full flex justify-center mt-safe px-4">
            <div className="bg-black/80 border-l border-r border-cyan-500 px-8 py-3 backdrop-blur-md clip-tech-border max-w-full shadow-lg">
                <span className="text-cyan-400 font-mono text-lg uppercase tracking-widest typing-effect text-center block truncate">
                     "{recognizedText}"
                </span>
            </div>
        </div>
      )}

      {/* 2. Agent Response Subtitles (New) */}
      {agentMessage && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full max-w-lg flex justify-center px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-cyan-950/90 border border-cyan-500/40 px-6 py-4 backdrop-blur-xl clip-tech-border shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                    <span className="text-[10px] font-mono text-cyan-500 uppercase tracking-widest">Incoming Transmission</span>
                </div>
                <p className="text-cyan-100 font-mono text-sm md:text-base leading-relaxed text-center">
                     {agentMessage}
                </p>
            </div>
        </div>
      )}
      
      {/* Agent Thinking Visualizer */}
      {(appState === AppState.SCANNING || appState === AppState.SPEAKING) && !result && !agentMessage && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none flex flex-col items-center gap-4">
            <div className={`w-24 h-24 rounded-full border border-cyan-500/30 flex items-center justify-center relative ${appState === AppState.SPEAKING ? 'animate-pulse' : 'animate-spin'}`}>
                 <div className="absolute inset-0 rounded-full border-t border-cyan-500 animate-spin" />
            </div>
            <div className="bg-black/60 px-4 py-1 border border-cyan-500/30 rounded-sm">
                <p className="text-cyan-400 font-mono text-xs uppercase tracking-widest">
                    {appState === AppState.SPEAKING ? "TRANSMITTING DATA..." : "PROCESSING QUERY..."}
                </p>
            </div>
        </div>
      )}

      {/* --- TOP HEADER --- */}
      <div className="absolute top-0 left-0 w-full p-4 pt-safe flex justify-between items-start z-30 pointer-events-none bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex flex-col">
            <h1 className="text-xl font-bold italic tracking-tighter text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]">
                NETRA <span className="text-xs not-italic font-mono text-cyan-700 ml-1">OS v2.4</span>
            </h1>
            <div className="flex items-center gap-1 mt-1">
                <div className={`w-1.5 h-1.5 rounded-full ${isCameraActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-[9px] font-mono text-cyan-600 uppercase">{isCameraActive ? "SYS_ONLINE" : "SYS_OFFLINE"}</span>
            </div>
        </div>
        <div className="font-mono text-xs text-cyan-600 text-right pointer-events-auto flex flex-col items-end">
            <button onClick={() => setShowSettings(true)} className="mb-2 hover:text-cyan-400 bg-black/40 p-1.5 rounded border border-cyan-500/20 backdrop-blur-md transition-colors"><SettingsIcon/></button>
            
            {/* LOCATION DISPLAY */}
            {locationName && (
                <div className="text-cyan-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1 animate-in fade-in slide-in-from-right-4">
                     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                     {locationName}
                </div>
            )}

            <div>{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            <div className="flex items-center gap-2 mt-1 justify-end">
                <span className={`text-[9px] uppercase ${isListening ? 'text-cyan-400' : 'text-cyan-800'}`}>{isListening ? "MIC_ON" : "MIC_STANDBY"}</span>
                <AudioWave listening={isListening} />
            </div>
        </div>
      </div>
      
      {/* --- SETTINGS MODAL --- */}
      {showSettings && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
              <div className="bg-slate-900 border border-cyan-500/50 p-6 w-full max-w-sm clip-tech-border shadow-[0_0_30px_rgba(6,182,212,0.2)]">
                  <div className="flex justify-between items-center mb-6 border-b border-cyan-500/30 pb-2">
                      <h2 className="text-cyan-400 font-bold italic tracking-tighter text-xl">SYSTEM_CONFIG</h2>
                      <button onClick={() => setShowSettings(false)} className="text-cyan-600 hover:text-cyan-300">
                          <CloseIcon />
                      </button>
                  </div>
                  
                  <div className="space-y-6">
                      {/* Speech Rate */}
                      <div className="space-y-2">
                          <div className="flex justify-between text-xs font-mono text-cyan-500">
                              <span>VOICE_RATE</span>
                              <span>{settings.speechRate.toFixed(1)}x</span>
                          </div>
                          <input 
                              type="range" min="0.5" max="2.0" step="0.1"
                              value={settings.speechRate}
                              onChange={(e) => setSettings(p => ({...p, speechRate: parseFloat(e.target.value)}))}
                              className="w-full accent-cyan-500 h-1 bg-cyan-900/50 rounded-lg appearance-none cursor-pointer"
                          />
                      </div>

                      {/* Pitch */}
                      <div className="space-y-2">
                          <div className="flex justify-between text-xs font-mono text-cyan-500">
                              <span>VOICE_PITCH</span>
                              <span>{settings.voicePitch > 0 ? '+' : ''}{settings.voicePitch}</span>
                          </div>
                          <input 
                              type="range" min="-400" max="400" step="50"
                              value={settings.voicePitch}
                              onChange={(e) => setSettings(p => ({...p, voicePitch: parseInt(e.target.value)}))}
                              className="w-full accent-cyan-500 h-1 bg-cyan-900/50 rounded-lg appearance-none cursor-pointer"
                          />
                      </div>

                      {/* AR Label Size */}
                      <div className="space-y-2">
                          <div className="flex justify-between text-xs font-mono text-cyan-500">
                              <span>AR_LABEL_SCALE</span>
                              <span>{Math.round(settings.labelScale * 100)}%</span>
                          </div>
                          <input 
                              type="range" min="0.8" max="2.0" step="0.1"
                              value={settings.labelScale}
                              onChange={(e) => setSettings(p => ({...p, labelScale: parseFloat(e.target.value)}))}
                              className="w-full accent-cyan-500 h-1 bg-cyan-900/50 rounded-lg appearance-none cursor-pointer"
                          />
                      </div>
                  </div>

                  <div className="mt-8 pt-4 border-t border-cyan-500/30">
                      <button 
                          onClick={() => {
                              setSettings({speechRate: 1.0, voicePitch: 0, labelScale: 1.0});
                              playChime('click');
                          }}
                          className="w-full py-2 bg-cyan-950/50 border border-cyan-800 text-cyan-600 font-mono text-xs uppercase hover:bg-cyan-900/50 hover:text-cyan-400 transition-colors"
                      >
                          Reset Defaults
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- BOTTOM COMMAND DECK --- */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40 pointer-events-auto p-4 pb-8 pb-safe bg-gradient-to-t from-black/80 to-transparent">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-cyan-500/20 clip-tech-border p-2 shadow-2xl">
            
            {/* Control Grid */}
            <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => manualScan()}
                  className="relative h-12 flex flex-col items-center justify-center border transition-all duration-300 clip-tech-corner-tl bg-transparent border-cyan-800/50 text-cyan-700 hover:bg-cyan-900/30 active:scale-95"
                >
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Scan</span>
                    <div className="absolute bottom-0 w-full h-0.5 bg-transparent" />
                </button>

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
                  className={`relative h-12 flex flex-col items-center justify-center border transition-all duration-300 active:scale-95 ${isAutoScanEnabled ? 'bg-emerald-500/10 border-emerald-400 text-emerald-300' : 'bg-transparent border-cyan-800/50 text-cyan-700'}`}
                >
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Auto</span>
                    <div className={`absolute bottom-0 w-full h-0.5 ${isAutoScanEnabled ? 'bg-emerald-400' : 'bg-transparent'}`} />
                </button>

                <button 
                  onClick={() => handleStop()}
                  className="relative h-12 flex flex-col items-center justify-center border transition-all duration-300 clip-tech-corner-br bg-transparent border-cyan-800/50 text-cyan-700 hover:text-red-400 hover:border-red-900 active:scale-95"
                >
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Reset</span>
                </button>
            </div>

            <div className="mt-2 flex justify-between items-center px-2">
                <span className="text-[9px] font-mono text-cyan-600 uppercase">
                    STATUS: {appState === AppState.SCANNING ? "ANALYZING..." : appState === AppState.SPEAKING ? "TRANSMITTING..." : isListening ? "LISTENING..." : "STANDBY"}
                </span>
                <button onClick={() => { startListeningRef.current(); }} className="text-[9px] font-mono text-cyan-600 hover:text-cyan-400 uppercase p-2 -m-2">
                    FORCE_MIC
                </button>
            </div>
        </div>
      </div>

      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-8 bg-black/90 z-50">
          <div className="border border-red-500/50 bg-red-950/20 p-6 max-w-xs text-center clip-tech-border">
            <h2 className="text-red-500 font-mono text-xl uppercase mb-2">System Failure</h2>
            <p className="text-red-300/80 text-xs font-mono mb-4">{error.message}</p>
            <button onClick={() => { setError(null); handleStop(); }} className="bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/50 px-6 py-2 text-xs font-mono uppercase">Reboot</button>
          </div>
        </div>
      )}
    </div>
  );
};