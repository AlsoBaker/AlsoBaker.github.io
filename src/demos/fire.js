// A small replay of the firefighter simulation: agents route around spreading
// fire to reach people, carry them to the left edge, and replan when blocked.
const COLS = 32;
const ROWS = 21;
const STEP_MS = 120;

export function initFire(canvas) {
  const ctx = canvas.getContext('2d');
  const cell = canvas.width / COLS;
  const N = COLS * ROWS;
  const idx = (x, y) => y * COLS + x;
  let wall, fire, victims, agents, rescued, steps, last, acc, raf, running = false;

  function reset() {
    wall = new Uint8Array(N);
    fire = new Int16Array(N); // 0 clear, >0 burning (age), -1 burnt out
    for (let i = 0; i < N; i++) {
      const x = i % COLS;
      if (x > 1 && Math.random() < 0.13) wall[i] = 1;
    }
    for (let k = 0; k < 2; k++) {
      const i = idx(12 + Math.floor(Math.random() * 16), 3 + Math.floor(Math.random() * 15));
      wall[i] = 0;
      fire[i] = 1;
    }
    victims = [];
    while (victims.length < 10) {
      const x = 8 + Math.floor(Math.random() * (COLS - 9));
      const y = 1 + Math.floor(Math.random() * (ROWS - 2));
      const i = idx(x, y);
      if (!wall[i] && !fire[i] && !victims.some((v) => v.i === i)) victims.push({ i, claimed: false });
    }
    agents = [];
    for (let k = 0; k < 8; k++) {
      const y = 1 + Math.round((k * (ROWS - 3)) / 7);
      agents.push({ x: 0, y, px: 0, py: y, carrying: false, target: null, trail: [] });
    }
    rescued = 0;
    steps = 0;
  }

  function bfs(from) {
    const dist = new Int16Array(N).fill(-1);
    const prev = new Int16Array(N).fill(-1);
    const q = [from];
    dist[from] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      const cx = c % COLS;
      const cy = (c / COLS) | 0;
      const nb = [];
      if (cx > 0) nb.push(c - 1);
      if (cx < COLS - 1) nb.push(c + 1);
      if (cy > 0) nb.push(c - COLS);
      if (cy < ROWS - 1) nb.push(c + COLS);
      for (const n of nb) {
        if (dist[n] !== -1 || wall[n] || fire[n] > 0) continue;
        dist[n] = dist[c] + 1;
        prev[n] = c;
        q.push(n);
      }
    }
    return { dist, prev };
  }

  function firstStep(prev, from, to) {
    let c = to;
    while (prev[c] !== -1 && prev[c] !== from) c = prev[c];
    return prev[c] === from ? c : -1;
  }

  function step() {
    steps++;
    const lit = [];
    for (let i = 0; i < N; i++) if (fire[i] > 0) lit.push(i);
    for (const i of lit) {
      const x = i % COLS;
      const y = (i / COLS) | 0;
      const nb = [];
      if (x > 2) nb.push(i - 1);
      if (x < COLS - 1) nb.push(i + 1);
      if (y > 0) nb.push(i - COLS);
      if (y < ROWS - 1) nb.push(i + COLS);
      for (const n of nb) if (!wall[n] && fire[n] === 0 && Math.random() < 0.055) fire[n] = 1;
      if (++fire[i] > 46) fire[i] = -1;
    }
    victims = victims.filter((v) => fire[v.i] <= 0);

    for (const a of agents) {
      a.px = a.x;
      a.py = a.y;
      a.trail.push([a.x, a.y]);
      if (a.trail.length > 9) a.trail.shift();
      const here = idx(a.x, a.y);
      const { dist, prev } = bfs(here);
      let goal = -1;
      if (a.carrying) {
        let best = 1e9;
        for (let y = 0; y < ROWS; y++) {
          const e = idx(0, y);
          if (dist[e] >= 0 && dist[e] < best) { best = dist[e]; goal = e; }
        }
        if (a.x === 0) { a.carrying = false; rescued++; goal = -1; }
      } else {
        if (a.target && (!victims.includes(a.target) || dist[a.target.i] < 0)) {
          a.target.claimed = false;
          a.target = null;
        }
        if (!a.target) {
          let best = 1e9;
          for (const v of victims) {
            if (v.claimed || dist[v.i] < 0) continue;
            if (dist[v.i] < best) { best = dist[v.i]; a.target = v; }
          }
          if (a.target) a.target.claimed = true;
        }
        if (a.target) {
          if (a.target.i === here) {
            victims = victims.filter((v) => v !== a.target);
            a.target = null;
            a.carrying = true;
          } else goal = a.target.i;
        }
      }
      if (goal >= 0 && goal !== here) {
        const n = firstStep(prev, here, goal);
        if (n >= 0) { a.x = n % COLS; a.y = (n / COLS) | 0; }
      }
    }
    const idle = agents.every((a) => !a.carrying && !a.target);
    if (steps > 420 || (idle && steps > 30)) reset();
  }

  function draw(f) {
    ctx.fillStyle = '#050818';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    for (let i = 0; i < N; i++) {
      const x = (i % COLS) * cell;
      const y = ((i / COLS) | 0) * cell;
      if (wall[i]) {
        ctx.fillStyle = '#1a2558';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      } else if (fire[i] > 0) {
        const heat = Math.min(1, fire[i] / 14);
        const flick = 0.75 + 0.25 * Math.sin(now * 0.02 + i);
        ctx.fillStyle = `rgba(${255}, ${Math.round(190 - heat * 110)}, ${Math.round(70 - heat * 40)}, ${0.55 + 0.45 * flick})`;
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      } else if (fire[i] < 0) {
        ctx.fillStyle = '#0d1230';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      } else {
        ctx.fillStyle = 'rgba(120,150,255,0.05)';
        ctx.fillRect(x + cell / 2 - 1, y + cell / 2 - 1, 2, 2);
      }
    }
    ctx.fillStyle = 'rgba(110,148,255,0.14)';
    ctx.fillRect(0, 0, cell, canvas.height);

    ctx.lineWidth = 2;
    for (const v of victims) {
      const x = (v.i % COLS) * cell + cell / 2;
      const y = ((v.i / COLS) | 0) * cell + cell / 2;
      ctx.strokeStyle = '#dce9ff';
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.28 + Math.sin(now * 0.005 + v.i) * 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const a of agents) {
      const ax = (a.px + (a.x - a.px) * f) * cell + cell / 2;
      const ay = (a.py + (a.y - a.py) * f) * cell + cell / 2;
      ctx.strokeStyle = 'rgba(110,148,255,0.5)';
      ctx.beginPath();
      a.trail.forEach(([tx, ty], k) => {
        const x = tx * cell + cell / 2;
        const y = ty * cell + cell / 2;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.fillStyle = a.carrying ? '#ffe9b0' : '#ffffff';
      ctx.beginPath();
      ctx.arc(ax, ay, cell * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#dce9ff';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(`Rescued ${rescued}`, cell * 1.4, canvas.height - 12);
  }

  function frame(t) {
    if (!running) return;
    acc += Math.min(200, t - last);
    last = t;
    while (acc >= STEP_MS) { step(); acc -= STEP_MS; }
    draw(acc / STEP_MS);
    raf = requestAnimationFrame(frame);
  }

  reset();
  draw(1);
  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
