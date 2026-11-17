import { saveFileToDevice } from '../core/fileBridge';
import { BUILTIN_SCRIPT_TEMPLATES } from '../engine/scriptingEngine';
import { store } from '../state/xl3dStore';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderScriptingTabHtml(): string {
  const d = store.t();
  const scripts = store.getScripts();
  const active = store.getActiveScript();
  const linesCount = active ? active.content.split('\n').length : 1;
  const lineNums = Array.from({ length: Math.max(1, linesCount) }, (_, i) => i + 1).join('\n');

  const snippets: Array<[string, string]> = [
    ['⇥ Tab', '    '],
    ['bpy.ops', 'bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1))'],
    ['bmesh', 'bm = bmesh.new()\nbm.from_mesh(bpy.context.active_object.data)\n'],
    ['for range', 'for i in range(8):\n    '],
    ['from_pydata', 'mesh = bpy.data.meshes.new("GenMesh")\nmesh.from_pydata(verts, [], faces)\n'],
    ['print()', 'print()'],
    ['(0,0,0)', '(0, 0, 0)'],
  ];

  return `
    <div class="xl-panel-stack">
      <div class="xl-section-card">
        <div class="xl-code-header">
          <div class="xl-card-title" style="margin:0;">${d.scriptingTitle}</div>
          <div class="xl-chip-row">
            <button class="xl-btn xl-btn-sm" id="xl-code-new">＋ Новый</button>
            <label class="xl-btn xl-btn-sm" style="cursor:pointer;">
              📂 Загрузить
              <input type="file" accept=".py,.js,.ts,.mjs,.txt,.glsl,.json" id="xl-code-upload" hidden />
            </label>
            <button class="xl-btn xl-btn-sm" id="xl-code-save">💾 Экспорт</button>
          </div>
        </div>

        <div class="xl-code-tabs">
          ${scripts
            .map(
              (s) => `
            <div class="xl-code-tab ${s.id === active?.id ? 'active' : ''}" data-script-id="${s.id}">
              <span class="xl-code-dot ${s.lastRunStatus === 'ok' ? 'ok' : s.lastRunStatus === 'error' ? 'err' : ''}"></span>
              <span>${escapeHtml(s.name)}</span>
              ${scripts.length > 1 ? `<button class="xl-code-tab-del" data-del-script="${s.id}" title="Удалить">✕</button>` : ''}
            </div>`
            )
            .join('')}
        </div>

        <div class="xl-card-subtitle" style="margin-top:8px;">Готовые Blender-шаблоны</div>
        <div class="xl-code-snippets">
          ${BUILTIN_SCRIPT_TEMPLATES.map(
            (tpl) => `<button class="xl-chip xl-chip-sm" data-script-tpl="${tpl.id}" title="${escapeHtml(tpl.description)}">${escapeHtml(tpl.name)}</button>`
          ).join('')}
        </div>
      </div>

      ${
        active
          ? `
      <div class="xl-section-card">
        <div class="xl-code-toolbar">
          <input type="text" class="xl-code-name-input" id="xl-code-name" value="${escapeHtml(active.name)}" aria-label="Имя файла" />
          <select class="xl-code-lang-select" id="xl-code-lang" aria-label="Язык">
            <option value="python" ${active.language === 'python' ? 'selected' : ''}>Python (bpy)</option>
            <option value="javascript" ${active.language === 'javascript' ? 'selected' : ''}>JavaScript</option>
          </select>
          <button class="xl-btn xl-btn-primary" id="xl-code-run">▶ Запустить</button>
        </div>

        <div class="xl-code-snippets" style="margin-bottom:8px;">
          ${snippets
            .map(([lbl, snip]) => `<button class="xl-chip xl-chip-sm" data-code-snip="${escapeHtml(snip)}">${lbl}</button>`)
            .join('')}
        </div>

        <div class="xl-code-editor-box">
          <pre class="xl-code-gutter" id="xl-code-gutter">${lineNums}</pre>
          <textarea
            id="xl-code-textarea"
            class="xl-code-textarea"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
          >${escapeHtml(active.content)}</textarea>
        </div>

        <div class="xl-code-console ${active.lastRunStatus === 'error' ? 'err' : active.lastRunStatus === 'ok' ? 'ok' : ''}" id="xl-code-console">${
          active.lastRunOutput
            ? escapeHtml(active.lastRunOutput)
            : 'Нажмите «▶ Запустить», чтобы создать или изменить 3D-модель кодом. Поддерживаются bpy.ops, bpy.data.meshes.from_pydata, bmesh, math и JavaScript.'
        }</div>
      </div>

      <div class="xl-section-card">
        <div class="xl-card-title">Шпаргалка по API моделирования</div>
        <div class="xl-console-box" style="max-height:130px;color:#cbd5e1;">
          <div><strong>Примитивы:</strong> bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,1))</div>
          <div><strong>Свой меш:</strong> mesh = bpy.data.meshes.new("M"); mesh.from_pydata(verts, [], faces)</div>
          <div><strong>BMesh:</strong> bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.new((x,y,z)); bm.to_mesh(obj.data)</div>
          <div><strong>Операции:</strong> bpy.ops.mesh.subdivide(number_cuts=1) / extrude_region_move() / bevel(offset=0.1)</div>
          <div><strong>Модификаторы:</strong> obj.modifiers.new("Sub", "SUBSURF") / MIRROR / SOLIDIFY / ARRAY</div>
        </div>
      </div>
      `
          : ''
      }
    </div>
  `;
}

export function bindScriptingInteractions(
  container: HTMLElement,
  setEditing: (v: boolean) => void
): void {
  const active = store.getActiveScript();
  const textarea = container.querySelector('#xl-code-textarea') as HTMLTextAreaElement | null;
  const gutter = container.querySelector('#xl-code-gutter') as HTMLElement | null;

  const syncGutter = () => {
    if (!textarea || !gutter) return;
    const count = textarea.value.split('\n').length;
    gutter.textContent = Array.from({ length: Math.max(1, count) }, (_, i) => i + 1).join('\n');
    gutter.scrollTop = textarea.scrollTop;
  };

  if (textarea && active) {
    textarea.addEventListener('focus', () => setEditing(true));
    textarea.addEventListener('blur', () => {
      setEditing(false);
      store.updateScriptContent(active.id, textarea.value, true);
    });
    textarea.addEventListener('scroll', () => {
      if (gutter) gutter.scrollTop = textarea.scrollTop;
    });
    textarea.addEventListener('input', () => {
      store.updateScriptContent(active.id, textarea.value, true);
      syncGutter();
    });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.slice(0, start) + '    ' + textarea.value.slice(end);
        textarea.selectionStart = textarea.selectionEnd = start + 4;
        store.updateScriptContent(active.id, textarea.value, true);
        syncGutter();
      } else if (e.key === 'Enter') {
        const start = textarea.selectionStart;
        const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
        const curLine = textarea.value.slice(lineStart, start);
        const indentMatch = curLine.match(/^(\s*)/);
        let indent = indentMatch ? indentMatch[1] : '';
        if (curLine.trimEnd().endsWith(':') || curLine.trimEnd().endsWith('{')) {
          indent += '    ';
        }
        if (indent) {
          e.preventDefault();
          const end = textarea.selectionEnd;
          textarea.value = textarea.value.slice(0, start) + '\n' + indent + textarea.value.slice(end);
          textarea.selectionStart = textarea.selectionEnd = start + 1 + indent.length;
          store.updateScriptContent(active.id, textarea.value, true);
          syncGutter();
        }
      }
    });
  }

  container.querySelector('#xl-code-new')?.addEventListener('click', () => {
    setEditing(false);
    store.createScript();
  });

  container.querySelector('#xl-code-upload')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    setEditing(false);
    file.text().then((txt) => store.loadScriptFile(file.name, txt));
  });

  container.querySelector('#xl-code-save')?.addEventListener('click', () => {
    const cur = store.getActiveScript();
    if (!cur) return;
    saveFileToDevice(cur.name, cur.content, 'text/plain');
  });

  container.querySelectorAll('[data-script-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-del-script]')) return;
      setEditing(false);
      store.setActiveScript((el as HTMLElement).dataset.scriptId!);
    });
  });

  container.querySelectorAll('[data-del-script]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      setEditing(false);
      store.deleteScript((el as HTMLElement).dataset.delScript!);
    });
  });

  container.querySelectorAll('[data-script-tpl]').forEach((el) => {
    el.addEventListener('click', () => {
      setEditing(false);
      store.applyScriptTemplate((el as HTMLElement).dataset.scriptTpl!);
    });
  });

  container.querySelector('#xl-code-name')?.addEventListener('change', (e) => {
    if (!active) return;
    setEditing(false);
    store.updateScriptMeta(active.id, { name: (e.target as HTMLInputElement).value });
  });

  container.querySelector('#xl-code-lang')?.addEventListener('change', (e) => {
    if (!active) return;
    setEditing(false);
    store.updateScriptMeta(active.id, { language: (e.target as HTMLSelectElement).value as 'python' | 'javascript' });
  });

  container.querySelectorAll('[data-code-snip]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!textarea || !active) return;
      const snip = (el as HTMLElement).dataset.codeSnip || '';
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      textarea.value = textarea.value.slice(0, start) + snip + textarea.value.slice(end);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + snip.length;
      store.updateScriptContent(active.id, textarea.value, true);
      syncGutter();
    });
  });

  container.querySelector('#xl-code-run')?.addEventListener('click', () => {
    setEditing(false);
    if (textarea && active) {
      store.updateScriptContent(active.id, textarea.value, true);
    }
    store.runActiveScript();
  });
}
