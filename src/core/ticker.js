// A timer that keeps firing when the tab is in the background. Browsers throttle setInterval and
// stop requestAnimationFrame in hidden tabs, which would freeze the match for everyone if the host
// alt-tabs. Timers inside a Web Worker are not throttled, so the host simulation is driven by one.

export class Ticker {
  constructor(hz, fn) {
    this.fn = fn; this.ms = 1000 / hz; this.worker = null; this.timer = null;
  }
  start() {
    try {
      const src = `let t=null;onmessage=e=>{if(e.data>0){clearInterval(t);t=setInterval(()=>postMessage(0),e.data)}else{clearInterval(t)}}`;
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.worker.onmessage = () => this.fn();
      this.worker.postMessage(this.ms);
    } catch (e) {
      this.timer = setInterval(() => this.fn(), this.ms);
    }
  }
  stop() {
    if (this.worker) { this.worker.postMessage(0); this.worker.terminate(); this.worker = null; }
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}
