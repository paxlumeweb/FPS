// Transport abstraction.
//
// The game never talks to PeerJS / WebSocket / BroadcastChannel directly. It only uses these two
// tiny interfaces, so the backend can be swapped (see README: "Moving to Cloudflare"):
//
//   HostTransport                                   ClientTransport
//     await start(roomCode)                           await connect(roomCode)
//     send(peerId, obj, reliable = true)              send(obj, reliable = true)
//     close()                                         close()
//     onPeer(peerId)        (assign a callback)       onMessage(obj)
//     onPeerLeft(peerId)                              onClose(reason)
//     onMessage(peerId, obj)
//
// `reliable = false` marks high-rate state (inputs, snapshots) that may be dropped or arrive out
// of order; backends that only have one ordered channel may ignore the flag.
//
// Backends:
//   'peerjs'     WebRTC data channels, brokered by a PeerJS server (default; works on any static host)
//   'cloudflare' WebSocket relay through a Cloudflare Worker + Durable Object (server/cloudflare)
//   'local'      BroadcastChannel between tabs of one browser (offline testing)

import { CONFIG } from '../config.js';
import { LocalHostTransport, LocalClientTransport } from './transports/local.js';
import { PeerHostTransport, PeerClientTransport } from './transports/peerjs.js';
import { WsHostTransport, WsClientTransport } from './transports/websocket.js';

export function createHostTransport(kind = CONFIG.net.backend) {
  if (kind === 'local') return new LocalHostTransport();
  if (kind === 'cloudflare') return new WsHostTransport(CONFIG.net.cloudflare);
  return new PeerHostTransport(CONFIG.net.peerjs);
}

export function createClientTransport(kind = CONFIG.net.backend) {
  let t;
  if (kind === 'local') t = new LocalClientTransport();
  else if (kind === 'cloudflare') t = new WsClientTransport(CONFIG.net.cloudflare);
  else t = new PeerClientTransport(CONFIG.net.peerjs);
  const sim = CONFIG.net.simulate;
  return sim && (sim.lag > 0 || sim.loss > 0) ? new LagTransport(t, sim) : t;
}

/**
 * In-memory pair used for the host's own player: the host runs the server simulation AND a normal
 * client, connected through this zero-latency link. That keeps a single code path for everybody.
 */
export function createLoopback(peerId = 'local') {
  const client = {
    onMessage: null, onClose: null, closed: false,
    async connect() {},
    send(obj) { const s = JSON.stringify(obj); queueMicrotask(() => { if (!client.closed && host.onMessage) host.onMessage(peerId, JSON.parse(s)); }); },
    close() { if (client.closed) return; client.closed = true; queueMicrotask(() => host.onLeft && host.onLeft(peerId)); },
  };
  const host = {
    peerId, onMessage: null, onLeft: null,
    send(obj) { const s = JSON.stringify(obj); queueMicrotask(() => { if (!client.closed && client.onMessage) client.onMessage(JSON.parse(s)); }); },
    close(reason) { if (client.closed) return; client.closed = true; if (client.onClose) client.onClose(reason || 'closed'); },
  };
  return { client, host };
}

const UNRELIABLE_TYPES = { s: 1, f: 1, m: 1, nb: 1, c: 1 };

/** Wraps a client transport with artificial latency / jitter / loss (?lag=100&jitter=20&loss=2). */
export class LagTransport {
  constructor(inner, { lag = 0, jitter = 0, loss = 0 }) {
    this.inner = inner; this.half = lag / 2; this.jitter = jitter; this.loss = loss / 100;
    this.onMessage = null; this.onClose = null;
    this._inQ = Promise.resolve();
  }
  _delay(unreliable) { return this.half + (unreliable ? Math.random() * this.jitter : 0); }
  async connect(code) {
    this.inner.onClose = (r) => this.onClose && this.onClose(r);
    let lastRel = 0;
    this.inner.onMessage = (m) => {
      const unrel = !!UNRELIABLE_TYPES[m.t];
      if (unrel && Math.random() < this.loss) return;
      let at = performance.now() + this._delay(unrel);
      if (!unrel) { at = Math.max(at, lastRel); lastRel = at; } // reliable messages keep their order
      setTimeout(() => this.onMessage && this.onMessage(m), Math.max(0, at - performance.now()));
    };
    return this.inner.connect(code);
  }
  send(obj, reliable = true) {
    if (!reliable && Math.random() < this.loss) return;
    const s = JSON.stringify(obj);
    if (reliable) {
      const at = Math.max(performance.now() + this.half, this._lastOut || 0); this._lastOut = at;
      setTimeout(() => this.inner.send(JSON.parse(s), true), Math.max(0, at - performance.now()));
    } else setTimeout(() => this.inner.send(JSON.parse(s), false), this._delay(true));
  }
  close() { this.inner.close(); }
}
