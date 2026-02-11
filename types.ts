
export interface DetectedObject {
  id: string;
  name: string;
  shortDetails: string;
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface DetectionResult {
  objectName: string;
  details: string;
  spokenDescription: string;
  safetyWarning?: string;
  expiryDate?: string;
  boundingBox?: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
  };
}

export enum AppState {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  SPEAKING = 'SPEAKING',
  ERROR = 'ERROR'
}
