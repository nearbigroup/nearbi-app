/**
 * Single source of truth for lateness band colors, limits, and styles
 * used across the In-Time Grid UI, PDF export, and Excel export.
 */

export interface ColorBandDef {
  hex: string;          // Hex without #, e.g. '3CC24A'
  hashHex: string;      // Hex with #, e.g. '#3CC24A'
  rgb: [number, number, number]; // [R, G, B] for jsPDF
  textHex: string;      // Contrasting text color, e.g. '#000000' or '#FFFFFF'
  textRgb: [number, number, number];
  label: string;
  limitText: string;
}

export const IN_TIME_COLORS = {
  green: {
    hex: '3CC24A',
    hashHex: '#3CC24A',
    rgb: [60, 194, 74],
    textHex: '#000000',
    textRgb: [0, 0, 0],
    label: 'Green',
    limitText: 'On time / Early',
  },
  yellow: {
    hex: 'FFFF00',
    hashHex: '#FFFF00',
    rgb: [255, 255, 0],
    textHex: '#000000',
    textRgb: [0, 0, 0],
    label: 'Yellow',
    limitText: '1 - 15 mins late',
  },
  orange: {
    hex: 'FFA500',
    hashHex: '#FFA500',
    rgb: [255, 165, 0],
    textHex: '#000000',
    textRgb: [0, 0, 0],
    label: 'Orange',
    limitText: '16 - 30 mins late',
  },
  red: {
    hex: 'FF0000',
    hashHex: '#FF0000',
    rgb: [255, 0, 0],
    textHex: '#FFFFFF',
    textRgb: [255, 255, 255],
    label: 'Red',
    limitText: '> 30 mins late',
  },
  grey: {
    hex: 'BFBFBF',
    hashHex: '#BFBFBF',
    rgb: [191, 191, 191],
    textHex: '#000000',
    textRgb: [0, 0, 0],
    label: 'No Punch',
    limitText: 'Past day with no punch',
  },
  white: {
    hex: 'FFFFFF',
    hashHex: '#FFFFFF',
    rgb: [255, 255, 255],
    textHex: '#000000',
    textRgb: [0, 0, 0],
    label: 'No Shift',
    limitText: 'Hourly / No shift set',
  },
} as const;

export const LATE_BAND_LIMITS = {
  yellow: { min: 1, max: 15, label: '1 - 15 min' },
  orange: { min: 16, max: 30, label: '16 - 30 min' },
  red: { min: 31, max: Infinity, label: 'Over 30 min' },
} as const;
