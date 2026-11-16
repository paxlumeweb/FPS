// 'peerjs' backend: WebRTC data channels. A PeerJS broker is only used to find the host and
// exchange connection offers; game traffic then flows directly between browsers (peer-to-peer).
// Two channels per player: 'r' (ordered, reliable) for events and 'u' (unordered) for inputs and
// snapshots, so one late packet never stalls fresh state behind it.
//
// PeerJS is loaded as a classic script (vendor/peerjs.min.js) and exposes window.Peer.

const ID_PREFIX = 'breachline-v1-';

function peerOptions(cfg) {
  const o = { debug: 0 }; // errors are handled and shown in the UI; keep the console quiet
  if (cfg && cfg.host) { o.host = cfg.host; o.port = cfg.port || 443; o.path = cfg.path || '/'; o.secure = cfg.secure !== false; }
  if (cfg && cfg.iceServers) o.config = { iceServers: cfg.iceServers };
  return o;
}

function explain(err) {
  const t = err && err.type;
  if (t === 'unavailable-id') return 'That room code is already in use. Try again.';
  if (t === 'peer-unavailable') return 'Room not found. Check the code, and that the host is still in the lobby.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Could not reach the matchmaking (PeerJS) server. Check your connection.';
  if (t === 'browser-incompatible') return 'This browser does not support WebRTC data channels.';
  return (err && err.message) || 'Connection error.';
}

export class PeerHostTransport {
  constructor(cfg) { this.cfg = cfg; this.onPeer = null; this.onPeerLeft = null; this.onMessage = null; this.peers = new Map(); }

  start(code) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) { reject(new Error('PeerJS failed to load.')); return; }
      let opened = false;
      const peer = this.peer = new window.Peer(ID_PREFIX + code, peerOptions(this.cfg));
      peer.on('open', () => { opened = true; resolve(); });
      peer.on('error', (err) => { if (!opened) { reject(new Error(explain(err))); peer.destroy(); } else console.warn('[peerjs host]', err.type, err.message); });
      // If the broker connection drops mid-game, existing players stay connected; reconnect so new ones can join.
      peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { if (!peer.destroyed && peer.disconnected) peer.reconnect(); }, 2000); });
      peer.on('connection', (conn) => this._onConn(conn));
    });
  }

  _onConn(conn) {
    const id = conn.peer;
    let p = this.peers.get(id);
    if (!p) { p = { r: null, u: null, open: false }; this.peers.set(id, p); }
    const rel = conn.label !== 'u';
    if (rel) p.r = conn; else p.u = conn;
    conn.on('open', () => { if (rel && !p.open) { p.open = true; if (this.onPeer) this.onPeer(id); } });
    conn.on('data', (d) => { if (!this.onMessage || this.peers.get(id) !== p) return; let m; try { m = JSON.parse(d); } catch (e) { return; } this.onMessage(id, m); });
    const gone = () => { if (rel && this.peers.get(id) === p) { this.peers.delete(id); if (p.u) p.u.close(); if (p.open && this.onPeerLeft) this.onPeerLeft(id); } };
    conn.on('close', gone); conn.on('error', gone);
  }

  send(peerId, obj, reliable = true) {
    const p = this.peers.get(peerId);
    if (!p || !p.r || !p.r.open) return;
    const c = !reliable && p.u && p.u.open ? p.u : p.r;
    try { c.send(JSON.stringify(obj)); } catch (e) { /* channel closing */ }
  }
  kick(peerId) { const p = this.peers.get(peerId); if (p) { this.peers.delete(peerId); setTimeout(() => { if (p.r) p.r.close(); if (p.u) p.u.close(); }, 300); } }
  close() { if (this.peer) { this.peer.destroy(); this.peer = null; } this.peers.clear(); }
}

export class PeerClientTransport {
  constructor(cfg) { this.cfg = cfg; this.onMessage = null; this.onClose = null; }

  connect(code) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) { reject(new Error('PeerJS failed to load.')); return; }
      let done = false;
      const fail = (msg) => { if (done) return; done = true; clearTimeout(timer); this.close(); reject(new Error(msg)); };
      const timer = setTimeout(() => fail('Timed out connecting to the host. One of you may be behind a strict firewall/NAT.'), 20000);
      const peer = this.peer = new window.Peer(undefined, peerOptions(this.cfg));
      peer.on('error', (err) => { if (!done) fail(explain(err)); else console.warn('[peerjs client]', err.type, err.message); });
      peer.on('open', () => {
        const hostId = ID_PREFIX + code;
        const r = this.r = peer.connect(hostId, { label: 'r', reliable: true, serialization: 'raw' });
        const u = this.u = peer.connect(hostId, { label: 'u', reliable: false, serialization: 'raw' });
        const onData = (d) => { if (!this.onMessage) return; let m; try { m = JSON.parse(d); } catch (e) { return; } this.onMessage(m); };
        r.on('data', onData); u.on('data', onData);
        r.on('open', () => { if (done) return; done = true; clearTimeout(timer); resolve(); });
        const closed = () => { if (!done) fail('Connection to the host failed.'); else if (this.peer) { this.close(); if (this.onClose) this.onClose('Lost connection to the host.'); } };
        r.on('close', closed); r.on('error', closed);
      });
    });
  }

  send(obj, reliable = true) {
    if (!this.r || !this.r.open) return;
    const c = !reliable && this.u && this.u.open ? this.u : this.r;
    try { c.send(JSON.stringify(obj)); } catch (e) { /* channel closing */ }
  }
  close() { const p = this.peer; this.peer = null; if (p) p.destroy(); }
}
