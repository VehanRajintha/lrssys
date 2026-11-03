import { NextResponse } from 'next/server';
import os from 'os';
import * as db from '@/lib/db';
import { getHostDiskStats } from '@/lib/storage';

export const dynamic = 'force-dynamic';

let lastCpuTimes: { idle: number; total: number } | null = null;
let lastCpuMeasureTime = 0;
let cachedCpuPercent = 0;

function getCpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += (cpu.times as any)[type];
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

function calculateCpuPercent(): number {
  const now = Date.now();
  const current = getCpuTimes();

  if (lastCpuTimes && (now - lastCpuMeasureTime >= 400)) {
    const idleDiff = current.idle - lastCpuTimes.idle;
    const totalDiff = current.total - lastCpuTimes.total;
    if (totalDiff > 0) {
      cachedCpuPercent = Math.min(100, Math.max(0, Math.round(100 * (1 - idleDiff / totalDiff))));
    }
    lastCpuTimes = current;
    lastCpuMeasureTime = now;
  } else if (!lastCpuTimes) {
    lastCpuTimes = current;
    lastCpuMeasureTime = now;
    // On Linux VPS, loadavg[0] provides immediate load
    const load = os.loadavg()[0];
    const cores = os.cpus().length || 1;
    if (load > 0) {
      cachedCpuPercent = Math.min(100, Math.round((load / cores) * 100));
    }
  }

  return cachedCpuPercent;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0.00 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getLanIpAddresses(): Array<{ interface: string; address: string }> {
  const interfaces = os.networkInterfaces();
  const addresses: Array<{ interface: string; address: string }> = [];
  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (list) {
      for (const iface of list) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push({ interface: name, address: iface.address });
        }
      }
    }
  }
  return addresses;
}

export async function GET() {
  const PORT = process.env.PORT || 5000;
  const lanAddresses = getLanIpAddresses();
  const primaryLanUrl = lanAddresses.length > 0 ? `http://${lanAddresses[0].address}:${PORT}` : `http://localhost:${PORT}`;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramPercent = Math.min(100, Math.max(0, Math.round((usedMem / totalMem) * 100)));

  const memUsage = process.memoryUsage();
  const cpuPercent = calculateCpuPercent();

  const systemUptimeSeconds = os.uptime();
  const processUptimeSeconds = process.uptime();

  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || 'VPS Virtual CPU';
  const cpuCores = cpus.length;
  const disk = getHostDiskStats();

  return NextResponse.json({
    // Live Hardware Meters
    cpu: {
      percent: cpuPercent,
      cores: cpuCores,
      model: cpuModel,
      loadAvg: os.loadavg().map(l => parseFloat(l.toFixed(2)))
    },
    ram: {
      totalBytes: totalMem,
      usedBytes: usedMem,
      freeBytes: freeMem,
      totalFormatted: formatBytes(totalMem),
      usedFormatted: formatBytes(usedMem),
      freeFormatted: formatBytes(freeMem),
      percent: ramPercent
    },
    disk: {
      totalBytes: disk.totalBytes,
      freeBytes: disk.freeBytes,
      usedBytes: disk.usedBytes,
      totalFormatted: formatBytes(disk.totalBytes),
      freeFormatted: formatBytes(disk.freeBytes),
      usedFormatted: formatBytes(disk.usedBytes),
      percent: disk.percentUsed
    },
    process: {
      rss: formatBytes(memUsage.rss),
      heapUsed: formatBytes(memUsage.heapUsed),
      heapTotal: formatBytes(memUsage.heapTotal),
      uptimeSeconds: Math.floor(processUptimeSeconds),
      uptimeFormatted: formatDuration(processUptimeSeconds)
    },
    system: {
      platform: os.platform(),
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptimeSeconds: Math.floor(systemUptimeSeconds),
      uptimeFormatted: formatDuration(systemUptimeSeconds),
      nodeVersion: process.version
    },
    serverTime: new Date().toISOString(),
    port: PORT,
    lanAddresses,
    primaryLanUrl,
    storageCount: db.getRecords().length,
    stats: db.getStats()
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}
