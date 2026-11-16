// 'cloudflare' backend: WebSocket relay through the Worker + Durable Object in server/cloudflare.
// One Durable Object per room. The host browser is still the game authority; the Durable Object
// only relays, which removes the NAT/firewall problems WebRTC can have.
//
// Wire format (text frames):
//   client -> relay:  <json>                relay -> host:   "<peerId>|<json>"
//   host   -> relay:  "<peerId>|<json>"     relay -> client: <json>
//                     (the host batches everything it sends in one tick into a single frame,
//                      entries separated by \x1e, to keep the relay's request count low)
//   relay  -> host:   "+<peerId>" (joined)  "-<peerId>" (left)

function roomUrl(cfg, code, role) {
  const base = (cfg && cfg.url ? cfg.url : '').replace(/\/+$/, '');
  if (!base) throw new Error('Cloudflare backend selected but CONFIG.net.cloudflare.url is empty (see README).');
  return `${base}/room/${encodeURIComponent(code)}?role=${role}`;
}

const closeReason = (e) => {
  if (e.code === 4004) return 'Room not found. Check the code, and that the host is still in the lobby.';
  if (e.code === 4009) return 'That room code is already in use. Try again.';
  if (e.code === 4001) return 'Host closed the room.';
  if (e.code === 4003) return 'Removed from the room.';
  return 'Lost connection to the server.';
};

export class WsHostTransport {
  constructor(cfg) { this.cfg = cfg; this.onPeer = null; this.onPeerLeft = null; this.onMessage = null; }

  start(code) {
    return new Promise((resolve, reject) => {
      let open = false;
      const ws = this.ws = new WebSocket(roomUrl(this.cfg, code, 'host'));
      ws.onopen = () => { open = true; resolve(); };
      ws.onclose = (e) => { if (!open) reject(new Error(closeReason(e))); else console.warn('[ws host] relay connection closed', e.code); };
      ws.onerror = () => { if (!open) reject(new Error('Could not reach the relay server.')); };
      ws.onmessage = (e) => {
        const d = e.data, c = d[0];
        if (c === '+') { if (this.onPeer) this.onPeer(d.slice(1)); return; }
        if (c === '-') { if (this.onPeerLeft) this.onPeerLeft(d.slice(1)); return; }
        const i = d.indexOf('|');
        if (i < 0 || !this.onMessage) return;
        let m; try { m = JSON.parse(d.slice(i + 1)); } catch (err) { return; }
        this.onMessage(d.slice(0, i), m);
      };
      this._ka = setInterval(() => { if (ws.readyState === 1) ws.send('~'); }, 20000);
    });
  }
  send(peerId, obj) {
    if (!this.ws || this.ws.readyState !== 1) return;
    if (!this._q) { this._q = []; queueMicrotask(() => { const q = this._q; this._q = null; if (this.ws && this.ws.readyState === 1) this.ws.send(q.join('\x1e')); }); }
    this._q.push(peerId + '|' + JSON.stringify(obj));
  }
  kick(peerId) { if (this.ws && this.ws.readyState === 1) setTimeout(() => { if (this.ws && this.ws.readyState === 1) this.ws.send('!' + peerId); }, 300); }
  close() { clearInterval(this._ka); if (this.ws) { this.ws.onclose = null; this.ws.close(1000); this.ws = null; } }
}

export class WsClientTransport {
  constructor(cfg) { this.cfg = cfg; this.onMessage = null; this.onClose = null; }

  connect(code) {
    return new Promise((resolve, reject) => {
      let open = false;
      const ws = this.ws = new WebSocket(roomUrl(this.cfg, code, 'client'));
      // the relay sends "=" once the room's host is confirmed present
      ws.onmessage = (e) => {
        if (e.data === '=') { open = true; resolve(); return; }
        if (!this.onMessage) return;
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        this.onMessage(m);
      };
      ws.onclose = (e) => { this.ws = null; clearInterval(this._ka); if (!open) reject(new Error(closeReason(e))); else if (this.onClose) this.onClose(closeReason(e)); };
      ws.onerror = () => { if (!open) reject(new Error('Could not reach the relay server.')); };
      this._ka = setInterval(() => { if (ws.readyState === 1) ws.send('~'); }, 20000);
    });
  }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  close() { clearInterval(this._ka); if (this.ws) { this.ws.onclose = null; this.ws.close(1000); this.ws = null; } }
}
