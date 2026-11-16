// Deployment configuration. Everything here can also be overridden per-tab with URL parameters,
// which is handy for testing:  ?net=local  ?net=cloudflare  ?lag=100&jitter=20&loss=2
//                              ?peerhost=localhost&peerport=9000  (your own PeerJS server)

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const num = (k, d) => (params.has(k) && Number.isFinite(+params.get(k)) ? +params.get(k) : d);

export const CONFIG = {
  version: '0.1.0',
  protocol: 3, // bump when the network protocol changes; mismatched clients are refused
  net: {
    // 'peerjs' (default, works on GitHub Pages and Cloudflare Pages), 'cloudflare', or 'local'
    backend: params.get('net') || 'peerjs',

    // PeerJS broker. Leave host empty to use the free public PeerJS cloud (0.peerjs.com).
    peerjs: {
      host: params.get('peerhost') || '',
      port: num('peerport', 443),
      path: params.get('peerpath') || '/',
      secure: params.has('peerhost') ? params.get('peersecure') === '1' : true,
      iceServers: null, // e.g. [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:...', username, credential }]
    },

    // Cloudflare Worker relay (server/cloudflare). Set this after `wrangler deploy`, e.g.
    // 'wss://breachline-relay.<your-subdomain>.workers.dev'
    cloudflare: { url: params.get('relay') || '' },

    // Artificial network conditions for testing (milliseconds / percent).
    simulate: { lag: num('lag', 0), jitter: num('jitter', 0), loss: num('loss', 0) },
  },
  debug: params.has('debug'),
};
