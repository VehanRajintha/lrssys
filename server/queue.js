const EventEmitter = require('events');
const path = require('path');
const db = require('./db');
const extractor = require('./extractor');

class ProcessingQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.inFlight = new Set();
    this.isProcessing = false;
    this.isPaused = false;
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0
    };
  }

  enqueue(imageFiles) {
    const filesArray = Array.isArray(imageFiles) ? imageFiles : [imageFiles];
    for (const file of filesArray) {
      this.queue.push({
        id: 'TASK_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        filePath: file.filePath,
        originalName: file.originalName || path.basename(file.filePath),
        fileHash: file.fileHash || null,
        status: 'PENDING',
        error: null,
        addedAt: new Date().toISOString()
      });
      this.stats.total++;
    }
    this.emitStatus();
    this.processNext();
  }

  processNext() {
    if (this.isPaused) return;

    const settings = db.getSettings();
    const concurrency = Math.max(1, Math.min(10, settings.workerConcurrency || 3));

    while (this.inFlight.size < concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      this.inFlight.add(task.id);
      this.executeTask(task, settings);
    }

    this.isProcessing = this.inFlight.size > 0 || this.queue.length > 0;
    this.emitStatus();
  }

  async executeTask(task, settings) {
    task.status = 'PROCESSING';
    this.emitStatus();

    try {
      const extractedRecord = await extractor.extractDocumentData(task.filePath, settings);
      extractedRecord.originalName = task.originalName;
      if (task.fileHash) {
        extractedRecord.fileHash = task.fileHash;
      }
      
      // Save directly to persistent storage (auto-merges duplicates in-place)
      const saved = db.saveRecord(extractedRecord);

      task.status = 'COMPLETED';
      task.record = saved;
      this.stats.completed++;
      this.emit('task:completed', { task, record: saved });
    } catch (err) {
      console.error(`Error processing task ${task.id} (${task.originalName}):`, err.message);
      task.status = 'FAILED';
      task.error = err.message;
      this.stats.failed++;
      this.emit('task:failed', { task, error: err.message });
    } finally {
      this.inFlight.delete(task.id);
      this.processNext();
    }
  }

  pause() {
    this.isPaused = true;
    this.emitStatus();
  }

  resume() {
    this.isPaused = false;
    this.emitStatus();
    this.processNext();
  }

  cancelAll() {
    this.queue = [];
    this.isProcessing = this.inFlight.size > 0;
    this.emitStatus();
  }

  getStatus() {
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

  emitStatus() {
    this.emit('status', this.getStatus());
  }

  resetStats() {
    this.stats = { total: 0, completed: 0, failed: 0 };
    this.emitStatus();
  }
}

const queueInstance = new ProcessingQueue();
module.exports = queueInstance;

