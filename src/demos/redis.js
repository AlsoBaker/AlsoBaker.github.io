// A typed terminal session against the key-value server.
const SCRIPT = [
  ['SET user:42 "vijayesh"', 'OK'],
  ['GET user:42', '"vijayesh"'],
  ['EXPIRE user:42 60', '(integer) 1'],
  ['TTL user:42', '(integer) 60'],
  ['INCR visits', '(integer) 1'],
  ['SAVE', 'OK'],
];
const PROMPT = '127.0.0.1:6379> ';

export function initRedis(root) {
  const out = root.querySelector('.term-out');
  const ops = root.querySelector('.term-ops');
  const bar = root.querySelector('.term-meter em');
  const lines = [];
  let timer, meter, running = false, li = 0, ci = 0;

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function paint(typing) {
    const html = lines.slice(-9).map((l) => (l.cmd ? `${PROMPT}<span class="cmd">${esc(l.text)}</span>` : `<span class="ok">${esc(l.text)}</span>`));
    if (typing !== undefined) html.push(`${PROMPT}<span class="cmd">${esc(typing)}</span>█`);
    out.innerHTML = html.slice(-10).join('\n');
  }

  function tick() {
    if (!running) return;
    const [cmd, res] = SCRIPT[li];
    if (ci <= cmd.length) {
      paint(cmd.slice(0, ci));
      ci++;
      timer = setTimeout(tick, 34 + Math.random() * 40);
    } else {
      lines.push({ cmd: true, text: cmd }, { text: res });
      paint('');
      li = (li + 1) % SCRIPT.length;
      ci = 0;
      timer = setTimeout(tick, 620);
    }
  }

  function jitter() {
    const v = 48200 + Math.round(Math.random() * 3600);
    ops.textContent = v.toLocaleString('en-US');
    bar.style.transform = `scaleX(${(v / 54000).toFixed(3)})`;
  }

  paint('');
  return {
    start() {
      if (running) return;
      running = true;
      tick();
      meter = setInterval(jitter, 450);
    },
    stop() {
      running = false;
      clearTimeout(timer);
      clearInterval(meter);
    },
  };
}
