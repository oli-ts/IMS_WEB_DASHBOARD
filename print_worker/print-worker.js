#!/usr/bin/env node
/* print-worker.js
 * Local bridge that drains Supabase label_print_jobs and prints to a LAN printer.
 *
 * Transports:
 *  - RAW 9100 (socket): set PRINTER_KIND=raw9100 and PRINTER_HOST=... PRINTER_PORT=9100
 *  - Zebra HTTP pstprnt: set PRINTER_KIND=zebra_http and PRINTER_HOST=... (no port needed)
 *
 * Env:
 *  SUPABASE_URL=...
 *  SUPABASE_SERVICE_ROLE_KEY=...
 *  PRINTER_KIND=raw9100 | zebra_http
 *  PRINTER_HOST=192.168.1.50
 *  PRINTER_PORT=9100                # only for raw9100
 *  POLL_INTERVAL_MS=2000
 *  BATCH_SIZE=5
 *  MAX_ATTEMPTS=5
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import http from 'http';
import https from 'https';
import net from 'net';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PRINTER_KIND = 'raw9100',
  PRINTER_HOST,
  PRINTER_PORT = '9100',
  POLL_INTERVAL_MS = '2000',
  BATCH_SIZE = '5',
  MAX_ATTEMPTS = '5',
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!PRINTER_HOST) {
  console.error('Missing PRINTER_HOST (printer IP or hostname).');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const WORKER_ID = `worker-${Math.random().toString(36).slice(2, 8)}`;
const POLL_MS = Number(POLL_INTERVAL_MS) || 2000;
const LIMIT = Number(BATCH_SIZE) || 5;
const MAX_TRIES = Number(MAX_ATTEMPTS) || 5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function nowISO() { return new Date().toISOString(); }

async function fetchQueuedJobs(limit = 5) {
  // Claim jobs optimistically: update status to processing if still queued
  // Using supabase-js: we do an update with eq(status,'queued') + order + limit via RPC? Not supported directly.
  // Simpler approach (single worker is fine): select then try to update each with a guard on status.
  const { data: jobs, error } = await sb
    .from('label_print_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const claimed = [];
  for (const j of jobs || []) {
    const { data, error: upErr } = await sb
      .from('label_print_jobs')
      .update({
        status: 'processing',
        started_at: nowISO(),
        assigned_worker: WORKER_ID,
        attempts: (j.attempts || 0) + 1,
      })
      .eq('id', j.id)
      .eq('status', 'queued')
      .select('*')
      .single();

    if (!upErr && data) claimed.push(data);
  }
  return claimed;
}

async function markSent(id) {
  await sb.from('label_print_jobs')
    .update({ status: 'sent', sent_at: nowISO(), error: null })
    .eq('id', id);
}

async function markFailed(id, errMsg) {
  await sb.from('label_print_jobs')
    .update({ status: 'failed', error: errMsg?.slice(0, 1000) || 'failed' })
    .eq('id', id);
}

function printRaw9100({ host, port, zpl }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(8000);
    socket.connect(Number(port), host, () => {
      socket.write(zpl, 'utf8', () => socket.end());
    });
    socket.on('close', () => resolve());
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Raw9100 timeout')); });
    socket.on('error', (e) => reject(e));
  });
}

function printZebraHttp({ host, zpl }) {
  // Zebra’s Link-OS accepts POST to /pstprnt with raw ZPL body (text/plain or application/x-www-form-urlencoded)
  return new Promise((resolve, reject) => {
    const body = zpl; // raw ZPL
    const isHttps = host.startsWith('https://');
    const hostname = host.replace(/^https?:\/\//, '');
    const options = {
      hostname,
      port: isHttps ? 443 : 80,
      path: '/pstprnt',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded', // works for most Link-OS builds
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 8000,
    };
    const req = (isHttps ? https : http).request(options, (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        let data = '';
        res.on('data', (c) => (data += c.toString?.() || ''));
        res.on('end', () => reject(new Error(`pstprnt ${res.statusCode}: ${data}`)));
      }
    });
    req.on('timeout', () => { req.destroy(new Error('pstprnt timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function printJob(job) {
  const zpl = job.zpl;
  if (!zpl || !zpl.trim()) throw new Error('Empty ZPL');

  if (PRINTER_KIND === 'raw9100') {
    await printRaw9100({ host: PRINTER_HOST, port: PRINTER_PORT, zpl });
  } else if (PRINTER_KIND === 'zebra_http') {
    const hostUrl = PRINTER_HOST.startsWith('http') ? PRINTER_HOST : `http://${PRINTER_HOST}`;
    await printZebraHttp({ host: hostUrl, zpl });
  } else {
    throw new Error(`Unsupported PRINTER_KIND=${PRINTER_KIND}`);
  }
}

function backoffMs(attempts) {
  // 1s, 2s, 4s, 8s, 12s (cap)
  return Math.min(12000, Math.pow(2, Math.max(0, attempts - 1)) * 1000);
}

async function loop() {
  console.log(`[worker ${WORKER_ID}] starting; printer=${PRINTER_KIND}@${PRINTER_HOST}${PRINTER_KIND==='raw9100'?':'+PRINTER_PORT:''}`);
  while (true) {
    try {
      const jobs = await fetchQueuedJobs(LIMIT);
      if (!jobs.length) {
        await sleep(POLL_MS);
        continue;
      }

      for (const job of jobs) {
        try {
          // Respect retry/backoff (if attempts > 1)
          const wait = backoffMs(job.attempts || 1);
          if ((job.attempts || 1) > 1) {
            console.log(`[job ${job.id}] retry #${job.attempts}, backoff ${wait}ms`);
            await sleep(wait);
          }

          await printJob(job);
          await markSent(job.id);
          console.log(`[job ${job.id}] sent`);
        } catch (e) {
          console.error(`[job ${job.id}] failed:`, e?.message || e);
          if ((job.attempts || 1) >= MAX_TRIES) {
            await markFailed(job.id, e?.message || 'failed');
            console.error(`[job ${job.id}] permanently failed after ${job.attempts} tries`);
          } else {
            // Put it back to queued for retry
            await sb.from('label_print_jobs')
              .update({ status: 'queued', error: e?.message?.slice(0, 1000) || 'retry' })
              .eq('id', job.id);
          }
        }
      }
    } catch (e) {
      console.error('[loop] fatal:', e?.message || e);
      await sleep(POLL_MS);
    }
  }
}

loop().catch(err => {
  console.error('worker crashed:', err);
  process.exit(1);
});
