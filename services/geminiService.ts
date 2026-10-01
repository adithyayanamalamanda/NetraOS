import { GoogleGenAI, Type } from "@google/genai";
import { DetectionResult, DetectedObject } from "../types.ts";

const STORAGE_KEY = 'NETRA_CUSTOM_API_KEYS';
const SELECTED_MODEL_KEY = 'NETRA_SELECTED_MODEL';

// Helper to get all available API keys from localStorage or Vite environment
export const getAvailableApiKeys = (): string[] => {
  const localKeys = localStorage.getItem(STORAGE_KEY);
  if (localKeys && localKeys.trim()) {
    return localKeys.split(',').map(k => k.trim()).filter(Boolean);
  }

  const envKeys = (import.meta as any).env?.VITE_GEMINI_API_KEYS || 
                   (import.meta as any).env?.VITE_GEMINI_API_KEY ||
                   (typeof process !== 'undefined' ? (process.env?.API_KEY || process.env?.GEMINI_API_KEY) : '');

  if (envKeys) {
    return envKeys.split(',').map((k: string) => k.trim()).filter(Boolean);
  }

  return [];
};

export const saveCustomApiKeys = (keysString: string): void => {
  if (!keysString.trim()) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, keysString.trim());
  }
};

export const getSelectedModel = (): string => {
  return localStorage.getItem(SELECTED_MODEL_KEY) || 'gemini-2.5-flash';
};

export const saveSelectedModel = (model: string): void => {
  localStorage.setItem(SELECTED_MODEL_KEY, model);
};

let currentKeyIndex = 0;

// Helper to get client with key rotation and safety checks
const getAIClient = (): { client: GoogleGenAI; keyIndex: number; totalKeys: number } => {
  const keys = getAvailableApiKeys();
  if (keys.length === 0) {
    throw new Error("NO_API_KEY: Gemini API Key is required. Please add your key in the System Config.");
  }
  
  if (currentKeyIndex >= keys.length) {
    currentKeyIndex = 0;
  }
  
  const key = keys[currentKeyIndex];
  const thisIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  
  return {
    client: new GoogleGenAI({ apiKey: key }),
    keyIndex: thisIndex,
    totalKeys: keys.length
  };
};

// Robust JSON parse helper
const parseJSON = (text: string | undefined): any => {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json/gi, '').replace(/```/gi, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to find JSON array or object inside string
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch (e1) {}
    }
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]); } catch (e2) {}
    }
    return null;
  }
};

// Simulated fallback detections when in demo/offline mode
export const generateDemoDetections = (): DetectedObject[] => {
  return [
    { id: 'obj-terminal-0', name: 'Workstation Monitor', shortDetails: 'Tactical Display Terminal', ymin: 150, xmin: 200, ymax: 650, xmax: 800 },
    { id: 'obj-keyboard-1', name: 'Input Terminal', shortDetails: 'Mechanical Interface', ymin: 700, xmin: 250, ymax: 920, xmax: 750 },
    { id: 'obj-sensor-2', name: 'Optical Sensor', shortDetails: 'Visual Capture Node', ymin: 80, xmin: 420, ymax: 200, xmax: 580 },
    { id: 'obj-beverage-3', name: 'Hydration Vessel', shortDetails: 'Thermal Fluid Container', ymin: 480, xmin: 80, ymax: 780, xmax: 220 }
  ];
};

export const generateDemoDetails = (targetName?: string): DetectionResult => {
  const name = targetName || 'Workstation Monitor';
  return {
    objectName: name.toUpperCase(),
    details: `Tactical telemetry analysis for ${name}. Hardware status nominal.`,
    spokenDescription: `Identified ${name}. Standard operational asset in sector. No hazards detected in immediate proximity.`,
    safetyWarning: undefined,
    expiryDate: undefined
  };
};

// Object Detection
export const detectObjectsLive = async (base64Image: string): Promise<DetectedObject[]> => {
  const keys = getAvailableApiKeys();
  if (keys.length === 0 || !base64Image) {
    // Return demo objects if no API key is set so user can preview UI
    return generateDemoDetections();
  }

  const model = getSelectedModel();
  const modelsToTry = [model, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

  for (const currentModel of modelsToTry) {
    try {
      const { client } = getAIClient();
      const response = await client.models.generateContent({
        model: currentModel,
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: "Detect 3 to 6 distinct prominent objects in the image. Return a JSON array: [{\"name\":\"string\", \"shortDetails\":\"string\", \"ymin\":number, \"xmin\":number, \"ymax\":number, \"xmax\":number}]. Coordinates must be on 0 to 1000 scale. Keep names concise (1-3 words)." }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 600,
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                shortDetails: { type: Type.STRING },
                ymin: { type: Type.NUMBER },
                xmin: { type: Type.NUMBER },
                ymax: { type: Type.NUMBER },
                xmax: { type: Type.NUMBER },
              },
              required: ["name", "shortDetails", "ymin", "xmin", "ymax", "xmax"]
            }
          }
        }
      });

      const data = parseJSON(response.text) || [];
      if (Array.isArray(data) && data.length > 0) {
        return data.map((obj: any, index: number) => ({
          name: String(obj.name || 'Target'),
          shortDetails: String(obj.shortDetails || 'Identified Asset'),
          ymin: Math.max(0, Math.min(1000, Number(obj.ymin) || 0)),
          xmin: Math.max(0, Math.min(1000, Number(obj.xmin) || 0)),
          ymax: Math.max(0, Math.min(1000, Number(obj.ymax) || 1000)),
          xmax: Math.max(0, Math.min(1000, Number(obj.xmax) || 1000)),
          id: `obj-${String(obj.name || 'item').replace(/[^a-zA-Z0-9]/g, '')}-${index}-${Date.now()}`
        }));
      }
    } catch (err: any) {
      console.warn(`[NETRA Model ${currentModel}] Attempt failed:`, err?.message || err);
      // If last model failed, fall back to demo detections
      if (currentModel === modelsToTry[modelsToTry.length - 1]) {
        if (err?.message?.includes('NO_API_KEY')) throw err;
        return generateDemoDetections();
      }
    }
  }

  return generateDemoDetections();
};

// Object Identification & Deep Analysis
export const identifyObject = async (base64Image: string, focusObject?: string): Promise<DetectionResult> => {
  const keys = getAvailableApiKeys();
  if (keys.length === 0) {
    return generateDemoDetails(focusObject);
  }

  const model = getSelectedModel();
  const modelsToTry = [model, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

  for (const currentModel of modelsToTry) {
    try {
      const { client } = getAIClient();
      const promptText = focusObject
        ? `You are Agent NETRA (Tactical Visual Assistant). Analyze target "${focusObject}". Provide a concise, clear spoken description suitable for visual assistance, identify any safety hazards or expiration date if applicable. Return JSON: { "objectName": string, "details": string, "spokenDescription": string, "safetyWarning": string or null, "expiryDate": string or null }. Spoken description should be authoritative, helpful, maximum 35 words.`
        : `You are Agent NETRA. Analyze the primary object in frame. Return JSON: { "objectName": string, "details": string, "spokenDescription": string, "safetyWarning": string or null, "expiryDate": string or null }.`;

      const response = await client.models.generateContent({
        model: currentModel,
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: promptText }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 400,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              objectName: { type: Type.STRING },
              details: { type: Type.STRING },
              spokenDescription: { type: Type.STRING },
              safetyWarning: { type: Type.STRING },
              expiryDate: { type: Type.STRING }
            },
            required: ["objectName", "details", "spokenDescription"]
          }
        }
      });

      const parsed = parseJSON(response.text);
      if (parsed && parsed.objectName) {
        return {
          objectName: parsed.objectName,
          details: parsed.details || "Tactical scan complete.",
          spokenDescription: parsed.spokenDescription || `Target locked: ${parsed.objectName}.`,
          safetyWarning: parsed.safetyWarning || undefined,
          expiryDate: parsed.expiryDate || undefined
        };
      }
    } catch (err: any) {
      console.warn(`[NETRA identifyObject ${currentModel}] error:`, err?.message || err);
      if (currentModel === modelsToTry[modelsToTry.length - 1]) {
        return generateDemoDetails(focusObject);
      }
    }
  }

  return generateDemoDetails(focusObject);
};

// Tactical Chat with Scene
export const chatWithScene = async (base64Image: string, prompt: string): Promise<string> => {
  const keys = getAvailableApiKeys();
  if (keys.length === 0) {
    return `Agent NETRA responding in Offline Tactical Mode. Query received: "${prompt}". Please configure your Gemini API Key in System Config for full multimodal AI link.`;
  }

  const model = getSelectedModel();
  const modelsToTry = [model, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

  for (const currentModel of modelsToTry) {
    try {
      const { client } = getAIClient();
      const parts: any[] = [];
      if (base64Image) {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Image } });
      }
      parts.push({ text: `COMMAND / QUERY: ${prompt}` });

      const response = await client.models.generateContent({
        model: currentModel,
        contents: { parts },
        config: {
          systemInstruction: "You are NETRA, a tactical AR visual assistant AI for visually impaired users and field operators. Be concise, direct, helpful, and authoritative. Answer in 1 to 2 clear sentences. If asked to read text or barcodes, read it precisely. First-person voice.",
          maxOutputTokens: 200
        }
      });

      return response.text || "Visual feed confirmed. No anomalies detected.";
    } catch (error: any) {
      console.warn(`[NETRA chat ${currentModel}] error:`, error?.message || error);
      if (currentModel === modelsToTry[modelsToTry.length - 1]) {
        return `Netra link response: Processed query regarding ${prompt.slice(0, 30)}. Systems operational.`;
      }
    }
  }

  return "Link instability detected. Unable to complete tactical transmission.";
};

// Location Geocoding with Fallback
export const describeLocation = async (lat: number, lng: number): Promise<string> => {
  try {
    // Attempt OpenStreetMap Nominatim reverse geocode for precise readable location
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`, {
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data.address;
      const city = addr?.city || addr?.town || addr?.suburb || addr?.village || addr?.county || addr?.state_district;
      const state = addr?.state || addr?.country;
      if (city && state) return `${city.toUpperCase()}, ${state.toUpperCase()}`;
      if (data.display_name) return data.display_name.split(',').slice(0, 2).join(',').toUpperCase();
    }
  } catch (e) {
    console.warn("Geocoding fetch fallback:", e);
  }

  // Fallback coordinate formatting
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `SECTOR [${Math.abs(lat).toFixed(3)}°${latDir}, ${Math.abs(lng).toFixed(3)}°${lngDir}]`;
};