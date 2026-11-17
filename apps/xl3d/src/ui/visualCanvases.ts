import { evaluateMaterialColorAt } from '../engine/nodesEngine';
import { sampleKeyframes } from '../engine/physicsAndAnim';
import { store } from '../state/xl3dStore';

export function mountNodeGraphCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const draw = () => {
    const graph =
      store.scene.nodeGraphs.find((g) => g.id === store.scene.activeNodeGraphId) ??
      store.scene.nodeGraphs[0];
    if (!graph) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#14171e';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Links (Bezier)
    for (const l of graph.links) {
      const a = graph.nodes.find((n) => n.id === l.fromNodeId);
      const b = graph.nodes.find((n) => n.id === l.toNodeId);
      if (!a || !b) continue;
      const x1 = a.x + 116, y1 = a.y + 32;
      const x2 = b.x, y2 = b.y + 32;
      ctx.strokeStyle = '#ff9c38';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1 + 40, y1, x2 - 40, y2, x2, y2);
      ctx.stroke();
    }

    // Nodes
    const headerColor =
      graph.graphKind === 'shader' ? '#b45309' : graph.graphKind === 'geometry' ? '#047857' : '#4338ca';
    for (const n of graph.nodes) {
      const sel = n.id === store.selectedNodeId;
      ctx.fillStyle = '#242934';
      ctx.strokeStyle = sel ? '#ff9c38' : '#434c5e';
      ctx.lineWidth = sel ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.roundRect(n.x, n.y, 116, 58, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = headerColor;
      ctx.beginPath();
      ctx.roundRect(n.x, n.y, 116, 22, [10, 10, 0, 0]);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = '700 11px Inter, sans-serif';
      ctx.fillText(n.label.slice(0, 16), n.x + 8, n.y + 15);
      ctx.fillStyle = '#a5b0c2';
      ctx.font = '500 10px Inter, sans-serif';
      ctx.fillText(n.kind.slice(0, 17), n.x + 8, n.y + 42);

      // Sockets
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath(); ctx.arc(n.x, n.y + 32, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.arc(n.x + 116, n.y + 32, 4.5, 0, Math.PI * 2); ctx.fill();
    }
  };

  draw();

  let dragId: string | null = null;
  let offX = 0, offY = 0;

  canvas.onpointerdown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const sy = ((e.clientY - rect.top) * canvas.height) / rect.height;
    const graph = store.scene.nodeGraphs.find((g) => g.id === store.scene.activeNodeGraphId);
    if (!graph) return;
    const hit = [...graph.nodes].reverse().find((n) => sx >= n.x && sx <= n.x + 116 && sy >= n.y && sy <= n.y + 58);
    if (hit) {
      dragId = hit.id;
      store.selectedNodeId = hit.id;
      offX = sx - hit.x;
      offY = sy - hit.y;
      canvas.setPointerCapture(e.pointerId);
      draw();
    }
  };
  canvas.onpointermove = (e) => {
    if (!dragId) return;
    const rect = canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const sy = ((e.clientY - rect.top) * canvas.height) / rect.height;
    store.moveNodeInGraph(dragId, Math.max(4, Math.min(canvas.width - 120, sx - offX)), Math.max(4, Math.min(canvas.height - 62, sy - offY)));
    draw();
  };
  canvas.onpointerup = () => {
    if (dragId) {
      dragId = null;
      store.commitLiveChange();
    }
  };
}

export function mountUvEditorCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#151820';
  ctx.fillRect(0, 0, w, h);

  // UDIM grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * w;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, (i / 8) * h); ctx.lineTo(w, (i / 8) * h); ctx.stroke();
  }

  const obj = store.getActiveObject();
  if (!obj?.mesh) return;
  const m = obj.mesh;

  for (const f of m.faces) {
    if (f.verts.length < 3) continue;
    ctx.beginPath();
    f.verts.forEach((vi, i) => {
      const uv = m.vertices[vi]?.uv ?? { x: 0.5, y: 0.5 };
      const x = uv.x * w;
      const y = (1 - uv.y) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = f.selected ? 'rgba(255, 140, 56, 0.25)' : 'rgba(74, 163, 255, 0.14)';
    ctx.fill();
    ctx.strokeStyle = f.selected ? '#ff9c38' : '#7dd3fc';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  for (const v of m.vertices) {
    ctx.fillStyle = v.selected ? '#ff9c38' : '#e2e8f0';
    ctx.beginPath();
    ctx.arc(v.uv.x * w, (1 - v.uv.y) * h, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function mountGraphEditorCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#14171f';
  ctx.fillRect(0, 0, w, h);

  // Axis lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

  const obj = store.getActiveObject();
  const s = store.scene;
  const colors: Record<string, string> = { locX: '#ef4444', locY: '#22c55e', locZ: '#3b82f6', rotZ: '#f59e0b' };

  if (obj) {
    for (const [prop, kfs] of Object.entries(obj.keyframes)) {
      if (!kfs || kfs.length === 0) continue;
      ctx.strokeStyle = colors[prop] ?? '#a78bfa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let f = s.startFrame; f <= s.endFrame; f += 2) {
        const val = sampleKeyframes(kfs, f) ?? 0;
        const x = ((f - s.startFrame) / Math.max(1, s.endFrame - s.startFrame)) * w;
        const y = h / 2 - val * 22;
        if (f === s.startFrame) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      for (const kf of kfs) {
        const x = ((kf.frame - s.startFrame) / Math.max(1, s.endFrame - s.startFrame)) * w;
        const y = h / 2 - kf.value * 22;
        ctx.fillStyle = '#ff9c38';
        ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
      }
    }
  }

  // Playhead
  const px = ((s.currentFrame - s.startFrame) / Math.max(1, s.endFrame - s.startFrame)) * w;
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
}

export function mountTexturePaintCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const mat = store.getActiveMaterial();
  if (!store.texturePaintCanvas) {
    // Seed with procedural texture preview
    const w = canvas.width, h = canvas.height;
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const [r, g, b] = evaluateMaterialColorAt(mat, x / w, y / h, { x: x / 40, y: y / 40, z: 0 });
        ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
  } else {
    ctx.drawImage(store.texturePaintCanvas, 0, 0, canvas.width, canvas.height);
  }

  let painting = false;
  const paintAt = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * canvas.height) / rect.height;
    const r = Math.max(4, store.paint.radius * 18);
    ctx.save();
    ctx.globalAlpha = store.paint.strength;
    ctx.fillStyle = store.paint.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    store.texturePaintCanvas = canvas;
  };
  canvas.onpointerdown = (e) => {
    painting = true;
    canvas.setPointerCapture(e.pointerId);
    paintAt(e);
  };
  canvas.onpointermove = (e) => {
    if (painting) paintAt(e);
  };
  canvas.onpointerup = () => {
    painting = false;
  };
}
