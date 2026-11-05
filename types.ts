export interface CompositionItem {
  name: string;
  percentage: number;
  description: string;
  fill: string; // Hex color code
}

export interface AnalysisData {
  summary: string;
  composition: CompositionItem[];
  estimatedRealWorldArea?: string; // AI guess based on context
  confidenceScore: number; // 0-100 score of how confident the AI is
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  ENHANCING = 'ENHANCING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface EnhancementResult {
  originalImage: string; // Base64
  enhancedImage: string; // Base64
}

// New types for Manual Measurement and Cost Estimation
export interface Point {
  x: number;
  y: number;
}

export enum MeasureMode {
  NONE = 'NONE',
  SCALE = 'SCALE', // Setting the reference line
  POLYGON = 'POLYGON' // Drawing the area
}

export interface CostCategory {
  id: string;
  name: string;
  pricePerEb: number; // Price per unit (m2)
  isEnabled: boolean;
}

export interface MeasurementData {
  scalePixels: number;
  scaleRealLength: number; // in meters
  areaM2: number;
}