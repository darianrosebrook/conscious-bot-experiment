#!/usr/bin/env node
/**
 * ws-report-episode-diag.js
 *
 * Minimal diagnostic script to determine whether Sterling's report_episode
 * handler responds at all, and what envelope shape the response uses.
 *
 * Usage:
 *   node scripts/ws-report-episode-diag.js [ws://host:port]
 *
 * Default endpoint: ws://localhost:8766
 *
 * Interpretation:
 *   - If you get ANY response: server wiring works; check the envelope shape
 *     to see if the CB client resolver expects the same shape.
 *   - If you get nothing (timeout): either the handler isn't wired, the
 *     message is silently dropped, or dispatch doesn't route the command.
 */

const WebSocket = require('ws');

const endpoint = process.argv[2] || 'ws://localhost:8766';
const TIMEOUT_MS = 10_000;

function send(ws, obj) {
  const s = JSON.stringify(obj);
  console.log('\n>> SENT:', s);
  ws.send(s);
}

let gotResponse = false;

const ws = new WebSocket(endpoint);

const timer = setTimeout(() => {
  if (!gotResponse) {
    console.log('\n!! TIMEOUT: No response received within', TIMEOUT_MS, 'ms');
    console.log('   Likely cause: handler not wired, message silently dropped, or dispatch mismatch');
    ws.close();
    process.exit(1);
  }
}, TIMEOUT_MS);

ws.on('open', () => {
  console.log('Connected to', endpoint);

  // Send a bare report_episode — no prior solve needed.
  // This isolates the report_episode handler from solve flow.
  send(ws, {
    command: 'report_episode',
    requestId: 'ep-diag-1',
    domain: 'minecraft',
    // Minimal payload — enough for handler to accept or reject
    planId: 'diag-plan-' + Date.now(),
    outcome: {
      goal: 'wooden_pickaxe',
      success: true,
      stepsCompleted: 3,
    },
    // Identity linkage fields (snake_case wire format)
    bundle_hash: 'deadbeef01234567',
    trace_bundle_hash: 'cafebabe01234567',
    outcome_class: 'EXECUTION_SUCCESS',
  });
});

ws.on('message', (buf) => {
  gotResponse = true;
  const text = buf.toString('utf8');
  console.log('\n<< RECEIVED:', text);
  try {
    const msg = JSON.parse(text);
    console.log('   Parsed type/command:', msg.type || msg.command || '(none)');
    console.log('   Has requestId:', 'requestId' in msg);
    console.log('   Has episode_hash:', !!(msg.episode_hash || msg.metrics?.episode_hash));
    console.log('   Full keys:', Object.keys(msg).join(', '));
  } catch {
    console.log('   (not valid JSON)');
  }

  // Keep connection open briefly to catch any follow-up messages
  setTimeout(() => {
    clearTimeout(timer);
    console.log('\nDiagnostic complete — closing connection');
    ws.close();
  }, 2000);
});

ws.on('close', (code, reason) => {
  clearTimeout(timer);
  console.log('\nConnection closed:', code, reason?.toString?.() || '(no reason)');
  if (!gotResponse) {
    console.log('No response was received before close.');
  }
});

ws.on('error', (err) => {
  clearTimeout(timer);
  console.error('\nWS error:', err.message || err);
  process.exit(1);
});
