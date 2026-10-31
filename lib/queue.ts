import { EventEmitter } from 'events';
import path from 'path';
import * as db from './db';
import * as extractor from './extractor';
import { QueueStatus, CusDecRecord } from './types';

export interface QueueTask {
  id: string;
  filePath: string;
  imageUrl?: string;
  originalName: string;
  fileHash: string | null;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error: string | null;
  addedAt: string;
  record?: CusDecRecord;
  retryCount?: number;
}

export class ProcessingQueue extends EventEmitter {
  public queue: QueueTask[] = [];
  public inFlight: Set<string> = new Set();
  public isProcessing: boolean = false;
  public isPaused: boolean = false;
  public stats = {
    total: 0,
    completed: 0,
    failed: 0
  };

  private rateLimitCooldownUntil: number = 0;
  private isScheduling: boolean = false;

  constructor() {
    super();
  }

  enqueue(imageFiles: Array<{ filePath: string; originalName?: string; fileHash?: string | null; imageUrl?: string }>): void {
    const filesArray = Array.isArray(imageFiles) ? imageFiles : [imageFiles];
    for (const file of filesArray) {
      this.queue.push({
        id: 'TASK_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        filePath: file.filePath,
        imageUrl: file.imageUrl,
        originalName: file.originalName || path.basename(file.filePath),
        fileHash: file.fileHash || null,
        status: 'PENDING',
        error: null,
        addedAt: new Date().toISOString(),
        retryCount: 0
      });
      this.stats.total++;
    }
    this.emitStatus();
    this.processNext();
  }

  processNext(): void {
    if (this.isPaused || this.isScheduling) return;

    const settings = db.getSettings();
    // Allow true parallel worker concurrency up to 12 (matches UI setting)
    const concurrency = Math.max(1, Math.min(12, settings.workerConcurrency || 6));

    // Adaptive Rate Pacing: Only pause if a 429 was recently encountered
    const now = Date.now();
    if (now < this.rateLimitCooldownUntil) {
      const waitTime = this.rateLimitCooldownUntil - now;
      this.isScheduling = true;
      setTimeout(() => {
        this.isScheduling = false;
        this.processNext();
      }, waitTime);
      return;
    }

    // Dispatch available workers in true parallel
    while (this.inFlight.size < concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;
      this.inFlight.add(task.id);
      this.executeTask(task, settings);
    }

    this.isProcessing = this.inFlight.size > 0 || this.queue.length > 0;
    this.emitStatus();
  }

  async executeTask(task: QueueTask, settings: any): Promise<void> {
    task.status = 'PROCESSING';
    this.emitStatus();

    try {
      const extractedRecord = await extractor.extractDocumentData(task.filePath, settings);
      extractedRecord.originalName = task.originalName;
      if (task.fileHash) {
        extractedRecord.fileHash = task.fileHash;
      }
      if (task.imageUrl) {
        extractedRecord.imageUrl = task.imageUrl;
      }

      // Save to persistent storage (auto-merges in-place with debounced I/O)
      const saved = await db.saveRecord(extractedRecord);

      task.status = 'COMPLETED';
      task.record = saved;
      this.stats.completed++;
      this.emit('task:completed', { task, record: saved });
    } catch (err: any) {
      console.error(`Error processing task ${task.id} (${task.originalName}):`, err.message);

      // If Rate Limit (429), 503, high demand, or temporary overload, automatically re-enqueue
      const errMsg = err.message || '';
      const isRetryable = errMsg.includes('429') || errMsg.includes('503') || errMsg.includes('500') ||
                          errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED') ||
                          errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE');

      if (isRetryable) {
        task.retryCount = (task.retryCount || 0) + 1;
        if (task.retryCount <= 4) {
          const waitTime = Math.min(8000, 2000 * task.retryCount);
          this.rateLimitCooldownUntil = Math.max(this.rateLimitCooldownUntil, Date.now() + waitTime);
          console.warn(`[Queue Auto-Retry] ${task.originalName} encountered ${errMsg.slice(0, 50)}. Re-enqueuing (Retry ${task.retryCount}/4, cooling down ${waitTime}ms)...`);
          this.queue.unshift(task); // Put back to front of queue
          this.inFlight.delete(task.id);
          this.processNext();
          return;
        }
      }

      task.status = 'FAILED';
      task.error = err.message;
      this.stats.failed++;
      this.emit('task:failed', { task, error: err.message });
    } finally {
      this.inFlight.delete(task.id);
      if (this.queue.length === 0 && this.inFlight.size === 0) {
        db.flushRecordsSync();
      }
      this.processNext();
    }
  }

  pause(): void {
    this.isPaused = true;
    this.emitStatus();
  }

  resume(): void {
    this.isPaused = false;
    this.emitStatus();
    this.processNext();
  }

  cancelAll(): void {
    this.queue = [];
    this.isProcessing = this.inFlight.size > 0;
    this.emitStatus();
  }

  getStatus(): QueueStatus {
    const totalDone = this.stats.completed + this.stats.failed;
    const progress = this.stats.total > 0 ? Math.round((totalDone / this.stats.total) * 100) : 0;
    return {
      isProcessing: this.inFlight.size > 0 || this.queue.length > 0,
      isPaused: this.isPaused,
      pendingCount: this.queue.length,
      inFlightCount: this.inFlight.size,
      completedCount: this.stats.completed,
      failedCount: this.stats.failed,
      totalCount: this.stats.total,
      progressPercent: progress
    };
  }

  emitStatus(): void {
    this.emit('status', this.getStatus());
  }

  resetStats(): void {
    this.stats = { total: 0, completed: 0, failed: 0 };
    this.emitStatus();
  }
}

const globalQueue = (globalThis as any).__lrsys_queue || new ProcessingQueue();
if (process.env.NODE_ENV !== 'production') {
  (globalThis as any).__lrsys_queue = globalQueue;
}

export default globalQueue as ProcessingQueue;
