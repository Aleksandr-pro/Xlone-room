import { saveFileToDevice } from '../core/fileBridge';
import type {
  BakeType,
  CameraInputSpace,
  ColorTransform,
  LightKind,
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
import { bindScriptingInteractions, renderScriptingTabHtml } from './codeEditor';
import {
  mountGraphEditorCanvas,
  mountNodeGraphCanvas,
  mountTexturePaintCanvas,
  mountUvEditorCanvas,
} from './visualCanvases';

function downloadBlob(filename: string, data: BlobPart | Uint8Array, mime: string): void {
  saveFileToDevice(filename, data, mime);
}

export function mountEditorPanel(container: HTMLElement): () => void {
  let isDraggingSlider = false;
  let isEditingCode = false;

  const render = () => {
    if (isDraggingSlider || isEditingCode) return;
    const tab = store.activeTab;
    const obj = store.getActiveObject();
    const mat = store.getActiveMaterial();

    let html = '';
    if (tab === 'tools') html = renderToolsTab(obj);
    else if (tab === 'outliner') html = renderOutlinerTab();
    else if (tab === 'properties') html = renderPropertiesTab(obj, mat);
    else if (tab === 'nodes') html = renderNodesTab(mat);
    else if (tab === 'animation') html = renderAnimationTab(obj);
    else if (tab === 'scripting') html = renderScriptingTabHtml();
    else html = renderEditorsHubTab();

    container.innerHTML = html;

    if (tab === 'scripting') {
      bindScriptingInteractions(container, (v) => { isEditingCode = v; });
    }

    // Mount interactive visual canvases if present in active tab
    const ngCanvas = container.querySelector('#xl-node-canvas') as HTMLCanvasElement | null;
    if (ngCanvas) mountNodeGraphCanvas(ngCanvas);
    const uvCanvas = container.querySelector('#xl-uv-canvas') as HTMLCanvasElement | null;
    if (uvCanvas) mountUvEditorCanvas(uvCanvas);
    const fcCanvas = container.querySelector('#xl-fcurve-canvas') as HTMLCanvasElement | null;
    if (fcCanvas) mountGraphEditorCanvas(fcCanvas);
    const tpCanvas = container.querySelector('#xl-texpaint-canvas') as HTMLCanvasElement | null;
    if (tpCanvas) mountTexturePaintCanvas(tpCanvas);

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
    ['merge', 'Merge Center'], ['dissolve', 'Dissolve'], ['poke_faces', 'Poke Faces'],
    ['duplicate_faces', 'Duplicate (Shift+D)'], ['separate_selection', 'Separate (P)'],
    ['spin', 'Spin 90°'], ['polybuild', 'Poly Build'], ['subdivide', 'Subdivide'],
    ['triangulate', 'Triangulate'], ['tris_to_quads', 'Tris→Quads'], ['shrink_fatten', 'Shrink/Fatten'],
    ['smooth_verts', 'Smooth'], ['flip_normals', 'Flip Normals'], ['toggle_sharp', 'Sharp Edge'],
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
            <button class="xl-chip ${store.sculpt.frontFacesOnly !== false ? 'active' : ''}" data-sym="frontFacesOnly">Front Faces Only</button>
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
          ${store.paint.mode === 'texture' ? `
            <div class="xl-card-subtitle">2D Texture Paint Canvas (рисуйте пальцем)</div>
            <canvas id="xl-texpaint-canvas" width="320" height="180" class="xl-visual-canvas"></canvas>
          ` : ''}
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
          <div class="xl-slider-row">
            <label>Step / Extrude / Inset (${store.editOpAmount.toFixed(2)})</label>
            <input type="range" min="0.1" max="1.5" step="0.05" value="${store.editOpAmount}" data-live="edit_amount" />
          </div>
          <div class="xl-chip-row" style="margin-bottom:10px;">
            <button class="xl-chip ${store.editSelectMode === 'vertex' ? 'active' : ''}" data-esm="vertex">${d.selectModes.vertex}</button>
            <button class="xl-chip ${store.editSelectMode === 'edge' ? 'active' : ''}" data-esm="edge">${d.selectModes.edge}</button>
            <button class="xl-chip ${store.editSelectMode === 'face' ? 'active' : ''}" data-esm="face">${d.selectModes.face}</button>
            <button class="xl-chip ${store.proportionalEditing ? 'active' : ''}" id="xl-prop-toggle">Proportional</button>
            <button class="xl-chip" data-edit-op="select_all">All</button>
            <button class="xl-chip" data-edit-op="select_invert">Invert</button>
            <button class="xl-chip" data-edit-op="select_grow">Grow +</button>
            <button class="xl-chip" data-edit-op="select_shrink">Shrink -</button>
            <button class="xl-chip" data-edit-op="select_linked">Linked</button>
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
  const active = store.getActiveObject();
  return `
    <div class="xl-panel-stack">
      <div class="xl-section-card">
        <div class="xl-card-title">${d.tabs.outliner} (${store.scene.objects.length})</div>
        <div class="xl-outliner-list">
          ${store.scene.objects.map((o) => `
            <div class="xl-outliner-item ${o.id === store.scene.activeObjectId ? 'active' : ''}" data-select-obj="${o.id}">
              <span><span class="xl-badge-mini">${o.type}</span> <strong>${o.name}</strong></span>
              <span style="display:flex;gap:4px;">
                <button class="xl-chip xl-chip-sm" data-toggle-lock="${o.id}" title="Lock Selection">${o.locked ? '🔒' : '🔓'}</button>
                <button class="xl-chip xl-chip-sm" data-toggle-vis="${o.id}">${o.visible ? '👁' : '🙈'}</button>
              </span>
            </div>
          `).join('')}
        </div>
        <div class="xl-chip-row" style="margin-top:10px;">
          <button class="xl-btn" id="xl-dup-obj">${d.duplicateObj}</button>
          <button class="xl-btn" id="xl-join-obj">⊕ Join (Ctrl+J)</button>
          <button class="xl-btn" id="xl-apply-tr">Apply Scale/Rot (Ctrl+A)</button>
          <button class="xl-btn" id="xl-origin-geom">Origin → Geometry</button>
          ${active && (active.type === 'curve' || active.type === 'text') ? `<button class="xl-btn xl-btn-primary" id="xl-convert-mesh">Convert → Mesh</button>` : ''}
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
    'weld', 'weightedNormal', 'geometryNodes',
  ];
  const physicsTypes: PhysicsType[] = ['none', 'rigidBody', 'cloth', 'softBody', 'fluid', 'particles', 'hair', 'forceField'];
  const engines: RenderEngine[] = ['workbench', 'eevee', 'cycles'];
  const wbModes: WorkbenchShading[] = ['solid', 'wireframe', 'matcap', 'xray', 'cavity', 'outline'];
  const cms: ColorTransform[] = ['agx', 'filmic', 'aces', 'standard', 'wideGamut'];
  const camSpaces: CameraInputSpace[] = ['sRGB', 'AppleLog', 'ARRI_LogC4', 'Blackmagic', 'CanonLog2', 'SonySLog3'];
  const lightKinds: LightKind[] = ['point', 'sun', 'spot', 'area'];

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

        ${obj.text3d ? `
          <div class="xl-section-card">
            <div class="xl-card-title">3D Text Properties</div>
            <div class="xl-field-group">
              <label>Text Content</label>
              <input type="text" class="xl-input" id="xl-text3d-val" value="${obj.text3d.text}" />
            </div>
            <div class="xl-slider-row">
              <label>Extrude (${obj.text3d.extrude.toFixed(2)})</label>
              <input type="range" min="0.04" max="0.8" step="0.02" value="${obj.text3d.extrude}" id="xl-text3d-ext" />
            </div>
            <button class="xl-btn xl-btn-primary" id="xl-convert-mesh">Convert Text → Mesh</button>
          </div>
        ` : ''}

        ${obj.curve ? `
          <div class="xl-section-card">
            <div class="xl-card-title">Curve Properties (Bezier)</div>
            <div class="xl-slider-row">
              <label>Bevel Thickness (${obj.curve.bevelDepth.toFixed(2)})</label>
              <input type="range" min="0.02" max="0.35" step="0.01" value="${obj.curve.bevelDepth}" id="xl-curve-bev" />
            </div>
            <div class="xl-chip-row">
              <button class="xl-chip ${obj.curve.closed ? 'active' : ''}" id="xl-curve-closed">${obj.curve.closed ? 'Closed Loop' : 'Open Spline'}</button>
              <button class="xl-btn xl-btn-primary" id="xl-convert-mesh">Convert Curve → Mesh</button>
            </div>
          </div>
        ` : ''}

        ${obj.light ? `
          <div class="xl-section-card">
            <div class="xl-card-title">Light Properties</div>
            <div class="xl-chip-row">
              ${lightKinds.map((lk) => `<button class="xl-chip ${obj.light!.kind === lk ? 'active' : ''}" data-light-kind="${lk}">${lk.toUpperCase()}</button>`).join('')}
            </div>
            <div class="xl-slider-row">
              <label>Color</label>
              <input type="color" value="${obj.light.color}" id="xl-light-color" />
            </div>
            <div class="xl-slider-row">
              <label>Power (${obj.light.power.toFixed(0)} W)</label>
              <input type="range" min="1" max="1500" step="10" value="${obj.light.power}" data-live="light_power" />
            </div>
          </div>
        ` : ''}

        ${obj.camera ? `
          <div class="xl-section-card">
            <div class="xl-card-title">Camera Properties</div>
            <div class="xl-slider-row">
              <label>Focal Length (${obj.camera.focalLength.toFixed(0)} mm)</label>
              <input type="range" min="14" max="135" step="1" value="${obj.camera.focalLength}" data-live="cam_focal" />
            </div>
          </div>
        ` : ''}

        <div class="xl-section-card">
          <div class="xl-card-title">${d.modifiersTitle} (${obj.modifiers.length})</div>
          <div class="xl-chip-row" style="margin-bottom:8px;">
            ${mods.map((m) => `<button class="xl-chip xl-chip-sm" data-add-mod="${m}">＋ ${m}</button>`).join('')}
          </div>
          ${obj.modifiers.map((m) => `
            <div class="xl-mod-card">
              <div class="xl-mod-row" style="margin-top:0;padding:0;border:none;background:transparent;">
                <strong>${m.name}</strong>
                <div>
                  <button class="xl-chip xl-chip-sm" data-apply-mod="${m.id}" title="Bake Modifier to Mesh">✓ Apply</button>
                  <button class="xl-chip xl-chip-sm ${m.enabled ? 'active' : ''}" data-toggle-mod="${m.id}">${m.enabled ? 'ON' : 'OFF'}</button>
                  <button class="xl-chip xl-chip-sm" data-del-mod="${m.id}">✕</button>
                </div>
              </div>
              ${Object.entries(m.params).map(([pk, pv]) =>
                typeof pv === 'number' ? `
                  <div class="xl-slider-row" style="margin:4px 0;">
                    <label>${pk}: ${pv.toFixed(2)}</label>
                    <input type="range" min="0" max="${pk.includes('count') ? 8 : pk.includes('angle') ? 360 : 3}" step="${pk.includes('count') || pk.includes('levels') ? 1 : 0.05}" value="${pv}" data-mod-param="${m.id}:${pk}" />
                  </div>
                ` : ''
              ).join('')}
            </div>
          `).join('')}
        </div>

        <div class="xl-section-card">
          <div class="xl-card-title">${d.physicsTitle}</div>
          <div class="xl-chip-row">
            ${physicsTypes.map((pt) => `<button class="xl-chip ${obj.physics.type === pt ? 'active' : ''}" data-phys-type="${pt}">${pt}</button>`).join('')}
          </div>
          ${obj.physics.type !== 'none' ? `
            <div class="xl-slider-row">
              <label>Gravity / Wind (${obj.physics.gravityScale.toFixed(2)})</label>
              <input type="range" min="0" max="3" step="0.1" value="${obj.physics.gravityScale}" data-live="phys_gravity" />
            </div>
          ` : ''}
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
          ${wbModes.map((wb) => `<button class="xl-chip xl-chip-sm ${store.scene.render.workbenchShading === wb ? 'active' : ''}" data-wb="${wb}">${wb}</button>`).join('')}
        </div>
        <div class="xl-card-subtitle">World Sky 5.3 & Atmosphere Fog</div>
        <div class="xl-slider-row">
          <label>Sun Elevation (${store.scene.world.sunElevation.toFixed(0)}°)</label>
          <input type="range" min="5" max="88" step="1" value="${store.scene.world.sunElevation}" data-live="world_sun" />
        </div>
        <div class="xl-slider-row">
          <label>Fog Density (${store.scene.world.fogDensity.toFixed(2)})</label>
          <input type="range" min="0" max="1" step="0.05" value="${store.scene.world.fogDensity}" data-live="world_fog" />
        </div>
        <div class="xl-card-subtitle">Color Management & 5.2 Camera Input Space</div>
        <div class="xl-chip-row">
          ${cms.map((cm) => `<button class="xl-chip xl-chip-sm ${store.scene.render.colorTransform === cm ? 'active' : ''}" data-cm="${cm}">${cm.toUpperCase()}</button>`).join('')}
        </div>
        <div class="xl-chip-row" style="margin-top:6px;">
          ${camSpaces.map((cs) => `<button class="xl-chip xl-chip-sm ${store.scene.render.inputSpace === cs ? 'active' : ''}" data-camspace="${cs}">${cs}</button>`).join('')}
        </div>
        <div class="xl-chip-row" style="margin-top:8px;">
          <button class="xl-chip ${store.scene.render.freestyle ? 'active' : ''}" id="xl-toggle-freestyle">Freestyle</button>
          <button class="xl-chip ${store.scene.render.textureCache52 ? 'active' : ''}" id="xl-toggle-cache">Texture Cache 5.2</button>
          <button class="xl-chip ${store.scene.world.mode === 'sky53' ? 'active' : ''}" id="xl-toggle-sky">Sky 5.3</button>
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

      ${activeGraph ? `
        <div class="xl-section-card">
          <div class="xl-card-title">${activeGraph.name} (перетаскивайте ноды пальцем)</div>
          <canvas id="xl-node-canvas" width="440" height="220" class="xl-visual-canvas"></canvas>
          <div class="xl-chip-row" style="margin-top:10px;">
            <button class="xl-chip" data-add-node="Voronoi:Voronoi 5.3">＋ Voronoi</button>
            <button class="xl-chip" data-add-node="Raycast:Raycast (5.2)">＋ Raycast</button>
            <button class="xl-chip" data-add-node="XPBD:XPBD Physics (5.3)">＋ XPBD</button>
            <button class="xl-chip" data-add-node="StringNode:String Format (5.2)">＋ String 5.2</button>
            ${activeGraph.graphKind === 'geometry' ? `<button class="xl-btn xl-btn-primary" id="xl-attach-gn">Attach GN to Mesh</button>` : ''}
          </div>
        </div>
      ` : ''}

      ${activeGraph?.graphKind === 'shader' && mat ? `
        <div class="xl-section-card">
          <div class="xl-card-title">Shader Nodes · ${mat.name}</div>
          <div class="xl-chip-row">
            ${procTex.map((pt) => `<button class="xl-chip ${mat.procTexture === pt ? 'active' : ''}" data-proc-tex="${pt}">${pt.toUpperCase()}</button>`).join('')}
          </div>
          <div class="xl-slider-row">
            <label>Texture Scale (${mat.procScale.toFixed(1)})</label>
            <input type="range" min="1" max="16" step="0.5" value="${mat.procScale}" data-mat="procScale" />
          </div>
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
          <button class="xl-btn" id="xl-gsmooth-btn">Gaussian Smooth (5.1)</button>
        </div>
        <div class="xl-slider-row">
          <label>Scrub Frame</label>
          <input type="range" min="${s.startFrame}" max="${s.endFrame}" step="1" value="${s.currentFrame}" data-live="timeline_frame" />
        </div>
        <div class="xl-card-subtitle">F-Curve Graph Editor</div>
        <canvas id="xl-fcurve-canvas" width="420" height="150" class="xl-visual-canvas"></canvas>
      </div>

      ${obj && obj.shapeKeys.length > 0 ? `
        <div class="xl-section-card">
          <div class="xl-card-title">Shape Keys</div>
          ${obj.shapeKeys.map((sk) => `
            <div class="xl-slider-row">
              <label>${sk.name}: ${sk.value.toFixed(2)}</label>
              <input type="range" min="0" max="1" step="0.02" value="${sk.value}" data-sk-id="${sk.id}" />
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="xl-section-card">
        <div class="xl-card-title">Armature, Rigify & IK / Drivers</div>
        <div class="xl-chip-row">
          <button class="xl-btn xl-btn-primary" id="xl-rigify-btn">Generate Rigify Humanoid</button>
          <button class="xl-btn" id="xl-ik-up">IK Target +Z</button>
          <button class="xl-btn" id="xl-ik-down">IK Target -Z</button>
          <button class="xl-btn" id="xl-add-driver">＋ Driver sin(frame*0.1)</button>
        </div>
      </div>
    </div>
  `;
}

function renderEditorsHubTab(): string {
  const d = store.t();
  const sub = store.activeSubEditor;
  const subs: Array<[SubEditorKind, string]> = [
    ['assets', 'Asset Browser & I/O'],
    ['uv', 'UV / UDIM Editor'],
    ['vse', 'VSE 5.3 & Tracking'],
    ['spreadsheet', 'Spreadsheet'],
    ['preferences', 'Preferences & Console'],
  ];

  return `
    <div class="xl-panel-stack">
      <div class="xl-section-card">
        <div class="xl-chip-row">
          ${subs.map(([id, lbl]) => `<button class="xl-btn ${sub === id ? 'xl-btn-primary' : ''}" data-sub-ed="${id}">${lbl}</button>`).join('')}
        </div>
      </div>

      ${sub === 'uv' ? `
        <div class="xl-section-card">
          <div class="xl-card-title">${d.uvOpsTitle}</div>
          <canvas id="xl-uv-canvas" width="320" height="240" class="xl-visual-canvas"></canvas>
          <div class="xl-chip-row" style="margin-top:10px;">
            <button class="xl-btn xl-btn-primary" data-edit-op="uv_unwrap">UV Unwrap</button>
            <button class="xl-btn" data-edit-op="uv_smart">Smart UV Project</button>
            <button class="xl-btn" data-edit-op="uv_pack">Pack Islands</button>
            <button class="xl-btn" data-edit-op="mark_seam">Mark Seam</button>
          </div>
        </div>
      ` : sub === 'vse' ? `
        <div class="xl-section-card">
          <div class="xl-card-title">${d.vseTitle}</div>
          <div class="xl-chip-row">
            <button class="xl-btn" data-vse-add="video">＋ Video</button>
            <button class="xl-btn" data-vse-add="text">＋ Text</button>
            <button class="xl-btn" data-vse-add="audio">＋ Audio</button>
            <button class="xl-btn" id="xl-vse-blade">✂ Blade 2.0 @ ${store.scene.currentFrame}</button>
            <button class="xl-btn" id="xl-vse-ripple">Ripple Delete</button>
            <button class="xl-btn xl-btn-primary" id="xl-vse-otio">Export OTIO</button>
          </div>
          <div class="xl-vse-tracks">
            ${store.scene.vse.clips.map((c) => `
              <div class="xl-vse-strip ${store.selectedClipId === c.id ? 'active' : ''}" data-vse-clip="${c.id}">
                CH${c.track} · <strong>${c.name}</strong> [${c.startFrame}..${c.startFrame + c.durationFrames}]
              </div>
            `).join('')}
          </div>
          <div class="xl-card-subtitle" style="margin-top:12px;">Motion Tracking (${store.scene.vse.markers.length} markers)</div>
          <button class="xl-btn" id="xl-solve-track">${store.scene.vse.cameraSolved ? '✓ Camera Solved' : 'Solve Camera Motion'}</button>
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
            <button class="xl-btn xl-btn-danger" id="xl-reset-scene">Reset Scene</button>
          </div>
          <div class="xl-card-subtitle" style="margin-top:12px;">Python / Macro Console (bpy.ops)</div>
          <div class="xl-console-box">
            ${store.consoleLog.map((l) => `<div>${l}</div>`).join('')}
          </div>
          <div class="xl-chip-row" style="margin-top:8px;">
            <button class="xl-chip" data-macro="bpy.ops.mesh.primitive_monkey_add()">+ Suzanne</button>
            <button class="xl-chip" data-macro="bpy.ops.object.subdivision_set(level=2)">+ Subsurf</button>
            <button class="xl-chip" data-macro="rigify()">+ Rigify</button>
          </div>
        </div>
      ` : `
        <div class="xl-section-card">
          <div class="xl-card-title">${d.assetBrowserTitle}</div>
          <div class="xl-grid-3">
            ${ASSET_BROWSER_PRESETS.map((p) => `<button class="xl-btn" data-preset="${p.id}">＋ ${p.name}</button>`).join('')}
          </div>
          <div class="xl-chip-row" style="margin-top:12px;">
            <button class="xl-btn xl-btn-primary" id="xl-save-xl3d">${d.exportSceneBtn}</button>
            <label class="xl-btn" style="cursor:pointer;">Load .xl3d <input type="file" accept=".xl3d,.json" id="xl-load-xl3d" hidden /></label>
            <button class="xl-btn" data-export="obj">Export .OBJ</button>
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
  container.querySelector('#xl-prop-toggle')?.addEventListener('click', () => {
    store.proportionalEditing = !store.proportionalEditing;
    store.commitLiveChange();
  });
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
      else if (s === 'frontFacesOnly') store.sculpt.frontFacesOnly = !(store.sculpt.frontFacesOnly !== false);
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
  container.querySelectorAll('[data-toggle-lock]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      store.toggleObjectLocked((el as HTMLElement).dataset.toggleLock!);
    })
  );
  container.querySelector('#xl-dup-obj')?.addEventListener('click', () => store.duplicateActiveObject());
  container.querySelector('#xl-del-obj')?.addEventListener('click', () => store.deleteActiveObject());
  container.querySelector('#xl-join-obj')?.addEventListener('click', () => store.joinWithNextMesh());
  container.querySelector('#xl-apply-tr')?.addEventListener('click', () => store.applyAllTransforms());
  container.querySelector('#xl-origin-geom')?.addEventListener('click', () => store.originToGeometry());
  container.querySelector('#xl-convert-mesh')?.addEventListener('click', () => store.convertToMesh());
  container.querySelector('#xl-add-shapekey')?.addEventListener('click', () => store.addShapeKey());

  container.querySelector('#xl-text3d-val')?.addEventListener('change', (e) => {
    store.updateText3DData({ text: (e.target as HTMLInputElement).value });
  });
  container.querySelector('#xl-text3d-ext')?.addEventListener('change', (e) => {
    store.updateText3DData({ extrude: parseFloat((e.target as HTMLInputElement).value) });
  });
  container.querySelector('#xl-curve-bev')?.addEventListener('change', (e) => {
    store.updateCurveData({ bevelDepth: parseFloat((e.target as HTMLInputElement).value) });
  });
  container.querySelector('#xl-curve-closed')?.addEventListener('click', () => {
    const obj = store.getActiveObject();
    if (obj?.curve) store.updateCurveData({ closed: !obj.curve.closed });
  });
  container.querySelector('#xl-light-color')?.addEventListener('change', (e) => {
    store.updateLight({ color: (e.target as HTMLInputElement).value });
  });

  container.querySelectorAll('[data-light-kind]').forEach((el) =>
    el.addEventListener('click', () => store.updateLight({ kind: (el as HTMLElement).dataset.lightKind as LightKind }))
  );

  container.querySelectorAll('[data-add-mod]').forEach((el) =>
    el.addEventListener('click', () => store.addModifier((el as HTMLElement).dataset.addMod as ModifierType))
  );
  container.querySelectorAll('[data-apply-mod]').forEach((el) =>
    el.addEventListener('click', () => store.applyModifier((el as HTMLElement).dataset.applyMod!))
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
    store.commitLiveChange();
  });

  container.querySelectorAll('[data-graph-id]').forEach((el) =>
    el.addEventListener('click', () => {
      store.scene.activeNodeGraphId = (el as HTMLElement).dataset.graphId!;
      store.commitLiveChange();
    })
  );
  container.querySelectorAll('[data-add-node]').forEach((el) =>
    el.addEventListener('click', () => {
      const [k, lbl] = (el as HTMLElement).dataset.addNode!.split(':');
      store.addNodeToActiveGraph(k, lbl);
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
  container.querySelectorAll('[data-vse-add]').forEach((el) =>
    el.addEventListener('click', () => store.addVseClip((el as HTMLElement).dataset.vseAdd as any))
  );
  container.querySelectorAll('[data-vse-clip]').forEach((el) =>
    el.addEventListener('click', () => {
      store.selectedClipId = (el as HTMLElement).dataset.vseClip!;
      store.commitLiveChange();
    })
  );
  container.querySelector('#xl-vse-blade')?.addEventListener('click', () => store.vseCutSelectedAtCurrentFrame());
  container.querySelector('#xl-vse-ripple')?.addEventListener('click', () => store.vseRippleDeleteLast());
  container.querySelector('#xl-vse-otio')?.addEventListener('click', () => downloadBlob('timeline.otio', exportVseToOtio(store.scene), 'application/json'));
  container.querySelector('#xl-solve-track')?.addEventListener('click', () => store.solveMotionTracking());
  container.querySelector('#xl-reset-scene')?.addEventListener('click', () => store.resetScene());
  container.querySelectorAll('[data-macro]').forEach((el) =>
    el.addEventListener('click', () => store.runMacroCommand((el as HTMLElement).dataset.macro!))
  );

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
  container.querySelector('#xl-save-xl3d')?.addEventListener('click', () => {
    downloadBlob('project.xl3d', store.saveProjectJson(), 'application/json');
  });
  container.querySelector('#xl-load-xl3d')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    file.text().then((txt) => store.loadProjectJson(txt));
  });
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
      } else if (el.dataset.modParam) {
        const [modId, key] = el.dataset.modParam.split(':');
        const val = parseFloat(el.value);
        store.updateModifierParam(modId, key, val, true);
        if (labelEl) labelEl.textContent = `${key}: ${val.toFixed(2)}`;
      } else if (el.dataset.skId) {
        const val = parseFloat(el.value);
        store.updateShapeKeyValue(el.dataset.skId, val, true);
        if (labelEl) labelEl.textContent = `${val.toFixed(2)}`;
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
      } else if (el.dataset.live === 'edit_amount') {
        store.editOpAmount = parseFloat(el.value);
        if (labelEl) labelEl.textContent = `Step / Extrude / Inset (${store.editOpAmount.toFixed(2)})`;
      } else if (el.dataset.live === 'light_power') {
        const val = parseFloat(el.value);
        store.updateLight({ power: val }, true);
        if (labelEl) labelEl.textContent = `Power (${val.toFixed(0)} W)`;
      } else if (el.dataset.live === 'cam_focal') {
        const val = parseFloat(el.value);
        store.updateCameraData({ focalLength: val }, true);
        if (labelEl) labelEl.textContent = `Focal Length (${val.toFixed(0)} mm)`;
      } else if (el.dataset.live === 'phys_gravity') {
        const val = parseFloat(el.value);
        store.setPhysics({ gravityScale: val });
      } else if (el.dataset.live === 'world_sun') {
        const val = parseFloat(el.value);
        store.updateWorld({ sunElevation: val }, true);
        if (labelEl) labelEl.textContent = `Sun Elevation (${val.toFixed(0)}°)`;
      } else if (el.dataset.live === 'world_fog') {
        const val = parseFloat(el.value);
        store.updateWorld({ fogDensity: val }, true);
        if (labelEl) labelEl.textContent = `Fog Density (${val.toFixed(2)})`;
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
