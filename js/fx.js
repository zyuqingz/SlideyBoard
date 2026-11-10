// Presentation clocks: tweens and a particle pool. No board rules.

export const Ease = {
  lin: t => t,
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t,
  inCubic: t => t * t * t,
  outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  // Damped oscillation 1 -> 0 used for the landing squash/bounce.
  damped: t => t >= 1 ? 0 : Math.exp(-4.5 * t) * Math.cos(t * Math.PI * 3)
};

export function createEffects() {
  let now = 0;
  let tweens = [];

  function tween(dur, fn, ease = Ease.out) {
    return new Promise(resolve => {
      tweens.push({ t0: now, dur: Math.max(1, dur), fn, ease, resolve });
    });
  }

  const wait = ms => tween(ms, () => {});

  function updateTweens(t) {
    const list = tweens.slice();
    for (const tw of list) {
      const p = Math.max(0, Math.min(1, (t - tw.t0) / tw.dur));
      tw.fn(tw.ease(p));
      if (p >= 1) {
        const i = tweens.indexOf(tw);
        if (i >= 0) tweens.splice(i, 1);
        tw.resolve(true);
      }
    }
  }

  // Resolve cancelled work so callers can stop cleanly rather than leak promises.
  function clearTweens() {
    for (const tw of tweens) tw.resolve(false);
    tweens = [];
  }

  const parts = [];
  let partCount = 0;

  function growPool(extra) {
    for (let i = 0; i < extra; i++) {
      parts.push({ x: 0, y: 0, vx: 0, vy: 0, size: 0, color: '#fff', life: 0, rot: 0 });
    }
  }
  growPool(512);

  function spawnParticle(fields) {
    if (partCount >= parts.length) growPool(512);
    const p = parts[partCount++];
    p.x = fields.x;
    p.y = fields.y;
    p.vx = fields.vx;
    p.vy = fields.vy;
    p.size = fields.size;
    p.color = fields.color;
    p.life = fields.life;
    p.rot = fields.rot;
  }

  function updateParticles(dt) {
    // Exponential drag eases the burst out instead of keeping a constant outward speed.
    const drag = Math.exp(-2.4 * dt);
    let i = 0;
    while (i < partCount) {
      const p = parts[i];
      p.vx *= drag;
      p.vy *= drag;
      p.vy += 1700 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += 4 * dt;
      p.life -= 1.3 * dt;
      if (p.life <= 0) {
        partCount--;
        const last = parts[partCount];
        parts[partCount] = p;
        parts[i] = last;
      } else {
        i++;
      }
    }
  }

  function eachParticle(fn) {
    for (let i = 0; i < partCount; i++) fn(parts[i]);
  }

  return {
    tween, wait, spawnParticle, eachParticle,
    hasTweens: () => tweens.length > 0,
    now: () => now,
    update(ms) { now += ms; updateTweens(now); updateParticles(ms / 1000); },
    clear() { clearTweens(); partCount = 0; }
  };
}
