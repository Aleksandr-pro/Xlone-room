import {
  add3,
  dot3,
  getCameraBasis,
  intersectRayTriangle,
  inverseTransformVec3,
  norm3,
  projectPoint,
  screenToRay,
  sub3,
  transformVec3,
  type CameraBasis,
  type OrbitCamera,
} from '../core/math3d';
import type {
  ColorTransform,
  InteractionMode,
  MaterialData,
  MeshData,
  PaintSettings,
  SceneObject,
  Vec3,
  XL3DScene,
} from '../core/types';
import { evaluateModifierStack } from './modifiers';
import { applyCompositorPostProcess, evaluateCompositorString, evaluateGeometryNodesOnMesh, evaluateMaterialColorAt } from './nodesEngine';
import { evaluateAnimatedTransform } from './physicsAndAnim';

export interface RenderStats {
  objectsDrawn: number;
  trisDrawn: number;
  verticesCount: number;
  evaluatedMeshes: Map<string, MeshData>;
}

export interface ScreenPickResult {
  objectId: string;
  hitWorld: Vec3;
  hitLocal: Vec3;
  faceIdx: number;
  depth: number;
}

interface DrawTri {
  pts: Array<{ x: number; y: number }>;
  depth: number;
  fill: string;
  stroke: string;
  wireOnly: boolean;
  freestyle: boolean;
  selectedFace: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function applyColorMgmt(c: number, cm: ColorTransform, exposure: number): number {
  const lin = Math.max(0, c * Math.pow(2, exposure));
  let mapped = lin;
  if (cm === 'agx') {
    mapped = lin / (lin + 0.72);
    mapped = Math.pow(mapped, 0.92);
  } else if (cm === 'filmic' || cm === 'aces') {
    mapped = (lin * (2.51 * lin + 0.03)) / (lin * (2.43 * lin + 0.59) + 0.14);
  }
  return clamp(Math.pow(clamp(mapped, 0, 1), 1 / 2.2), 0, 1);
}

export function renderViewport3D(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: XL3DScene,
  camera: OrbitCamera,
  mode: InteractionMode,
  paintState: PaintSettings,
  showOverlays = true,
  isOffscreenRender = false,
  brushOverlay?: { screenX: number; screenY: number; radiusPx: number } | null
): RenderStats {
  const timeSec = (scene.currentFrame - 1) / Math.max(1, scene.fps);
  const basis = getCameraBasis(camera);
  const evaluatedMeshes = new Map<string, MeshData>();
  const engine = isOffscreenRender ? (scene.render.engine === 'workbench' ? 'eevee' : scene.render.engine) : scene.render.engine;
  const wbMode = scene.render.workbenchShading;

  // 1. Background / Sky 5.3 / Fog
  drawBackground(ctx, width, height, scene, engine);

  // 2. 3D Floor Grid & Axes
  if (showOverlays && !isOffscreenRender) {
    drawFloorGrid(ctx, width, height, basis, camera);
  }

  const lights = scene.objects.filter((o) => o.type === 'light' && o.visible && o.light);
  const sunDir = getPrimaryLightDir(lights);
  const geoGraph = scene.nodeGraphs.find((g) => g.graphKind === 'geometry');
  const tris: DrawTri[] = [];
  let objectsDrawn = 0;
  let verticesCount = 0;

  for (const obj of scene.objects) {
    if (!obj.visible) continue;
    objectsDrawn++;
    const animTr = evaluateAnimatedTransform(obj, scene.currentFrame, scene.fps);
    const isActive = obj.id === scene.activeObjectId;
    const matData = scene.materials.find((m) => m.id === obj.materialId) ?? scene.materials[0];

    if ((obj.type === 'mesh' || obj.type === 'surface' || obj.type === 'metaball' || obj.type === 'text') && obj.mesh) {
      const mesh = evaluateModifierStack(obj, timeSec) ?? obj.mesh;
      if (obj.modifiers.some((m) => m.type === 'geometryNodes' && m.enabled) && geoGraph) {
        evaluateGeometryNodesOnMesh(mesh, geoGraph, timeSec, scene.objects);
      }
      evaluatedMeshes.set(obj.id, mesh);
      verticesCount += mesh.vertices.length;

      const worldPts = mesh.vertices.map((v) => transformVec3(v.pos, animTr.location, animTr.rotation, animTr.scale));
      const projPts = worldPts.map((wp) => projectPoint(wp, basis, camera, width, height));

      if ((engine === 'cycles' || engine === 'eevee') && obj.location.z > -0.2) {
        drawObjectGroundShadow(ctx, worldPts, sunDir, basis, width, height, camera);
      }

      for (let fi = 0; fi < mesh.faces.length; fi++) {
        const f = mesh.faces[fi];
        if (f.hidden) continue;
        const pList: Array<{ x: number; y: number }> = [];
        let depthSum = 0;
        let behind = false;
        for (const vi of f.verts) {
          const p = projPts[vi];
          if (!p || !p.visible) {
            behind = true;
            break;
          }
          pList.push({ x: p.sx, y: p.sy });
          depthSum += p.depth;
        }
        if (behind || pList.length < 3) continue;

        const w0 = worldPts[f.verts[0]];
        const w1 = worldPts[f.verts[1]];
        const w2 = worldPts[f.verts[2]];
        const fn = norm3({
          x: (w1.y - w0.y) * (w2.z - w0.z) - (w1.z - w0.z) * (w2.y - w0.y),
          y: (w1.z - w0.z) * (w2.x - w0.x) - (w1.x - w0.x) * (w2.z - w0.z),
          z: (w1.x - w0.x) * (w2.y - w0.y) - (w1.y - w0.y) * (w2.x - w0.x),
        });

        const fill = computeFaceShadingColor(
          mesh,
          f,
          fn,
          w0,
          sunDir,
          basis.forward,
          engine,
          wbMode,
          mode,
          paintState,
          matData,
          scene,
          isActive
        );

        let stroke = 'rgba(0,0,0,0.14)';
        if (wbMode === 'wireframe') stroke = isActive ? '#ff9c3a' : '#8fa0b5';
        else if (mode === 'edit' && isActive) stroke = f.selected ? '#ffaa3b' : 'rgba(255,255,255,0.22)';
        else if (scene.render.freestyle) stroke = '#111116';

        tris.push({
          pts: pList,
          depth: depthSum / pList.length,
          fill,
          stroke,
          wireOnly: engine === 'workbench' && wbMode === 'wireframe',
          freestyle: scene.render.freestyle,
          selectedFace: mode === 'edit' && isActive && f.selected,
        });
      }

      // Particles / Hair preview
      if (obj.physics.type === 'particles' || obj.physics.type === 'hair') {
        drawParticlesPreview(ctx, worldPts, obj, basis, camera, width, height, timeSec);
      }
    }
  }

  tris.sort((a, b) => b.depth - a.depth);
  for (const t of tris) {
    ctx.beginPath();
    ctx.moveTo(t.pts[0].x, t.pts[0].y);
    for (let i = 1; i < t.pts.length; i++) ctx.lineTo(t.pts[i].x, t.pts[i].y);
    ctx.closePath();

    if (!t.wireOnly) {
      ctx.fillStyle = t.fill;
      ctx.fill();
    }
    if (t.wireOnly || t.freestyle || mode === 'edit' || engine === 'workbench' || t.selectedFace) {
      ctx.strokeStyle = t.stroke;
      ctx.lineWidth = t.selectedFace ? 1.8 : t.freestyle ? scene.render.freestyleThickness : t.wireOnly ? 1.15 : 0.7;
      ctx.stroke();
    }
  }

  // Edit mode edges (seams, sharp, selected) & vertices
  if (mode === 'edit' && scene.activeObjectId) {
    const activeObj = scene.objects.find((o) => o.id === scene.activeObjectId);
    if (activeObj?.mesh) {
      const tr = evaluateAnimatedTransform(activeObj, scene.currentFrame, scene.fps);
      const projCache = activeObj.mesh.vertices.map((v) =>
        projectPoint(transformVec3(v.pos, tr.location, tr.rotation, tr.scale), basis, camera, width, height)
      );
      for (const edge of activeObj.mesh.edges) {
        if (!edge.selected && !edge.seam && !edge.sharp) continue;
        const pa = projCache[edge.a];
        const pb = projCache[edge.b];
        if (!pa?.visible || !pb?.visible) continue;
        ctx.strokeStyle = edge.selected ? '#ff9c38' : edge.seam ? '#ef4444' : '#38bdf8';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(pa.sx, pa.sy);
        ctx.lineTo(pb.sx, pb.sy);
        ctx.stroke();
      }
      activeObj.mesh.vertices.forEach((v, idx) => {
        if (v.hidden) return;
        const p = projCache[idx];
        if (!p?.visible) return;
        ctx.fillStyle = v.selected ? '#ff9c38' : '#b7c2d0';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, v.selected ? 4.4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  // Non-mesh objects
  for (const obj of scene.objects) {
    if (!obj.visible) continue;
    const animTr = evaluateAnimatedTransform(obj, scene.currentFrame, scene.fps);
    const isActive = obj.id === scene.activeObjectId;

    if (obj.type === 'curve' && obj.curve) {
      ctx.save();
      ctx.strokeStyle = isActive ? '#ff9c3a' : '#78c5ff';
      ctx.lineWidth = Math.max(2, obj.curve.bevelDepth * 40);
      ctx.beginPath();
      obj.curve.points.forEach((pt, idx) => {
        const p = projectPoint(transformVec3(pt.pos, animTr.location, animTr.rotation, animTr.scale), basis, camera, width, height);
        if (idx === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      });
      if (obj.curve.closed) ctx.closePath();
      ctx.stroke();
      ctx.restore();
    } else if (obj.type === 'lattice') {
      drawLattice(ctx, animTr, basis, camera, width, height, isActive);
    } else if (obj.type === 'armature' && obj.armature) {
      for (const b of obj.armature.bones) {
        const p1 = projectPoint(transformVec3(b.head, animTr.location, animTr.rotation, animTr.scale), basis, camera, width, height);
        const p2 = projectPoint(transformVec3(b.tail, animTr.location, animTr.rotation, animTr.scale), basis, camera, width, height);
        if (!p1.visible || !p2.visible) continue;
        ctx.strokeStyle = isActive ? '#56d8ff' : '#9aa6b8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p1.sx, p1.sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (obj.type === 'volume' && obj.volume) {
      const puffs = [{ x: 0, y: 0, z: 0.2, r: 0.9 }, { x: -0.5, y: 0.2, z: 0.1, r: 0.65 }, { x: 0.55, y: -0.15, z: 0.15, r: 0.7 }];
      for (const pf of puffs) {
        const c = projectPoint(transformVec3(pf, animTr.location, animTr.rotation, animTr.scale), basis, camera, width, height);
        if (!c.visible) continue;
        const rad = clamp((pf.r * 220) / Math.max(1.2, c.depth), 16, 110);
        const grad = ctx.createRadialGradient(c.sx, c.sy, 2, c.sx, c.sy, rad);
        grad.addColorStop(0, `rgba(220,232,245,${clamp(obj.volume.density * 0.45, 0.15, 0.75)})`);
        grad.addColorStop(1, 'rgba(220,232,245,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(c.sx, c.sy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (obj.type === 'pointcloud' && obj.pointCloud) {
      for (const pt of obj.pointCloud.points) {
        const p = projectPoint(transformVec3(pt.pos, animTr.location, animTr.rotation, animTr.scale), basis, camera, width, height);
        if (!p.visible) continue;
        const rad = clamp((pt.radius * 320) / Math.max(1.2, p.depth), 2, 18);
        ctx.save();
        ctx.globalAlpha = obj.pointCloud.pointType === 'gaussianSplat' ? pt.opacity * 0.75 : 0.95;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (obj.type === 'greasepencil' && obj.greasePencil) {
      for (const layer of obj.greasePencil.layers) {
        if (!layer.visible) continue;
        const strokes = layer.frames[scene.currentFrame] ?? layer.frames[1] ?? [];
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        for (const stroke of strokes) {
          if (stroke.points.length < 2) continue;
          ctx.beginPath();
          stroke.points.forEach((pt, idx) => {
            const p = projectPoint(transformVec3(pt.pos, animTr.location, animTr.rotation, animTr.scale), basis, camera, width, height);
            if (idx === 0) ctx.moveTo(p.sx, p.sy);
            else ctx.lineTo(p.sx, p.sy);
          });
          if (stroke.filled && stroke.fillColor) {
            ctx.closePath();
            ctx.fillStyle = stroke.fillColor;
            ctx.fill();
          }
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.thickness;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if ((obj.type === 'light' || obj.type === 'camera' || obj.type === 'empty') && showOverlays) {
      drawHelperObject(ctx, obj, animTr, basis, camera, width, height, isActive);
    }
  }

  if (scene.world.fogDensity > 0.01) {
    const fAlpha = clamp(scene.world.fogDensity * 0.45, 0, 0.55);
    ctx.fillStyle = `rgba(148, 163, 184, ${fAlpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  if (engine === 'cycles' || engine === 'eevee' || isOffscreenRender) {
    applyCompositorPostProcess(ctx, width, height, scene);
    const strOut = evaluateCompositorString(scene);
    ctx.save();
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText(`${strOut} | ${scene.render.colorTransform.toUpperCase()}`, 14, height - 14);
    ctx.restore();
  }

  if (showOverlays && !isOffscreenRender) {
    draw3DCursor(ctx, scene.cursor3D, basis, camera, width, height);
    if (scene.activeObjectId && mode !== 'sculpt' && mode !== 'paint') {
      const activeObj = scene.objects.find((o) => o.id === scene.activeObjectId);
      if (activeObj && activeObj.visible) {
        const animTr = evaluateAnimatedTransform(activeObj, scene.currentFrame, scene.fps);
        drawTransformGizmo(ctx, animTr.location, basis, camera, width, height);
      }
    }
    if (brushOverlay) {
      ctx.save();
      ctx.strokeStyle = mode === 'sculpt' ? 'rgba(255, 140, 56, 0.85)' : 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(brushOverlay.screenX, brushOverlay.screenY, brushOverlay.radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  return { objectsDrawn, trisDrawn: tris.length, verticesCount, evaluatedMeshes };
}

function drawParticlesPreview(
  ctx: CanvasRenderingContext2D,
  worldPts: Vec3[],
  obj: SceneObject,
  basis: CameraBasis,
  camera: OrbitCamera,
  w: number,
  h: number,
  timeSec: number
): void {
  const count = Math.min(60, Math.max(8, Math.floor(obj.physics.particleCount / 4)));
  ctx.save();
  for (let i = 0; i < count && worldPts.length > 0; i++) {
    const src = worldPts[i % worldPts.length];
    if (obj.physics.type === 'hair') {
      const tip = { x: src.x, y: src.y, z: src.z + obj.physics.hairLength };
      const p0 = projectPoint(src, basis, camera, w, h);
      const p1 = projectPoint(tip, basis, camera, w, h);
      if (p0.visible && p1.visible) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.stroke();
      }
    } else {
      const fall = (timeSec * 1.8 + i * 0.13) % 2.0;
      const p = projectPoint({ x: src.x + Math.sin(i + timeSec) * 0.15, y: src.y, z: Math.max(0.05, src.z - fall * 0.6) }, basis, camera, w, h);
      if (p.visible) {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath(); ctx.arc(p.sx, p.sy, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}

function draw3DCursor(
  ctx: CanvasRenderingContext2D,
  cursor: Vec3,
  basis: CameraBasis,
  camera: OrbitCamera,
  w: number,
  h: number
): void {
  const p = projectPoint(cursor, basis, camera, w, h);
  if (!p.visible) return;
  ctx.save();
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(p.sx, p.sy, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.arc(p.sx, p.sy, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: XL3DScene,
  engine: XL3DScene['render']['engine']
): void {
  if (engine !== 'workbench' && scene.world.mode === 'sky53') {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    const elev = clamp(scene.world.sunElevation / 90, 0.05, 1);
    grad.addColorStop(0, elev > 0.3 ? '#1e4276' : '#2a2244');
    grad.addColorStop(0.55, elev > 0.3 ? '#5a8dc2' : '#9c5244');
    grad.addColorStop(1, '#262b34');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else {
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.42, 30, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
    grad.addColorStop(0, engine !== 'workbench' ? '#232833' : '#30343c');
    grad.addColorStop(1, scene.world.horizonColor || '#1b1d22');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawFloorGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  basis: CameraBasis,
  cam: OrbitCamera
): void {
  const half = 6;
  ctx.lineWidth = 1;
  for (let i = -half; i <= half; i++) {
    const p1 = projectPoint({ x: -half, y: i, z: 0 }, basis, cam, w, h);
    const p2 = projectPoint({ x: half, y: i, z: 0 }, basis, cam, w, h);
    if (p1.visible && p2.visible) {
      ctx.strokeStyle = i === 0 ? 'rgba(235, 85, 85, 0.72)' : 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
    }
    const p3 = projectPoint({ x: i, y: -half, z: 0 }, basis, cam, w, h);
    const p4 = projectPoint({ x: i, y: half, z: 0 }, basis, cam, w, h);
    if (p3.visible && p4.visible) {
      ctx.strokeStyle = i === 0 ? 'rgba(85, 215, 110, 0.72)' : 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(p3.sx, p3.sy);
      ctx.lineTo(p4.sx, p4.sy);
      ctx.stroke();
    }
  }
}

function getPrimaryLightDir(lights: SceneObject[]): Vec3 {
  const l = lights[0];
  if (!l) return norm3({ x: 0.5, y: 0.4, z: 0.9 });
  return norm3({ x: l.location.x || 0.4, y: l.location.y || 0.3, z: Math.max(0.5, l.location.z || 1.2) });
}

function drawObjectGroundShadow(
  ctx: CanvasRenderingContext2D,
  worldPts: Vec3[],
  sunDir: Vec3,
  basis: CameraBasis,
  w: number,
  h: number,
  camera: OrbitCamera
): void {
  let sx = 0, sy = 0, cnt = 0;
  for (let i = 0; i < worldPts.length; i += Math.max(1, Math.floor(worldPts.length / 16))) {
    const wp = worldPts[i];
    const t = Math.max(0, wp.z) / Math.max(0.25, sunDir.z);
    const p = projectPoint({ x: wp.x - sunDir.x * t, y: wp.y - sunDir.y * t, z: 0.01 }, basis, camera, w, h);
    if (p.visible) {
      sx += p.sx;
      sy += p.sy;
      cnt++;
    }
  }
  if (cnt > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(sx / cnt, sy / cnt, 34, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function computeFaceShadingColor(
  mesh: MeshData,
  face: MeshData['faces'][number],
  worldNormal: Vec3,
  worldPos: Vec3,
  sunDir: Vec3,
  camForward: Vec3,
  engine: XL3DScene['render']['engine'],
  wbMode: XL3DScene['render']['workbenchShading'],
  mode: InteractionMode,
  paintState: PaintSettings,
  mat: MaterialData | undefined,
  scene: XL3DScene,
  isActive: boolean
): string {
  const v0 = mesh.vertices[face.verts[0]];
  let r = 0.72, g = 0.74, b = 0.78;

  if (mode === 'paint' && paintState.mode === 'vertex' && isActive) {
    r = v0.color[0]; g = v0.color[1]; b = v0.color[2];
  } else if (mode === 'paint' && paintState.mode === 'weight' && isActive) {
    const w = v0.weights[paintState.activeBoneId] ?? 0;
    r = clamp(w * 2 - 0.5, 0.1, 1);
    g = clamp(1 - Math.abs(w - 0.5) * 2, 0.1, 1);
    b = clamp(1 - w * 2, 0.1, 1);
  } else if (mode === 'sculpt' && isActive) {
    const tint = ((face.faceSet || 1) * 47 % 100) / 350;
    r = 0.78 - v0.mask * 0.45 + tint;
    g = 0.46 - v0.mask * 0.35;
    b = 0.36 - v0.mask * 0.25 + tint * 0.5;
  } else if (engine !== 'workbench') {
    [r, g, b] = evaluateMaterialColorAt(mat, v0.uv.x, v0.uv.y, worldPos);
    if (mat && mat.emissionStrength > 0.05) {
      r = clamp(r + mat.emissionStrength * 0.25, 0, 1);
      g = clamp(g + mat.emissionStrength * 0.22, 0, 1);
      b = clamp(b + mat.emissionStrength * 0.2, 0, 1);
    }
  } else {
    r = isActive ? 0.80 : 0.68;
    g = isActive ? 0.76 : 0.71;
    b = isActive ? 0.72 : 0.75;
  }

  const ndotl = Math.max(0.18, Math.abs(dot3(worldNormal, sunDir)) * 0.82 + 0.18);
  const rim = Math.pow(1 - Math.abs(dot3(worldNormal, camForward)), 2) * (mat?.sheen || 0.12);
  const ao = engine === 'cycles' ? 0.92 + 0.08 * worldNormal.z : 1.0;

  let fr = applyColorMgmt(r * ndotl * ao + rim * 0.3, scene.render.colorTransform, scene.render.exposure);
  let fg = applyColorMgmt(g * ndotl * ao + rim * 0.3, scene.render.colorTransform, scene.render.exposure);
  let fb = applyColorMgmt(b * ndotl * ao + rim * 0.3, scene.render.colorTransform, scene.render.exposure);

  if (mode === 'edit' && isActive && face.selected) {
    fr = fr * 0.65 + 0.35;
    fg = fg * 0.65 + 0.20;
    fb = fb * 0.65 + 0.04;
  }
  const alpha = mat && engine !== 'workbench' ? clamp(1 - mat.transmission * 0.55, 0.22, 1) : (wbMode === 'xray' ? 0.55 : 1);
  return `rgba(${Math.round(fr * 255)}, ${Math.round(fg * 255)}, ${Math.round(fb * 255)}, ${alpha.toFixed(2)})`;
}

function drawLattice(
  ctx: CanvasRenderingContext2D,
  animTr: { location: Vec3; rotation: Vec3; scale: Vec3 },
  basis: CameraBasis,
  camera: OrbitCamera,
  w: number,
  h: number,
  isActive: boolean
): void {
  const corners: Vec3[] = [
    { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 },
    { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 },
  ];
  const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const pts = corners.map((pt) => projectPoint(transformVec3(pt, animTr.location, animTr.rotation, animTr.scale), basis, camera, w, h));
  ctx.strokeStyle = isActive ? '#ff9c3a' : '#80c8ff';
  ctx.setLineDash([4, 3]);
  for (const [a, b] of edges) {
    if (pts[a].visible && pts[b].visible) {
      ctx.beginPath();
      ctx.moveTo(pts[a].sx, pts[a].sy);
      ctx.lineTo(pts[b].sx, pts[b].sy);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}

function drawHelperObject(
  ctx: CanvasRenderingContext2D,
  obj: SceneObject,
  animTr: { location: Vec3; rotation: Vec3; scale: Vec3 },
  basis: CameraBasis,
  camera: OrbitCamera,
  w: number,
  h: number,
  isActive: boolean
): void {
  const p = projectPoint(animTr.location, basis, camera, w, h);
  if (!p.visible) return;
  ctx.save();
  ctx.strokeStyle = isActive ? '#ff9e3b' : '#ffe07d';
  ctx.fillStyle = isActive ? '#ff9e3b' : '#ffe07d';
  ctx.lineWidth = 2;
  if (obj.type === 'light') {
    ctx.beginPath(); ctx.arc(p.sx, p.sy, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2); ctx.fill();
  } else if (obj.type === 'camera') {
    ctx.strokeRect(p.sx - 10, p.sy - 7, 20, 14);
  } else {
    ctx.beginPath();
    ctx.moveTo(p.sx - 12, p.sy); ctx.lineTo(p.sx + 12, p.sy);
    ctx.moveTo(p.sx, p.sy - 12); ctx.lineTo(p.sx, p.sy + 12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTransformGizmo(
  ctx: CanvasRenderingContext2D,
  origin: Vec3,
  basis: CameraBasis,
  camera: OrbitCamera,
  w: number,
  h: number
): void {
  const p0 = projectPoint(origin, basis, camera, w, h);
  if (!p0.visible) return;
  const axes: Array<{ dir: Vec3; color: string; label: string }> = [
    { dir: { x: 1.15, y: 0, z: 0 }, color: '#ff4b55', label: 'X' },
    { dir: { x: 0, y: 1.15, z: 0 }, color: '#4ad66d', label: 'Y' },
    { dir: { x: 0, y: 0, z: 1.15 }, color: '#4a9eff', label: 'Z' },
  ];
  ctx.save();
  ctx.lineWidth = 3;
  ctx.font = '700 11px Inter, sans-serif';
  for (const ax of axes) {
    const p1 = projectPoint(add3(origin, ax.dir), basis, camera, w, h);
    if (!p1.visible) continue;
    ctx.strokeStyle = ax.color;
    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    ctx.lineTo(p1.sx, p1.sy);
    ctx.stroke();
    ctx.fillStyle = ax.color;
    ctx.beginPath();
    ctx.arc(p1.sx, p1.sy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(ax.label, p1.sx - 3.5, p1.sy + 4);
  }
  ctx.restore();
}

// Accurate Moller-Trumbore Raycast against frontmost mesh triangles (fixes back-face mirroring/picking)
export function pickSceneAtScreen(
  sx: number,
  sy: number,
  w: number,
  h: number,
  scene: XL3DScene,
  camera: OrbitCamera,
  preferredObjectId?: string | null
): ScreenPickResult | null {
  const basis = getCameraBasis(camera);
  const ray = screenToRay(sx, sy, w, h, basis, camera);
  const timeSec = (scene.currentFrame - 1) / Math.max(1, scene.fps);

  let bestT = Infinity;
  let result: ScreenPickResult | null = null;

  for (const obj of scene.objects) {
    if (!obj.visible) continue;
    if (preferredObjectId && obj.id !== preferredObjectId) continue;

    const animTr = evaluateAnimatedTransform(obj, scene.currentFrame, scene.fps);

    if (obj.mesh && obj.mesh.faces.length > 0) {
      const mesh = evaluateModifierStack(obj, timeSec) ?? obj.mesh;
      const worldPts = mesh.vertices.map((v) => transformVec3(v.pos, animTr.location, animTr.rotation, animTr.scale));

      for (let fi = 0; fi < mesh.faces.length; fi++) {
        const f = mesh.faces[fi];
        if (f.hidden || f.verts.length < 3) continue;
        const w0 = worldPts[f.verts[0]];

        for (let ti = 1; ti < f.verts.length - 1; ti++) {
          const w1 = worldPts[f.verts[ti]];
          const w2 = worldPts[f.verts[ti + 1]];
          const fn = norm3({
            x: (w1.y - w0.y) * (w2.z - w0.z) - (w1.z - w0.z) * (w2.y - w0.y),
            y: (w1.z - w0.z) * (w2.x - w0.x) - (w1.x - w0.x) * (w2.z - w0.z),
            z: (w1.x - w0.x) * (w2.y - w0.y) - (w1.y - w0.y) * (w2.x - w0.x),
          });
          // Skip back-facing triangles so picking/sculpting always hits the camera-facing front surface
          if (dot3(fn, ray.dir) > 0.05) continue;

          const t = intersectRayTriangle(ray.origin, ray.dir, w0, w1, w2);
          if (t !== null && t < bestT) {
            bestT = t;
            const hitWorld = add3(ray.origin, { x: ray.dir.x * t, y: ray.dir.y * t, z: ray.dir.z * t });
            const hitLocal = inverseTransformVec3(hitWorld, animTr.location, animTr.rotation, animTr.scale);
            result = { objectId: obj.id, hitWorld, hitLocal, faceIdx: fi, depth: t };
          }
        }
      }
    } else if (!preferredObjectId) {
      const center = animTr.location;
      const toObj = sub3(center, ray.origin);
      const tProj = Math.max(0.1, dot3(toObj, ray.dir));
      const closest = add3(ray.origin, { x: ray.dir.x * tProj, y: ray.dir.y * tProj, z: ray.dir.z * tProj });
      const radialDist = Math.hypot(closest.x - center.x, closest.y - center.y, closest.z - center.z);
      if (radialDist < 1.1 && tProj < bestT) {
        bestT = tProj;
        const hitLocal = inverseTransformVec3(closest, animTr.location, animTr.rotation, animTr.scale);
        result = { objectId: obj.id, hitWorld: closest, hitLocal, faceIdx: 0, depth: tProj };
      }
    }
  }
  return result;
}
