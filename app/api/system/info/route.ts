import { NextResponse } from 'next/server';
import os from 'os';
import * as db from '@/lib/db';

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

  return NextResponse.json({
    serverTime: new Date().toISOString(),
    port: PORT,
    lanAddresses,
    primaryLanUrl,
    storageCount: db.getRecords().length,
    stats: db.getStats()
  });
}
