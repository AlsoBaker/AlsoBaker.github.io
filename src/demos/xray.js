// A drawn chest scan with a Grad-CAM style heatmap that appears after each
// sweep. It is an illustration of the idea, not model output.
export function initXray(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  let raf, running = false, t0 = 0;

  function chest() {
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H * 0.5, W * 0.6);
    g.addColorStop(0, '#16224f');
    g.addColorStop(1, '#040714');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    // shoulders and torso
    ctx.fillStyle = 'rgba(170,195,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(cx - 250, H);
    ctx.bezierCurveTo(cx - 265, 150, cx - 150, 60, cx - 44, 46);
    ctx.lineTo(cx + 44, 46);
    ctx.bezierCurveTo(cx + 150, 60, cx + 265, 150, cx + 250, H);
    ctx.fill();
    // lungs
    ctx.fillStyle = 'rgba(2,4,14,0.72)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 26, 96);
      ctx.bezierCurveTo(cx + s * 120, 70, cx + s * 190, 190, cx + s * 182, 340);
      ctx.bezierCurveTo(cx + s * 150, 372, cx + s * 70, 366, cx + s * 30, 330);
      ctx.closePath();
      ctx.fill();
    }
    // heart shadow
    ctx.fillStyle = 'rgba(190,210,255,0.13)';
    ctx.beginPath();
    ctx.ellipse(cx + 34, 276, 62, 78, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // spine
    ctx.fillStyle = 'rgba(215,228,255,0.3)';
    for (let i = 0; i < 13; i++) ctx.fillRect(cx - 11, 40 + i * 28, 22, 21);
    // ribs
    ctx.strokeStyle = 'rgba(215,228,255,0.34)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const y = 96 + i * 32;
      const reach = 150 + Math.sin((i / 7) * Math.PI) * 44;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 14, y);
        ctx.quadraticCurveTo(cx + s * reach * 0.7, y - 30, cx + s * reach, y + 26);
        ctx.stroke();
      }
    }
    // collarbones
    ctx.lineWidth = 9;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 18, 84);
      ctx.quadraticCurveTo(cx + s * 110, 60, cx + s * 205, 92);
      ctx.stroke();
    }
  }

  function heat(a) {
    if (a <= 0) return;
    const x = W / 2 + 108;
    const y = 268;
    const r = 118;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,70,40,${0.95 * a})`);
    g.addColorStop(0.35, `rgba(255,170,40,${0.7 * a})`);
    g.addColorStop(0.7, `rgba(90,220,160,${0.32 * a})`);
    g.addColorStop(1, 'rgba(60,120,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  function bar(label, value, y, a) {
    const x = 24;
    ctx.fillStyle = '#dce9ff';
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(label, x, y);
    ctx.fillText(value.toFixed(2), x + 208, y);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x + 92, y - 9, 104, 6);
    ctx.fillStyle = '#6e94ff';
    ctx.fillRect(x + 92, y - 9, 104 * value * a, 6);
  }

  function draw(t) {
    const cycle = ((t - t0) / 1000) % 7;
    chest();
    const sweep = Math.min(1, cycle / 2.4);
    const a = Math.max(0, Math.min(1, (cycle - 2.2) / 0.9)) * (1 - Math.max(0, (cycle - 6.2) / 0.8));
    heat(a * (0.85 + 0.15 * Math.sin(t * 0.004)));
    if (sweep < 1) {
      const y = sweep * H;
      const g = ctx.createLinearGradient(0, y - 46, 0, y);
      g.addColorStop(0, 'rgba(110,148,255,0)');
      g.addColorStop(1, 'rgba(150,185,255,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 46, W, 46);
      ctx.fillStyle = '#cfe0ff';
      ctx.fillRect(0, y, W, 2);
    }
    bar('Pneumonia', 0.94, 34, a);
    bar('Normal', 0.06, 56, a);
  }

  function frame(t) {
    if (!running) return;
    draw(t);
    raf = requestAnimationFrame(frame);
  }

  draw(3600);
  return {
    start() {
      if (running) return;
      running = true;
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
