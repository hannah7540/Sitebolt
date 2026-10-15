export type RedlinePoint = [number, number];
export type RedlineSeg = RedlinePoint[];
export type RedlineLabel = { x: number; y: number; size: number };

export function perpDist(p: RedlinePoint, a: RedlinePoint, b: RedlinePoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function rdp(pts: RedlinePoint[], eps: number): RedlinePoint[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const st: Array<[number, number]> = [[0, n - 1]];
  while (st.length) {
    const pair = st.pop();
    if (!pair) break;
    const [s, e] = pair;
    let md = 0;
    let mi = -1;
    for (let i = s + 1; i < e; i += 1) {
      const d = perpDist(pts[i], pts[s], pts[e]);
      if (d > md) {
        md = d;
        mi = i;
      }
    }
    if (mi >= 0 && md > eps) {
      keep[mi] = 1;
      st.push([s, mi], [mi, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function defaultLabel(segs: RedlineSeg[], size: number, ratio: number): RedlineLabel {
  const first = segs.find((seg) => seg.length);
  const p = first ? first[0] : ([0.5, 0.5] as RedlinePoint);
  return {
    x: clamp(p[0] + size * 0.5, 0, 0.98),
    y: clamp(p[1] - (size * 0.5) / ratio, 0.02, 1),
    size,
  };
}

export function labelBox(label: RedlineLabel, id: string, ratio: number) {
  const w = id.length * label.size * 0.6;
  const pad = label.size * 0.2;
  return {
    l: label.x - pad,
    r: label.x + w + pad,
    t: label.y - (label.size * 0.95) / ratio - pad / ratio,
    b: label.y + (label.size * 0.25) / ratio + pad / ratio,
  };
}

export function closestOnRun(
  segs: RedlineSeg[],
  p: RedlinePoint,
  ratio: number
): RedlinePoint | null {
  const P: RedlinePoint = [p[0], p[1] / ratio];
  let best: RedlinePoint | null = null;
  let bd = 1e9;
  const test = (q: RedlinePoint) => {
    const d = Math.hypot(P[0] - q[0], P[1] - q[1]);
    if (d < bd) {
      bd = d;
      best = q;
    }
  };
  for (const seg of segs) {
    if (seg.length === 1) test([seg[0][0], seg[0][1] / ratio]);
    for (let i = 0; i + 1 < seg.length; i += 1) {
      const a: RedlinePoint = [seg[i][0], seg[i][1] / ratio];
      const b: RedlinePoint = [seg[i + 1][0], seg[i + 1][1] / ratio];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      const t = l2 ? clamp(((P[0] - a[0]) * dx + (P[1] - a[1]) * dy) / l2, 0, 1) : 0;
      test([a[0] + t * dx, a[1] + t * dy]);
    }
  }
  return best ? [best[0], best[1] * ratio] : null;
}

export function leaderOf(
  segs: RedlineSeg[],
  label: RedlineLabel,
  id: string,
  ratio: number
): { q: RedlinePoint; e: RedlinePoint } | null {
  const box = labelBox(label, id, ratio);
  const q = closestOnRun(segs, [(box.l + box.r) / 2, (box.t + box.b) / 2], ratio);
  if (!q) return null;
  if (q[0] >= box.l && q[0] <= box.r && q[1] >= box.t && q[1] <= box.b) return null;
  return { q, e: [clamp(q[0], box.l, box.r), clamp(q[1], box.t, box.b)] };
}
