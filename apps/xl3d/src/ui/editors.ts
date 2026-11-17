import type {
  BakeType,
  CameraInputSpace,
  ColorTransform,
  ModifierType,
  PhysicsType,
  ProcTextureType,
  RenderEngine,
  SculptBrush,
  SubEditorKind,
  TextureBrushType,
  WorkbenchShading,
} from '../core/types';
import {
  ASSET_BROWSER_PRESETS,
  exportPointCloudToSPZ,
  exportSceneToGLB,
  exportSceneToOBJ,
  exportSceneToPLY,
  exportSceneToSTL,
  importOBJToMeshObject,
} from '../engine/ioFormats';
import { exportVseToOtio } from '../engine/physicsAndAnim';
import { store } from '../state/xl3dStore';

function downloadBlob(filename: string, data: BlobPart, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function mountEditorPanel(container: HTMLElement): () => void {
  let isDraggingSlider = false;

  const render = () => {
    if (isDraggingSlider) return;
    const tab = store.activeTab;
    const obj = store.getActiveObject();
    const mat = store.getActiveMaterial();

    let html = '';
    if (tab === 'tools') html = renderToolsTab(obj);
    else if (tab === 'outliner') html = renderOutlinerTab();
    else if (tab === 'properties') html = renderPropertiesTab(obj, mat);
    else if (tab === 'nodes') html = renderNodesTab(mat);
    else if (tab === 'animation') html = renderAnimationTab(obj);
    else html = renderEditorsHubTab();

    container.innerHTML = html;
    bindInteractions(container, () => isDraggingSlider, (v) => { isDraggingSlider = v; });
  };

  render();
  const unsub = store.subscribe(render);
  return () => unsub();
}

function renderToolsTab(obj: ReturnType<typeof store.getActiveObject>): string {
  const d = store.t();
  const mode = store.mode;
  const editOpsList = [
    ['extrude', 'Extrude'], ['inset', 'Inset'], ['bevel', 'Bevel'],
    ['loopcut', 'Loop Cut'], ['knife', 'Knife / Bisect'], ['bridge', 'Bridge / Fill'],
    ['merge', 'Merge Center'], ['dissolve', 'Dissolve'], ['spin', 'Spin'],
    ['polybuild', 'Poly Build'], ['subdivide', 'Subdivide'], ['triangulate', 'Triangulate'],
    ['tris_to_quads', 'Tris→Quads'], ['shrink_fatten', 'Shrink/Fatten'], ['smooth_verts', 'Smooth'],
    ['looptools_circle', 'LoopTools Circle (5.2)'], ['looptools_flatten', 'LoopTools Flatten (5.2)'],
    ['looptools_space', 'LoopTools Space (5.2)'],
    ['shade_smooth', 'Shade Smooth Angle'], ['shade_flat', 'Shade Flat'],
    ['uv_unwrap', 'UV Unwrap'], ['uv_smart', 'Smart UV Project'], ['mark_seam', 'Mark Seam'], ['uv_pack', 'Pack Islands'],
  ];

  const sculptBrushes: Array<[SculptBrush, string]> = [
    ['draw', 'Draw'], ['clay', 'Clay'], ['inflate', 'Inflate'],
    ['crease', 'Crease'], ['smooth', 'Smooth'], ['grab', 'Grab'],
    ['snakeHook', 'Snake Hook'], ['pinch', 'Pinch'], ['cloth', 'Cloth'],
    ['boundary', 'Boundary'], ['pose', 'Pose'], ['elasticDeform', 'Elastic'],
    ['multiplaneScrape', 'MultiScrape'], ['sceneProject', 'Scene Project (5.2)'],
  ];

  const paintBrushes: Array<[TextureBrushType, string]> = [
    ['draw', 'Draw'], ['soften', 'Soften'], ['smear', 'Smear'],
    ['clone', 'Clone'], ['mask', 'Mask'], ['projCamera', 'Project Cam'],
  ];

  const bakes: BakeType[] = ['combined', 'diffuse', 'normal', 'ao', 'roughness', 'position', 'uv'];

  return `
    <div class="xl-panel-stack">
      <div class="xl-section-card">
        <div class="xl-card-title">${d.tabs.tools} · ${obj ? obj.name : '—'}</div>
        <div class="xl-chip-row">
          <button class="xl-btn ${mode === 'edit' ? 'xl-btn-primary' : ''}" data-set-mode="edit">${d.modes.edit}</button>
          <button class="xl-btn ${mode === 'sculpt' ? 'xl-btn-primary' : ''}" data-set-mode="sculpt">${d.modes.sculpt}</button>
          <button class="xl-btn ${mode === 'paint' && store.paint.mode === 'vertex' ? 'xl-btn-primary' : ''}" data-paint-mode="vertex">Vertex Paint</button>
          <button class="xl-btn ${mode === 'paint' && store.paint.mode === 'weight' ? 'xl-btn-primary' : ''}" data-paint-mode="weight">Weight Paint</button>
          <button class="xl-btn ${mode === 'paint' && store.paint.mode === 'texture' ? 'xl-btn-primary' : ''}" data-paint-mode="texture">Texture Paint</button>
          <button class="xl-btn ${mode === 'pose' ? 'xl-btn-primary' : ''}" data-set-mode="pose">${d.modes.pose}</button>
        </div>
      </div>

      ${mode === 'sculpt' ? `
        <div class="xl-section-card">
          <div class="xl-card-title">${d.sculptBrushesTitle}</div>
          <div class="xl-grid-3">
            ${sculptBrushes.map(([id, label]) => `<button class="xl-btn ${store.sculpt.brush === id ? 'xl-btn-primary' : ''}" data-sculpt-brush="${id}">${label}</button>`).join('')}
          </div>
          <div class="xl-slider-row">
            <label>Radius (${store.sculpt.radius.toFixed(2)})</label>
            <input type="range" min="0.1" max="2.5" step="0.05" value="${store.sculpt.radius}" data-live="sculpt_radius" />
          </div>
          <div class="xl-slider-row">
            <label>Strength (${store.sculpt.strength.toFixed(2)})</label>
            <input type="range" min="0.05" max="1.5" step="0.05" value="${store.sculpt.strength}" data-live="sculpt_strength" />
          </div>
          <div class="xl-chip-row">
            <button class="xl-chip ${store.sculpt.symX ? 'active' : ''}" data-sym="symX">Sym X</button>
            <button class="xl-chip ${store.sculpt.symY ? 'active' : ''}" data-sym="symY">Sym Y</button>
            <button class="xl-chip ${store.sculpt.symZ ? 'active' : ''}" data-sym="symZ">Sym Z</button>
            <button class="xl-chip ${store.sculpt.invert ? 'active' : ''}" data-sym="invert">Invert</button>
            <button class="xl-btn" data-sculpt-util="toggle_dyntopo">Dyntopo: ${store.sculpt.dyntopo ? 'ON' : 'OFF'}</button>
            <button class="xl-btn" data-sculpt-util="voxel_remesh">Voxel Remesh</button>
            <button class="xl-btn" data-sculpt-util="quad_remesh">Quad Remesh</button>
            <button class="xl-btn" data-sculpt-util="multires_subdiv">Multires +1</button>
            <button class="xl-btn" data-sculpt-util="mask_dab">Paint Mask</button>
            <button class="xl-btn" data-sculpt-util="clear_mask">Clear Mask</button>
            <button class="xl-btn" data-sculpt-util="invert_mask">Invert Mask</button>
          </div>
        </div>
      ` : mode === 'paint' ? `
        <div class="xl-section-card">
          <div class="xl-card-title">${d.paintTitle} (${store.paint.mode})</div>
          <div class="xl-grid-3">
            ${paintBrushes.map(([id, label]) => `<button class="xl-btn ${store.paint.brush === id ? 'xl-btn-primary' : ''}" data-paint-brush="${id}">${label}</button>`).join('')}
          </div>
          <div class="xl-slider-row">
            <label>Color / Weight (${store.paintWeightValue.toFixed(2)})</label>
            <input type="color" value="${store.paint.color}" data-live="paint_color" />
            <input type="range" min="0" max="1" step="0.05" value="${store.paintWeightValue}" data-live="paint_weight" />
          </div>
          <div class="xl-card-subtitle">${d.bakeTitle}</div>
          <div class="xl-chip-row">
            ${bakes.map((b) => `<button class="xl-btn" data-bake="${b}">Bake ${b.toUpperCase()}</button>`).join('')}
          </div>
          ${store.lastBakeUrl ? `
            <div class="xl-bake-preview">
              <img src="${store.lastBakeUrl}" alt="Bake map" />
              <span>Baked Map (128×128)</span>
            </div>
          ` : ''}
        </div>
      ` : `
        <div class="xl-section-card">
          <div class="xl-card-title">${d.editOpsTitle}</div>
          <div class="xl-chip-row" style="margin-bottom:8px;">
            <button class="xl-chip ${store.editSelectMode === 'vertex' ? 'active' : ''}" data-esm="vertex">${d.selectModes.vertex}</button>
            <button class="xl-chip ${store.editSelectMode === 'edge' ? 'active' : ''}" data-esm="edge">${d.selectModes.edge}</button>
            <button class="xl-chip ${store.editSelectMode === 'face' ? 'active' : ''}" data-esm="face">${d.selectModes.face}</button>
            <button class="xl-chip" data-edit-op="select_all">All</button>
            <button class="xl-chip" data-edit-op="select_invert">Invert</button>
            <button class="xl-chip" data-edit-op="select_loop">Loop</button>
            <button class="xl-chip" data-edit-op="select_similar">Similar</button>
            <button class="xl-chip" data-edit-op="select_checker">Checker</button>
          </div>
          <div class="xl-grid-3">
            ${editOpsList.map(([id, label]) => `<button class="xl-btn" data-edit-op="${id}">${label}</button>`).join('')}
          </div>
        </div>
      `}
    </div>
  `;
}

function renderOutlinerTab(): string {
  const d = store.t();
  return `
    <div class="xl-panel-stack">
      <div class="xl-section-card">
        <div class="xl-card-title">${d.tabs.outliner} (${store.scene.objects.length})</div>
        <div class="xl-outliner-list">
          ${store.scene.objects.map((o) => `
            <div class="xl-outliner-item ${o.id === store.scene.activeObjectId ? 'active' : ''}" data-select-obj="${o.id}">
              <span>${o.type.toUpperCase()} · <strong>${o.name}</strong></span>
              <button class="xl-chip" data-toggle-vis="${o.id}">${o.visible ? '👁' : '🙈'}</button>
            </div>
          `).join('')}
        </div>
        <div class="xl-chip-row" style="margin-top:10px;">
          <button class="xl-btn" id="xl-dup-obj">${d.duplicateObj}</button>
          <button class="xl-btn xl-btn-danger" id="xl-del-obj">${d.deleteObj}</button>
        </div>
      </div>
    </div>
  `;
}

function renderPropertiesTab(
  obj: ReturnType<typeof store.getActiveObject>,
  mat: ReturnType<typeof store.getActiveMaterial>
): string {
  const d = store.t();
  const mods: ModifierType[] = [
    'subsurf', 'mirror', 'solidify', 'bevel', 'array', 'boolean',
    'decimate', 'remesh', 'displace', 'wireframe', 'cast', 'screw',
    'weightedNormal', 'geometryNodes',
  ];
  const physicsTypes: PhysicsType[] = ['none', 'rigidBody', 'cloth', 'softBody', 'fluid', 'particles', 'hair', 'forceField'];
  const engines: RenderEngine[] = ['workbench', 'eevee', 'cycles'];
  const wbModes: WorkbenchShading[] = ['solid', 'wireframe', 'matcap', 'xray', 'cavity', 'outline'];
  const cms: ColorTransform[] = ['agx', 'filmic', 'aces', 'standard', 'wideGamut'];
  const camSpaces: CameraInputSpace[] = ['sRGB', 'AppleLog', 'ARRI_LogC4', 'Blackmagic', 'CanonLog2', 'SonySLog3'];

  return `
    <div class="xl-panel-stack">
      ${obj ? `
        <div class="xl-section-card">
          <div class="xl-card-title">Transform · ${obj.name}</div>
          ${(['location', 'rotation', 'scale'] as const).map((sec) => `
            <div class="xl-tr-group">
              <div class="xl-card-subtitle">${sec}</div>
              ${(['x', 'y', 'z'] as const).map((ax) => `
                <div class="xl-slider-row">
                  <label>${ax.toUpperCase()}: ${obj[sec][ax].toFixed(2)}</label>
                  <input type="range"
                    min="${sec === 'rotation' ? -180 : sec === 'scale' ? 0.1 : -6}"
                    max="${sec === 'rotation' ? 180 : sec === 'scale' ? 4 : 6}"
                    step="${sec === 'rotation' ? 1 : 0.05}"
                    value="${obj[sec][ax]}"
                    data-tr="${sec}:${ax}" />
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>

        <div class="xl-section-card">
          <div class="xl-card-title">${d.modifiersTitle} (${obj.modifiers.length})</div>
          <div class="xl-chip-row" style="margin-bottom:8px;">
            ${mods.map((m) => `<button class="xl-chip" data-add-mod="${m}">＋ ${m}</button>`).join('')}
          </div>
          ${obj.modifiers.map((m) => `
            <div class="xl-mod-row">
              <strong>${m.name}</strong>
              <div>
                <button class="xl-chip ${m.enabled ? 'active' : ''}" data-toggle-mod="${m.id}">${m.enabled ? 'ON' : 'OFF'}</button>
                <button class="xl-chip" data-del-mod="${m.id}">✕</button>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="xl-section-card">
          <div class="xl-card-title">${d.physicsTitle}</div>
          <div class="xl-chip-row">
            ${physicsTypes.map((pt) => `<button class="xl-chip ${obj.physics.type === pt ? 'active' : ''}" data-phys-type="${pt}">${pt}</button>`).join('')}
          </div>
          ${obj.mesh ? `<div style="margin-top:8px;"><button class="xl-btn" id="xl-add-shapekey">＋ Shape Key (${obj.shapeKeys.length})</button></div>` : ''}
        </div>
      ` : ''}

      ${mat ? `
        <div class="xl-section-card">
          <div class="xl-card-title">${d.materialsTitle}</div>
          <div class="xl-slider-row">
            <label>Base Color</label>
            <input type="color" value="${mat.baseColor}" data-mat="baseColor" />
          </div>
          <div class="xl-slider-row">
            <label>Metallic (${mat.metallic.toFixed(2)})</label>
            <input type="range" min="0" max="1" step="0.02" value="${mat.metallic}" data-mat="metallic" />
          </div>
          <div class="xl-slider-row">
            <label>Roughness (${mat.roughness.toFixed(2)})</label>
            <input type="range" min="0" max="1" step="0.02" value="${mat.roughness}" data-mat="roughness" />
          </div>
          <div class="xl-slider-row">
            <label>Transmission (${mat.transmission.toFixed(2)})</label>
            <input type="range" min="0" max="1" step="0.02" value="${mat.transmission}" data-mat="transmission" />
          </div>
          <div class="xl-slider-row">
            <label>Glass Dispersion 5.3 (${mat.dispersion.toFixed(2)})</label>
            <input type="range" min="0" max="1" step="0.02" value="${mat.dispersion}" data-mat="dispersion" />
          </div>
          <div class="xl-slider-row">
            <label>Anisotropy 5.3 (${mat.anisotropy.toFixed(2)})</label>
            <input type="range" min="0" max="1" step="0.02" value="${mat.anisotropy}" data-mat="anisotropy" />
          </div>
          <div class="xl-chip-row">
            <button class="xl-chip ${mat.thinWall ? 'active' : ''}" data-mat-toggle="thinWall">Thin Wall (5.2)</button>
            <button class="xl-chip ${mat.shaderToRgb ? 'active' : ''}" data-mat-toggle="shaderToRgb">Shader to RGB</button>
            <button class="xl-chip ${mat.oslEnabled ? 'active' : ''}" data-mat-toggle="oslEnabled">OSL Shader</button>
          </div>
        </div>
      ` : ''}

      <div class="xl-section-card">
        <div class="xl-card-title">${d.renderSettingsTitle}</div>
        <div class="xl-chip-row">
          ${engines.map((eg) => `<button class="xl-chip ${store.scene.render.engine === eg ? 'active' : ''}" data-engine="${eg}">${eg.toUpperCase()}</button>`).join('')}
        </div>
        <div class="xl-card-subtitle">Workbench Shading</div>
        <div class="xl-chip-row">
          ${wbModes.map((wb) => `<button class="xl-chip ${store.scene.render.workbenchShading === wb ? 'active' : ''}" data-wb="${wb}">${wb}</button>`).join('')}
        </div>
        <div class="xl-card-subtitle">Color Management & 5.2 Camera Input Space</div>
        <div class="xl-chip-row">
          ${cms.map((cm) => `<button class="xl-chip ${store.scene.render.colorTransform === cm ? 'active' : ''}" data-cm="${cm}">${cm.toUpperCase()}</button>`).join('')}
        </div>
        <div class="xl-chip-row" style="margin-top:6px;">
          ${camSpaces.map((cs) => `<button class="xl-chip ${store.scene.render.inputSpace === cs ? 'active' : ''}" data-camspace="${cs}">${cs}</button>`).join('')}
        </div>
        <div class="xl-chip-row" style="margin-top:8px;">
          <button class="xl-chip ${store.scene.render.freestyle ? 'active' : ''}" id="xl-toggle-freestyle">Freestyle</button>
          <button class="xl-chip ${store.scene.render.textureCache52 ? 'active' : ''}" id="xl-toggle-cache">Texture Cache 5.2</button>
          <button class="xl-chip ${store.scene.world.mode === 'sky53' ? 'active' : ''}" id="xl-toggle-sky">Sky 5.3 + Fog</button>
        </div>
      </div>
    </div>
  `;
}

function renderNodesTab(mat: ReturnType<typeof store.getActiveMaterial>): string {
  const d = store.t();
  const procTex: ProcTextureType[] = ['none', 'noise', 'voronoi', 'wave', 'musgrave', 'checker', 'brick', 'magic'];
  const activeGraph = store.scene.nodeGraphs.find((g) => g.id === store.scene.activeNodeGraphId) ?? store.scene.nodeGraphs[0];

  return `
    <div class="xl-panel-stack">
      <div class="xl-section-card">
        <div class="xl-card-title">${d.nodeGraphTitle}</div>
        <div class="xl-chip-row">
          ${store.scene.nodeGraphs.map((g) => `<button class="xl-btn ${g.id === activeGraph?.id ? 'xl-btn-primary' : ''}" data-graph-id="${g.id}">${g.name}</button>`).join('')}
        </div>
      </div>

      ${activeGraph?.graphKind === 'shader' && mat ? `
        <div class="xl-section-card">
          <div class="xl-card-title">Shader Nodes · ${mat.name}</div>
          <div class="xl-card-subtitle">Procedural Textures</div>
          <div class="xl-chip-row">
            ${procTex.map((pt) => `<button class="xl-chip ${mat.procTexture === pt ? 'active' : ''}" data-proc-tex="${pt}">${pt.toUpperCase()}</button>`).join('')}
          </div>
          <div class="xl-slider-row">
            <label>Texture Scale (${mat.procScale.toFixed(1)})</label>
            <input type="range" min="1" max="16" step="0.5" value="${mat.procScale}" data-mat="procScale" />
          </div>
        </div>
      ` : ''}

      ${activeGraph ? `
        <div class="xl-section-card">
          <div class="xl-card-title">${activeGraph.name}</div>
          <div class="xl-node-graph">
            ${activeGraph.nodes.map((n) => `
              <div class="xl-node-box">
                <strong>${n.label}</strong>
                <span>${n.kind}</span>
              </div>
            `).join('')}
          </div>
          ${activeGraph.graphKind === 'geometry' ? `<button class="xl-btn xl-btn-primary" id="xl-attach-gn">Attach Geometry Nodes to Active Mesh</button>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAnimationTab(obj: ReturnType<typeof store.getActiveObject>): string {
  const d = store.t();
  const s = store.scene;
  return `
    <div class="xl-panel-stack">
      <div class="xl-section-card">
        <div class="xl-card-title">${d.animTitle} · Frame ${s.currentFrame} / ${s.endFrame} (${s.fps} FPS)</div>
        <div class="xl-chip-row">
          <button class="xl-btn xl-btn-primary" id="xl-play-btn">${store.isPlaying ? '⏸ Pause' : '▶ Play'}</button>
          <button class="xl-btn" id="xl-keyframe-btn">◆ Insert Keyframe</button>
          <button class="xl-btn" id="xl-gsmooth-btn">F-Curve Gaussian Smooth (5.1)</button>
        </div>
        <div class="xl-slider-row">
          <label>Scrub Frame</label>
          <input type="range" min="${s.startFrame}" max="${s.endFrame}" step="1" value="${s.currentFrame}" data-live="timeline_frame" />
        </div>
      </div>

      <div class="xl-section-card">
        <div class="xl-card-title">Armature, Rigify & IK / Drivers</div>
        <div class="xl-chip-row">
          <button class="xl-btn xl-btn-primary" id="xl-rigify-btn">Generate Rigify Humanoid</button>
          <button class="xl-btn" id="xl-ik-up">IK Target +Z</button>
          <button class="xl-btn" id="xl-ik-down">IK Target -Z</button>
          <button class="xl-btn" id="xl-add-driver">＋ Driver sin(frame*0.1)</button>
        </div>
        <div class="xl-card-subtitle">Active Object Keyframes: ${obj ? Object.keys(obj.keyframes).length : 0} · Drivers: ${obj ? Object.keys(obj.drivers).length : 0}</div>
      </div>
    </div>
  `;
}

function renderEditorsHubTab(): string {
  const d = store.t();
  const sub = store.activeSubEditor;
  const subs: Array<[SubEditorKind, string]> = [
    ['assets', 'Asset Browser & I/O'],
    ['vse', 'VSE 5.3 & Tracking'],
    ['spreadsheet', 'Spreadsheet'],
    ['preferences', 'Preferences'],
  ];

  return `
    <div class="xl-panel-stack">
      <div class="xl-section-card">
        <div class="xl-chip-row">
          ${subs.map(([id, lbl]) => `<button class="xl-btn ${sub === id ? 'xl-btn-primary' : ''}" data-sub-ed="${id}">${lbl}</button>`).join('')}
        </div>
      </div>

      ${sub === 'vse' ? `
        <div class="xl-section-card">
          <div class="xl-card-title">${d.vseTitle}</div>
          <div class="xl-chip-row">
            <button class="xl-btn" id="xl-vse-blade">✂ Blade 2.0 @ Frame ${store.scene.currentFrame}</button>
            <button class="xl-btn" id="xl-vse-ripple">Ripple Delete Last</button>
            <button class="xl-btn xl-btn-primary" id="xl-vse-otio">Export OTIO</button>
          </div>
          <div class="xl-vse-tracks">
            ${store.scene.vse.clips.map((c) => `
              <div class="xl-vse-strip">CH${c.track} · <strong>${c.name}</strong> [${c.startFrame}..${c.startFrame + c.durationFrames}]</div>
            `).join('')}
          </div>
        </div>
      ` : sub === 'spreadsheet' ? `
        <div class="xl-section-card">
          <div class="xl-card-title">${d.spreadsheetTitle}</div>
          <div class="xl-table-wrap">
            <table class="xl-table">
              <thead><tr><th>Name</th><th>Type</th><th>Verts</th><th>Faces</th><th>Loc Z</th></tr></thead>
              <tbody>
                ${store.scene.objects.map((o) => `
                  <tr>
                    <td>${o.name}</td>
                    <td>${o.type}</td>
                    <td>${o.mesh?.vertices.length ?? o.pointCloud?.points.length ?? '—'}</td>
                    <td>${o.mesh?.faces.length ?? '—'}</td>
                    <td>${o.location.z.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : sub === 'preferences' ? `
        <div class="xl-section-card">
          <div class="xl-card-title">${d.prefsTitle}</div>
          <div class="xl-chip-row">
            <button class="xl-btn ${store.theme === 'dark' ? 'xl-btn-primary' : ''}" data-theme="dark">${d.themeDark}</button>
            <button class="xl-btn ${store.theme === 'light' ? 'xl-btn-primary' : ''}" data-theme="light">${d.themeLight}</button>
            <button class="xl-btn ${store.locale === 'ru' ? 'xl-btn-primary' : ''}" data-lang="ru">Русский (RU)</button>
            <button class="xl-btn ${store.locale === 'en' ? 'xl-btn-primary' : ''}" data-lang="en">English (EN)</button>
          </div>
        </div>
      ` : `
        <div class="xl-section-card">
          <div class="xl-card-title">${d.assetBrowserTitle}</div>
          <div class="xl-grid-3">
            ${ASSET_BROWSER_PRESETS.map((p) => `<button class="xl-btn" data-preset="${p.id}">＋ ${p.name}</button>`).join('')}
          </div>
          <div class="xl-chip-row" style="margin-top:10px;">
            <button class="xl-btn xl-btn-primary" data-export="obj">Export .OBJ</button>
            <button class="xl-btn" data-export="stl">Export .STL</button>
            <button class="xl-btn" data-export="ply">Export .PLY</button>
            <button class="xl-btn" data-export="glb">Export .GLB</button>
            <button class="xl-btn" data-export="spz">Export .SPZ</button>
            <label class="xl-btn" style="cursor:pointer;">Import .OBJ <input type="file" accept=".obj" id="xl-import-obj" hidden /></label>
          </div>
        </div>
      `}
    </div>
  `;
}

function bindInteractions(
  container: HTMLElement,
  getDrag: () => boolean,
  setDrag: (v: boolean) => void
): void {
  container.querySelectorAll('[data-set-mode]').forEach((el) =>
    el.addEventListener('click', () => store.setMode((el as HTMLElement).dataset.setMode as any))
  );
  container.querySelectorAll('[data-paint-mode]').forEach((el) =>
    el.addEventListener('click', () => store.setPaintMode((el as HTMLElement).dataset.paintMode as any))
  );
  container.querySelectorAll('[data-esm]').forEach((el) =>
    el.addEventListener('click', () => store.setEditSelectMode((el as HTMLElement).dataset.esm as any))
  );
  container.querySelectorAll('[data-edit-op]').forEach((el) =>
    el.addEventListener('click', () => store.runEditOp((el as HTMLElement).dataset.editOp!))
  );
  container.querySelectorAll('[data-sculpt-brush]').forEach((el) =>
    el.addEventListener('click', () => store.setSculptBrush((el as HTMLElement).dataset.sculptBrush as SculptBrush))
  );
  container.querySelectorAll('[data-sculpt-util]').forEach((el) =>
    el.addEventListener('click', () => store.runSculptUtility((el as HTMLElement).dataset.sculptUtil as any))
  );
  container.querySelectorAll('[data-sym]').forEach((el) =>
    el.addEventListener('click', () => {
      const s = (el as HTMLElement).dataset.sym!;
      if (s === 'invert') store.sculpt.invert = !store.sculpt.invert;
      else if (s === 'symX' || s === 'symY' || s === 'symZ') store.sculpt[s] = !store.sculpt[s];
      store.commitLiveChange();
    })
  );
  container.querySelectorAll('[data-paint-brush]').forEach((el) =>
    el.addEventListener('click', () => store.setPaintBrush((el as HTMLElement).dataset.paintBrush as TextureBrushType))
  );
  container.querySelectorAll('[data-bake]').forEach((el) =>
    el.addEventListener('click', () => store.runBake((el as HTMLElement).dataset.bake as BakeType))
  );

  container.querySelectorAll('[data-select-obj]').forEach((el) =>
    el.addEventListener('click', () => store.setActiveObject((el as HTMLElement).dataset.selectObj!))
  );
  container.querySelectorAll('[data-toggle-vis]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      store.toggleObjectVisibility((el as HTMLElement).dataset.toggleVis!);
    })
  );
  container.querySelector('#xl-dup-obj')?.addEventListener('click', () => store.duplicateActiveObject());
  container.querySelector('#xl-del-obj')?.addEventListener('click', () => store.deleteActiveObject());
  container.querySelector('#xl-add-shapekey')?.addEventListener('click', () => store.addShapeKey());

  container.querySelectorAll('[data-add-mod]').forEach((el) =>
    el.addEventListener('click', () => store.addModifier((el as HTMLElement).dataset.addMod as ModifierType))
  );
  container.querySelectorAll('[data-toggle-mod]').forEach((el) =>
    el.addEventListener('click', () => store.toggleModifier((el as HTMLElement).dataset.toggleMod!))
  );
  container.querySelectorAll('[data-del-mod]').forEach((el) =>
    el.addEventListener('click', () => store.removeModifier((el as HTMLElement).dataset.delMod!))
  );
  container.querySelectorAll('[data-phys-type]').forEach((el) =>
    el.addEventListener('click', () => store.setPhysics({ type: (el as HTMLElement).dataset.physType as PhysicsType }))
  );

  container.querySelectorAll('[data-mat-toggle]').forEach((el) =>
    el.addEventListener('click', () => {
      const k = (el as HTMLElement).dataset.matToggle as 'thinWall' | 'shaderToRgb' | 'oslEnabled';
      const cur = store.getActiveMaterial();
      if (cur) store.updateMaterial({ [k]: !cur[k] });
    })
  );
  container.querySelectorAll('[data-engine]').forEach((el) =>
    el.addEventListener('click', () => {
      store.scene.render.engine = (el as HTMLElement).dataset.engine as RenderEngine;
      store.commitLiveChange();
    })
  );
  container.querySelectorAll('[data-wb]').forEach((el) =>
    el.addEventListener('click', () => {
      store.scene.render.workbenchShading = (el as HTMLElement).dataset.wb as WorkbenchShading;
      store.commitLiveChange();
    })
  );
  container.querySelectorAll('[data-cm]').forEach((el) =>
    el.addEventListener('click', () => {
      store.scene.render.colorTransform = (el as HTMLElement).dataset.cm as ColorTransform;
      store.commitLiveChange();
    })
  );
  container.querySelectorAll('[data-camspace]').forEach((el) =>
    el.addEventListener('click', () => {
      store.scene.render.inputSpace = (el as HTMLElement).dataset.camspace as CameraInputSpace;
      store.commitLiveChange();
    })
  );
  container.querySelector('#xl-toggle-freestyle')?.addEventListener('click', () => {
    store.scene.render.freestyle = !store.scene.render.freestyle;
    store.commitLiveChange();
  });
  container.querySelector('#xl-toggle-cache')?.addEventListener('click', () => {
    store.scene.render.textureCache52 = !store.scene.render.textureCache52;
    store.commitLiveChange();
  });
  container.querySelector('#xl-toggle-sky')?.addEventListener('click', () => {
    store.scene.world.mode = store.scene.world.mode === 'sky53' ? 'solid' : 'sky53';
    store.scene.world.fogDensity = store.scene.world.mode === 'sky53' ? 0.15 : 0;
    store.commitLiveChange();
  });

  container.querySelectorAll('[data-graph-id]').forEach((el) =>
    el.addEventListener('click', () => {
      store.scene.activeNodeGraphId = (el as HTMLElement).dataset.graphId!;
      store.commitLiveChange();
    })
  );
  container.querySelectorAll('[data-proc-tex]').forEach((el) =>
    el.addEventListener('click', () => store.updateMaterial({ procTexture: (el as HTMLElement).dataset.procTex as ProcTextureType }))
  );
  container.querySelector('#xl-attach-gn')?.addEventListener('click', () => store.addModifier('geometryNodes'));

  container.querySelector('#xl-play-btn')?.addEventListener('click', () => store.togglePlayback());
  container.querySelector('#xl-keyframe-btn')?.addEventListener('click', () => store.insertTransformKeyframe());
  container.querySelector('#xl-gsmooth-btn')?.addEventListener('click', () => store.applyGaussianSmoothToFCurves());
  container.querySelector('#xl-rigify-btn')?.addEventListener('click', () => store.generateRigifyOnScene());
  container.querySelector('#xl-ik-up')?.addEventListener('click', () => store.nudgeIKHand(0.25));
  container.querySelector('#xl-ik-down')?.addEventListener('click', () => store.nudgeIKHand(-0.25));
  container.querySelector('#xl-add-driver')?.addEventListener('click', () => store.addDriver('sin(frame*0.1)'));

  container.querySelectorAll('[data-sub-ed]').forEach((el) =>
    el.addEventListener('click', () => store.setActiveSubEditor((el as HTMLElement).dataset.subEd as SubEditorKind))
  );
  container.querySelector('#xl-vse-blade')?.addEventListener('click', () => store.vseCutSelectedAtCurrentFrame());
  container.querySelector('#xl-vse-ripple')?.addEventListener('click', () => store.vseRippleDeleteLast());
  container.querySelector('#xl-vse-otio')?.addEventListener('click', () => downloadBlob('timeline.otio', exportVseToOtio(store.scene), 'application/json'));
  container.querySelectorAll('[data-theme]').forEach((el) =>
    el.addEventListener('click', () => store.setLocaleAndTheme(undefined, (el as HTMLElement).dataset.theme as 'dark' | 'light'))
  );
  container.querySelectorAll('[data-lang]').forEach((el) =>
    el.addEventListener('click', () => store.setLocaleAndTheme((el as HTMLElement).dataset.lang as 'ru' | 'en'))
  );
  container.querySelectorAll('[data-preset]').forEach((el) =>
    el.addEventListener('click', () => {
      const p = ASSET_BROWSER_PRESETS.find((x) => x.id === (el as HTMLElement).dataset.preset);
      if (!p) return;
      if (p.category === 'mesh' && p.primitive) store.addObject('mesh', p.primitive, p.name);
      else if (p.category === 'material' && p.materialHex) store.updateMaterial({ baseColor: p.materialHex });
      else if (p.category === 'rig') store.generateRigifyOnScene();
      else if (p.category === 'greasepencil') store.addObject('greasepencil');
      else if (p.category === 'splat') store.addObject('pointcloud');
    })
  );
  container.querySelectorAll('[data-export]').forEach((el) =>
    el.addEventListener('click', () => {
      const fmt = (el as HTMLElement).dataset.export!;
      if (fmt === 'obj') downloadBlob('xl3d-scene.obj', exportSceneToOBJ(store.scene), 'text/plain');
      else if (fmt === 'stl') downloadBlob('xl3d-scene.stl', exportSceneToSTL(store.scene), 'text/plain');
      else if (fmt === 'ply') downloadBlob('xl3d-scene.ply', exportSceneToPLY(store.scene), 'text/plain');
      else if (fmt === 'glb') downloadBlob('xl3d-scene.glb', new Uint8Array(exportSceneToGLB(store.scene)).buffer, 'model/gltf-binary');
      else if (fmt === 'spz') downloadBlob('xl3d-splat.spz', new Uint8Array(exportPointCloudToSPZ(store.scene)).buffer, 'application/octet-stream');
    })
  );
  container.querySelector('#xl-import-obj')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    file.text().then((txt) => {
      const obj = importOBJToMeshObject(txt, file.name.replace(/\.obj$/i, ''));
      store.pushUndo();
      store.scene.objects.push(obj);
      store.setActiveObject(obj.id);
    });
  });

  container.querySelectorAll('input[type="range"], input[type="color"]').forEach((inp) => {
    const el = inp as HTMLInputElement;
    const labelEl = el.parentElement?.querySelector('label');

    el.addEventListener('pointerdown', () => setDrag(true));
    el.addEventListener('input', () => {
      setDrag(true);
      if (el.dataset.tr) {
        const [sec, ax] = el.dataset.tr.split(':') as ['location' | 'rotation' | 'scale', 'x' | 'y' | 'z'];
        const val = parseFloat(el.value);
        store.updateActiveTransform(sec, ax, val, true);
        if (labelEl) labelEl.textContent = `${ax.toUpperCase()}: ${val.toFixed(2)}`;
      } else if (el.dataset.mat) {
        const k = el.dataset.mat;
        const val = el.type === 'color' ? el.value : parseFloat(el.value);
        store.updateMaterial({ [k]: val } as any, true);
        if (labelEl && el.type !== 'color') labelEl.textContent = `${k} (${Number(val).toFixed(2)})`;
      } else if (el.dataset.live === 'sculpt_radius') {
        store.sculpt.radius = parseFloat(el.value);
        if (labelEl) labelEl.textContent = `Radius (${store.sculpt.radius.toFixed(2)})`;
      } else if (el.dataset.live === 'sculpt_strength') {
        store.sculpt.strength = parseFloat(el.value);
        if (labelEl) labelEl.textContent = `Strength (${store.sculpt.strength.toFixed(2)})`;
      } else if (el.dataset.live === 'paint_color') {
        store.paint.color = el.value;
      } else if (el.dataset.live === 'paint_weight') {
        store.paintWeightValue = parseFloat(el.value);
      } else if (el.dataset.live === 'timeline_frame') {
        store.setCurrentFrame(parseInt(el.value, 10), true);
      }
    });

    const endDrag = () => {
      if (getDrag()) {
        setDrag(false);
        store.commitLiveChange();
      }
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('change', endDrag);
  });
}
