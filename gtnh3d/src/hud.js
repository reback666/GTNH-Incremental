// HUD: a small DOM overlay on top of the canvas. Deliberately plain (no
// framework) so the single-file build stays tiny.

export function createHud({ onMode, onOverview, onFog, onFollow, onReset }) {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const root = el("div", "hud");
  const top = el("div", "hud-top");
  const title = el("div", "hud-title");
  title.append(el("b", null, "GTNH 3D 自由视图"));
  title.append(el("span", "hud-sub", "ULV / LV · 7×7 方格广场"));
  top.append(title);

  const stats = el("div", "hud-stats");
  top.append(stats);
  root.append(top);

  const help = el("div", "hud-help");
  help.innerHTML = [
    "<b>操作</b>",
    "<kbd>拖拽</kbd> 转视角 &nbsp; <kbd>滚轮</kbd> 速度/距离",
    "<kbd>W A S D</kbd> 移动 &nbsp; <kbd>Space</kbd>/<kbd>Shift</kbd> 升降",
    "<kbd>Ctrl</kbd> 加速 &nbsp; <kbd>F</kbd> 飞行/步行 &nbsp; <kbd>O</kbd> 轨道",
    "<kbd>R</kbd> 复位 &nbsp; <kbd>G</kbd> 总览 &nbsp; <kbd>P</kbd> 雾 &nbsp; <kbd>点击</kbd> 机器信息",
  ].join("<br />");
  root.append(help);

  const bar = el("div", "hud-bar");
  const buttons = [];
  const mkBtn = (label, fn) => {
    const b = el("button", null, label);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      fn(b);
    });
    bar.append(b);
    buttons.push(b);
    return b;
  };
  const flyBtn = mkBtn("飞行", () => onMode("fly"));
  const walkBtn = mkBtn("步行", () => onMode("walk"));
  const orbitBtn = mkBtn("轨道", () => onMode("orbit"));
  const overviewBtn = mkBtn("结构总览", () => onOverview(overviewBtn));
  const fogBtn = mkBtn("雾效", () => onFog(fogBtn));
  mkBtn("复位", () => onReset());
  root.append(bar);

  const panel = el("div", "hud-panel hidden");
  const closeBtn = el("button", "hud-close", "×");
  closeBtn.addEventListener("click", () => hidePanel());
  panel.append(closeBtn);
  const panelBody = el("div", "hud-panel-body");
  panel.append(panelBody);
  root.append(panel);

  const hint = el("div", "hud-hint");
  root.append(hint);

  document.body.append(root);

  function setMode(mode) {
    flyBtn.classList.toggle("on", mode === "fly");
    walkBtn.classList.toggle("on", mode === "walk");
    orbitBtn.classList.toggle("on", mode === "orbit");
  }

  function setStats({ fps, faces, pos, cubes, meshes }) {
    stats.innerHTML =
      `<span>${fps.toFixed(0)} FPS</span>` +
      `<span>${(faces / 1000).toFixed(0)}k 面</span>` +
      `<span>${cubes} 方块</span>` +
      `<span>${meshes} 批次</span>` +
      `<span>X ${pos.x.toFixed(0)} Y ${pos.y.toFixed(0)} Z ${pos.z.toFixed(0)}</span>`;
  }

  function setHint(text) {
    hint.textContent = text || "";
    hint.classList.toggle("show", !!text);
  }

  function showPanel({ title: t, titleEn, rows, sections = [] }) {
    panelBody.innerHTML = "";
    panelBody.append(el("h3", null, t));
    if (titleEn) panelBody.append(el("div", "hud-en", titleEn));
    for (const r of rows) {
      const line = el("div", "hud-row");
      line.append(el("span", "hud-k", r[0]));
      line.append(el("span", "hud-v", r[1]));
      panelBody.append(line);
    }
    for (const s of sections) {
      panelBody.append(el("h4", null, s.title));
      for (const line of s.lines) panelBody.append(el("div", "hud-note", line));
    }
    panel.classList.remove("hidden");
    panel.dataset.open = "1";
  }

  function hidePanel() {
    panel.classList.add("hidden");
    delete panel.dataset.open;
  }

  function isPanelOpen() {
    return panel.dataset.open === "1";
  }

  function toggleButton(btn, on) {
    btn.classList.toggle("on", on);
  }

  return {
    root,
    setMode,
    setStats,
    setHint,
    showPanel,
    hidePanel,
    isPanelOpen,
    toggleButton,
    overviewBtn,
    fogBtn,
  };
}
