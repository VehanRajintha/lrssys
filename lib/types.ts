export interface BoundingBoxes {
  greenStamp?: [number, number, number, number];
  customsRef?: [number, number, number, number];
  consignee?: [number, number, number, number];
  declarant?: [number, number, number, number];
  [key: string]: [number, number, number, number] | undefined;
}

export type RecordStatus = 'VERIFIED' | 'NEEDS_REVIEW' | 'CORRECTED';

export interface CusDecRecord {
  id: string;
  filename: string;
  imagePath: string;
  imageUrl: string;
  originalName?: string;
  fileHash?: string | null;
  greenStampNumber: string;
  customsRefNumber: string;
  customsDate: string;
  consigneeName: string;
  consigneeTIN: string;
  declarantName: string;
  declarantTIN: string;
  blNumber: string;
  packagesCount: string;
  goodsDescription: string;
  confidence: number;
  status: RecordStatus;
  issues: string[];
  boundingBoxes: BoundingBoxes | null;
  manualCorrection: boolean;
  createdAt?: string;
  updatedAt?: string;
  mergeCount?: number;
  macroZoomApplied?: boolean;
  matchedMasterName?: string | null;
}

export interface Settings {
  geminiApiKey: string;
  geminiBackupApiKey?: string;
  geminiModel: string;
  autoVerifyThreshold: number;
  workerConcurrency: number;
  consignorConsigneeMode: string;
  preserveLeadingZeros: boolean;
}

export interface QueueStatus {
  isProcessing: boolean;
  isPaused: boolean;
  pendingCount: number;
  inFlightCount: number;
  completedCount: number;
  failedCount: number;
  totalCount: number;
  progressPercent: number;
}

export interface Stats {
  total: number;
  verified: number;
  needsReview: number;
  corrected: number;
  accuracyRate: number;
}

export interface TallyRecord {
  rowIndex?: number;
  counterStamp?: string;
  customsRef?: string;
  date?: string;
  consigneeName: string;
  declarantName: string;
  companyName?: string;
  normalizedConsignee: string;
  normalizedDeclarant: string;
  normalizedCompany?: string;
  matchNote?: string;
  sourceRowFile1?: number;
  rawRow?: string[];
}

export interface TallyResult {
  matched: TallyRecord[];
  unmatchedFile1: TallyRecord[];
  unmatchedFile2: TallyRecord[];
  stats: {
    totalFile1: number;
    totalFile2: number;
    matchedCount: number;
    unmatchedFile1Count: number;
    unmatchedFile2Count: number;
    matchRate: number;
  };
}
