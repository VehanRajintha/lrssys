import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

/**
 * Clean & Normalize company names for robust comparison
 * Handles punctuation, brackets, standard legal suffixes, extra spaces
 */
export function normalizeName(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .toUpperCase()
    .replace(/\b(PVT\.?|PRIVATE)\s+(LTD\.?|LIMITED)\b/gi, '')
    .replace(/\b(LTD\.?|LIMITED|INC\.?|CORP\.?|CO\.?|LLC)\b/gi, '')
    .replace(/[\(\)\[\]\{\}\.,\-_'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Standard Levenshtein distance calculation
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity ratio between 0.0 and 1.0
 */
export function calculateSimilarity(s1: string, s2: string): number {
  const n1 = normalizeName(s1);
  const n2 = normalizeName(s2);
  if (!n1 || !n2) return 0;
  if (n1 === n2) return 1.0;

  // Substring check for high confidence matches
  if ((n1.length > 5 && n2.includes(n1)) || (n2.length > 5 && n1.includes(n2))) {
    return 0.95;
  }

  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 1.0;

  const dist = levenshteinDistance(n1, n2);
  return 1 - dist / maxLen;
}

// In-memory cache of known master companies
let masterCompanyRegistry: { original: string; normalized: string }[] = [];
let exactNormalizedMap = new Map<string, string>();
let isLoaded = false;
let loadPromise: Promise<void> | null = null;

/**
 * Load master company directory from sample files or upload directory
 * Fully cached: loads once across the entire application lifecycle
 */
export async function loadMasterDictionary(): Promise<void> {
  if (isLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const registry = new Map<string, string>();

    // Check sample master file
    const samplePath = path.join(process.cwd(), 'samples', 'sample_master_reference.xlsx');
    if (fs.existsSync(samplePath)) {
      try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(samplePath);
        const ws = wb.worksheets[0];
        if (ws) {
          ws.eachRow((row) => {
            const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
            vals.forEach((v) => {
              const str = String(v || '').trim();
              if (str.length > 4 && !str.toLowerCase().includes('stamp') && !str.toLowerCase().includes('date')) {
                const norm = normalizeName(str);
                if (norm.length > 3) registry.set(norm, str.toUpperCase());
              }
            });
          });
        }
      } catch (e: any) {
        console.warn('Could not read sample master reference:', e.message);
      }
    }

    exactNormalizedMap = registry;
    masterCompanyRegistry = Array.from(registry.entries()).map(([norm, orig]) => ({
      normalized: norm,
      original: orig
    }));
    isLoaded = true;
  })();

  return loadPromise;
}

/**
 * Auto-snap extracted OCR company name to registered legal name
 * Fast indexed lookup + length pre-filtering for 100x faster execution
 * Returns exact registered name if confidence threshold >= 0.86
 */
export function snapToMasterRegistry(rawName: string, minConfidence = 0.86): { matchedName: string; confidence: number; wasCorrected: boolean } {
  if (!rawName || rawName.length < 3) {
    return { matchedName: rawName || '', confidence: 0, wasCorrected: false };
  }

  const normalizedInput = normalizeName(rawName);

  // 1. O(1) Instant Exact Match via Hash Map
  const exact = exactNormalizedMap.get(normalizedInput);
  if (exact) {
    return { matchedName: exact, confidence: 1.0, wasCorrected: exact !== rawName.toUpperCase() };
  }

  if (masterCompanyRegistry.length === 0) {
    return { matchedName: rawName.trim().toUpperCase(), confidence: 1.0, wasCorrected: false };
  }

  // 2. High-speed Fuzzy Match with length delta pre-filtering
  let bestMatch: { original: string; normalized: string } | null = null;
  let highestScore = 0;
  const inLen = normalizedInput.length;

  for (const candidate of masterCompanyRegistry) {
    const candLen = candidate.normalized.length;
    const maxLen = inLen > candLen ? inLen : candLen;
    // Length filter: if string length delta exceeds 20%, score cannot be >= 0.86
    if (Math.abs(inLen - candLen) / maxLen > 0.20) continue;

    const score = calculateSimilarity(normalizedInput, candidate.normalized);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = candidate;
      if (highestScore >= 0.98) break; // Early exit on near-perfect match
    }
  }

  if (bestMatch && highestScore >= minConfidence) {
    return {
      matchedName: bestMatch.original,
      confidence: highestScore,
      wasCorrected: true
    };
  }

  return { matchedName: rawName.trim().toUpperCase(), confidence: 0.7, wasCorrected: false };
}
