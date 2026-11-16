// 'local' backend: BroadcastChannel between tabs/windows of the same browser on the same origin.
// No network needed, which makes it handy for testing two "players" on one machine.

const chanName = (code) => 'breachline-room-' + code;
const HEARTBEAT = 1000, TIMEOUT = 8000;

export class LocalHostTransport {
  constructor() { this.onPeer = null; this.onPeerLeft = null; this.onMessage = null; this.peers = new Map(); }

  async start(code) {
    // refuse a code that already has a host in this browser
    const probe = new BroadcastChannel(chanName(code));
    const taken = await new Promise((res) => {
      const id = Math.random().toString(36).slice(2);
      probe.onmessage = (e) => { if (e.data && e.data.k === 'here' && e.data.to === id) res(true); };
      probe.postMessage({ k: 'probe', from: id });
      setTimeout(() => res(false), 250);
    });
    probe.close();
    if (taken) throw new Error('That room code is already in use.');
    this.ch = new BroadcastChannel(chanName(code));
    this.ch.onmessage = (e) => this._recv(e.data);
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const [id, p] of this.peers) if (now - p.last > TIMEOUT) this._drop(id);
    }, 2000);
    this._unload = () => this.close();
    addEventListener('pagehide', this._unload);
  }

  _recv(m) {
    if (!m) return;
    if (m.k === 'probe') { this.ch.postMessage({ k: 'here', to: m.from }); return; }
    if (m.to !== 'host') return;
    if (m.k === 'join') {
      if (!this.peers.has(m.from)) { this.peers.set(m.from, { last: Date.now() }); this.ch.postMessage({ k: 'accept', to: m.from }); if (this.onPeer) this.onPeer(m.from); }
      return;
    }
    const p = this.peers.get(m.from);
    if (!p) return;
    p.last = Date.now();
    if (m.k === 'bye') this._drop(m.from);
    else if (m.k === 'd' && this.onMessage) this.onMessage(m.from, JSON.parse(m.d));
  }

  _drop(id) { if (this.peers.delete(id) && this.onPeerLeft) this.onPeerLeft(id); }
  send(peerId, obj) { if (this.ch && this.peers.has(peerId)) this.ch.postMessage({ k: 'd', to: peerId, d: JSON.stringify(obj) }); }
  kick(peerId) { if (this.ch) this.ch.postMessage({ k: 'closed', to: peerId }); this.peers.delete(peerId); }
  close() {
    if (!this.ch) return;
    for (const id of this.peers.keys()) this.ch.postMessage({ k: 'closed', to: id });
    clearInterval(this.timer); removeEventListener('pagehide', this._unload);
    this.ch.close(); this.ch = null; this.peers.clear();
  }
}

export class LocalClientTransport {
  constructor() { this.onMessage = null; this.onClose = null; this.id = 'L' + Math.random().toString(36).slice(2, 10); }

  connect(code) {
    return new Promise((resolve, reject) => {
      this.ch = new BroadcastChannel(chanName(code));
      let open = false;
      const timeout = setTimeout(() => { if (!open) { this.ch.close(); this.ch = null; reject(new Error('Room not found. (Local mode only connects tabs of the same browser.)')); } }, 1500);
      this.ch.onmessage = (e) => {
        const m = e.data;
        if (!m || m.to !== this.id) return;
        if (m.k === 'accept') {
          open = true; clearTimeout(timeout);
          this.hb = setInterval(() => this.ch && this.ch.postMessage({ k: 'hb', to: 'host', from: this.id }), HEARTBEAT);
          this._unload = () => this.close();
          addEventListener('pagehide', this._unload);
          resolve();
        } else if (m.k === 'd') { if (this.onMessage) this.onMessage(JSON.parse(m.d)); }
        else if (m.k === 'closed') { this._shutdown(); if (this.onClose) this.onClose('Host closed the room.'); }
      };
      this.ch.postMessage({ k: 'join', to: 'host', from: this.id });
    });
  }

  send(obj) { if (this.ch) this.ch.postMessage({ k: 'd', to: 'host', from: this.id, d: JSON.stringify(obj) }); }
  _shutdown() { clearInterval(this.hb); removeEventListener('pagehide', this._unload); if (this.ch) { this.ch.close(); this.ch = null; } }
  close() { if (this.ch) { this.ch.postMessage({ k: 'bye', to: 'host', from: this.id }); this._shutdown(); } }
}
