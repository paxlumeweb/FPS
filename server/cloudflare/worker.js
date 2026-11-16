// Breachline relay: Cloudflare Worker + Durable Object.
//
// One Durable Object ("Room") per room code. The hosting player's browser stays the game
// authority; this only relays WebSocket messages between the host and the other players, so it
// works through NATs/firewalls where direct WebRTC cannot connect.
//
// Wire format (text frames) — must match src/net/transports/websocket.js:
//   client -> relay:  <json>                         relay -> host:   "<peerId>|<json>"
//   host   -> relay:  "<peerId>|<json>" (several may be joined with \x1e in one frame)
//   relay  -> client: <json>    "=" once the room is confirmed
//   relay  -> host:   "+<peerId>" joined, "-<peerId>" left
//   host   -> relay:  "!<peerId>" kick          anyone -> relay: "~" keep-alive
// Close codes: 4001 host left, 4003 kicked, 4004 room not found, 4008 room full, 4009 code in use.

const MAX_CLIENTS = 15;
const MAX_CLIENT_MESSAGE = 8192;
const SEP = '\x1e';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{3,12})$/);
    if (!m) return new Response('Breachline relay is running.\n', { headers: { 'content-type': 'text/plain', 'access-control-allow-origin': '*' } });
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('Expected a WebSocket upgrade.\n', { status: 426 });
    // Optional: only accept connections from your own site. Set ALLOWED_ORIGIN in wrangler.toml.
    if (env.ALLOWED_ORIGIN && request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return new Response('Origin not allowed.\n', { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(m[1].toUpperCase())).fetch(request);
  },
};

export class Room {
  constructor(ctx) { this.ctx = ctx; }

  async fetch(request) {
    const role = new URL(request.url).searchParams.get('role') === 'host' ? 'host' : 'client';
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    const reject = (code, reason) => { server.accept(); server.close(code, reason); return new Response(null, { status: 101, webSocket: client }); };
    const host = this.ctx.getWebSockets('host')[0];

    if (role === 'host') {
      if (host) return reject(4009, 'code in use');
      this.ctx.acceptWebSocket(server, ['host']);
      server.serializeAttachment({ role: 'host' });
    } else {
      if (!host) return reject(4004, 'room not found');
      if (this.ctx.getWebSockets('client').length >= MAX_CLIENTS) return reject(4008, 'room full');
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      this.ctx.acceptWebSocket(server, ['client', 'c:' + id]);
      server.serializeAttachment({ role: 'client', id });
      server.send('=');
      host.send('+' + id);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message === '~') return;
    const who = ws.deserializeAttachment();
    if (!who) return;
    if (who.role === 'host') {
      for (const part of message.split(SEP)) {
        if (part[0] === '!') { const t = this.ctx.getWebSockets('c:' + part.slice(1))[0]; if (t) t.close(4003, 'kicked'); continue; }
        const i = part.indexOf('|');
        if (i < 1) continue;
        const target = this.ctx.getWebSockets('c:' + part.slice(0, i))[0];
        if (target) { try { target.send(part.slice(i + 1)); } catch (e) { /* peer is closing */ } }
      }
    } else {
      if (message.length > MAX_CLIENT_MESSAGE) return;
      const host = this.ctx.getWebSockets('host')[0];
      if (host) { try { host.send(who.id + '|' + message); } catch (e) { /* host is closing */ } }
    }
  }

  webSocketClose(ws, code) {
    const who = ws.deserializeAttachment() || {};
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'closed'); } catch (e) { /* already closed */ }
    if (who.role === 'host') {
      for (const c of this.ctx.getWebSockets('client')) { try { c.close(4001, 'host left'); } catch (e) { /* ignore */ } }
    } else if (who.id) {
      const host = this.ctx.getWebSockets('host')[0];
      if (host && host !== ws) { try { host.send('-' + who.id); } catch (e) { /* ignore */ } }
    }
  }

  webSocketError(ws) { this.webSocketClose(ws, 1011); }
}
