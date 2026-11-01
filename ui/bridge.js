// Bridge between the Deathknell Requiem GUI (Main.dc.html) and the plugin engine (C++).
//
// GUI -> engine: IPlugSendMsg({type: ...}) - a function the plugin's web view injects.
// engine -> GUI: the plugin calls DK.recv({type: ...}).
// Opened in a normal browser (no plugin), everything still works as a mockup.

const DK = (() => {
  // Engine parameter indices (must match EParams in NeuralAmpModeler.h)
  const P = { input: 0, gateThreshold: 1, bass: 2, mid: 3, treble: 4, output: 5, gateActive: 6, eqActive: 7, irOn: 8 };

  const clamp = (x) => Math.max(0, Math.min(1, x));
  const baseName = (path) => (path || '').split(/[\\/]/).pop();

  // GUI knob value (0..1, as the mockup uses) <-> engine parameter (normalized 0..1)
  // INPUT knob: -12..+12 dB in the GUI; engine range -20..+20 dB
  const inToEngine = (t) => ((-12 + 24 * t) + 20) / 40;
  const inFromEngine = (n) => clamp(((-20 + 40 * n) + 12) / 24);
  // OUTPUT knob: -24..+12 dB in the GUI; engine range -40..+40 dB
  const outToEngine = (t) => ((-24 + 36 * t) + 40) / 80;
  const outFromEngine = (n) => clamp(((-40 + 80 * n) + 24) / 36);
  // GATE knob: 0 = off, otherwise threshold -90..-20 dB; engine range -100..0 dB
  const gateToEngine = (t) => ((-90 + 70 * t) + 100) / 100;
  const gateFromEngine = (n) => clamp(((-100 + 100 * n) + 90) / 70);

  const state = { model: '', ir: '', inLvl: 0, outLvl: 0, live: false, models: [], modelIdx: -1, irs: [], irIdx: -1 };

  // Capture tone types (from the .nam file's metadata), in the order the plugin sorts them
  const TYPES = [
    { key: 'clean', label: 'CLEAN', color: '#6fbf73' },
    { key: 'crunch', label: 'CRUNCH', color: '#e0b44a' },
    { key: 'overdrive', label: 'DRIVE', color: '#e08a3a' },
    { key: 'hi_gain', label: 'HIGH GAIN', color: '#e5484d' },
    { key: 'fuzz', label: 'FUZZ', color: '#b06ad9' },
    { key: '', label: 'OTHER', color: '#9aa1a8' }
  ];
  const typeOf = (key) => TYPES.find((t) => t.key === (key || '')) || TYPES[TYPES.length - 1];
  const sent = {}; // last normalized value sent for each param, to avoid echo loops
  let instance = null;

  const send = (o) => {
    if (typeof IPlugSendMsg === 'function') IPlugSendMsg(o);
  };

  const sendParam = (idx, value) => {
    value = clamp(value);
    if (sent[idx] !== undefined && Math.abs(sent[idx] - value) < 1e-6) return;
    sent[idx] = value;
    send({ type: 'param', idx, value });
  };

  // Work out the engine parameters from the GUI state and send any that changed.
  const pushFromGui = (st) => {
    st = st || {};
    const vals = st.vals || {};
    const on = Object.assign({ gate: true, cab: true }, st.on || {});
    const sk = 'a' + (st.slot ?? 2) + '_';
    const val = (id, def) => (vals[id] ?? def);
    sendParam(P.input, inToEngine(val(sk + 'in', 0.5)));
    sendParam(P.output, outToEngine(val(sk + 'out', 0.6)));
    sendParam(P.bass, val(sk + 'bass', 0.45));
    sendParam(P.mid, val(sk + 'mid', 0.6));
    sendParam(P.treble, val(sk + 'treble', 0.55));
    const g = val('gate_Gate', 0.5);
    sendParam(P.gateActive, on.gate && g >= 0.01 ? 1 : 0);
    if (g >= 0.01) sendParam(P.gateThreshold, gateToEngine(g));
    sendParam(P.irOn, on.cab ? 1 : 0);
    sendParam(P.eqActive, 1);
  };

  // Apply an engine parameter (from the host, automation or a preset) to the GUI state.
  const applyParam = (idx, n) => {
    sent[idx] = n;
    if (!instance) return;
    instance.setState((s) => {
      s = s || {};
      const vals = Object.assign({}, s.vals || {});
      const on = Object.assign({}, s.on || {});
      const sk = 'a' + (s.slot ?? 2) + '_';
      if (idx === P.input) vals[sk + 'in'] = inFromEngine(n);
      else if (idx === P.output) vals[sk + 'out'] = outFromEngine(n);
      else if (idx === P.bass) vals[sk + 'bass'] = n;
      else if (idx === P.mid) vals[sk + 'mid'] = n;
      else if (idx === P.treble) vals[sk + 'treble'] = n;
      else if (idx === P.gateThreshold) vals.gate_Gate = Math.max(0.01, gateFromEngine(n));
      else if (idx === P.gateActive) on.gate = n >= 0.5;
      else if (idx === P.irOn) on.cab = n >= 0.5;
      else return null;
      return { vals, on };
    });
  };

  const recv = (msg) => {
    if (!msg) return;
    if (msg.type === 'state') {
      state.live = true;
      if (msg.windowScale) state.windowScale = msg.windowScale;
      state.model = msg.model || '';
      state.ir = msg.ir || '';
      (msg.params || []).forEach((n, idx) => applyParam(idx, n));
    } else if (msg.type === 'param') {
      applyParam(msg.idx, msg.value);
    } else if (msg.type === 'files') {
      state.model = msg.model || '';
      state.ir = msg.ir || '';
      if (typeof msg.modelIdx === 'number') state.modelIdx = msg.modelIdx;
      if (typeof msg.irIdx === 'number') state.irIdx = msg.irIdx;
    } else if (msg.type === 'modelList' || msg.type === 'irList') {
      const key = msg.type === 'modelList' ? 'models' : 'irs';
      state[key] = (msg.reset ? [] : state[key]).concat(msg.items || []);
    } else if (msg.type === 'meters') {
      state.inLvl = msg.in || 0;
      state.outLvl = msg.out || 0;
      return; // the GUI's animation timer redraws meters
    }
    if (instance) instance.forceUpdate();
  };

  // Peak (linear) -> 0..1 bar height on a -60..0 dB scale
  const lvl = (x) => (x <= 0.000001 ? 0 : clamp((20 * Math.log10(x) + 60) / 60));
  const bar = (h) => {
    const pc = Math.round(Math.max(0.04, h) * 100);
    return 'width: 7px; height: ' + pc + '%; border-radius: 2px; background: ' + (pc > 88 ? '#e5484d' : pc > 70 ? '#e0b44a' : '#6fbf73') + ';';
  };

  const wrap = (Base) => class extends Base {
    componentDidMount() {
      instance = this;
      if (super.componentDidMount) super.componentDidMount();
      // Ask the plugin for its state. The first replies can be lost while the page is still
      // loading, so keep asking until the state arrives.
      send({ type: 'ready' });
      const retry = setInterval(() => {
        if (state.live || typeof IPlugSendMsg !== 'function') clearInterval(retry);
        else send({ type: 'ready' });
      }, 400);
    }
    componentWillUnmount() {
      if (super.componentWillUnmount) super.componentWillUnmount();
      instance = null;
    }
    componentDidUpdate() {
      if (state.live) pushFromGui(this.state);
    }
    renderVals() {
      const v = super.renderVals() || {};
      const plugin = typeof IPlugSendMsg === 'function';
      v.engine = {
        modelText: state.model ? baseName(state.model) : (plugin ? 'No capture loaded. Click "Load capture…" and pick a .nam file from Tone3000.' : '[capture file].nam · Capture by [CREATOR NAME] on Tone3000 · CC BY'),
        irText: state.ir ? baseName(state.ir) : (plugin ? 'No IR loaded. Click "Load IR…" and pick a cab .wav file.' : (v.cabCur && v.cabCur.ir) || ''),
        loadModel: () => send({ type: 'loadModel' }),
        loadIR: () => send({ type: 'loadIR' }),
        prevModel: () => send({ type: 'stepModel', dir: -1 }),
        nextModel: () => send({ type: 'stepModel', dir: 1 }),
        prevIR: () => send({ type: 'stepIR', dir: -1 }),
        nextIR: () => send({ type: 'stepIR', dir: 1 }),
        modelType: '', modelTypeStyle: '', modelPos: '', modelTypes: [], hasTypes: false
      };
      const cur = state.models[state.modelIdx];
      if (state.model && cur) {
        const t = typeOf(cur.t);
        v.engine.modelType = '\u00b7 ' + t.label;
        v.engine.modelTypeStyle = 'color: ' + t.color + '; font-weight: 500';
        v.engine.modelPos = '\u00b7 ' + (state.modelIdx + 1) + ' / ' + state.models.length;
        v.engine.modelText = cur.n;
      }
      if (state.models.length > 1) {
        const present = TYPES.filter((t) => state.models.some((m) => (m.t || '') === t.key));
        v.engine.hasTypes = present.length > 1;
        v.engine.modelTypes = present.map((t) => {
          const count = state.models.filter((m) => (m.t || '') === t.key).length;
          const active = cur && (cur.t || '') === t.key;
          return {
            label: t.label + ' ' + count,
            style: 'height: 26px; padding: 0 10px; border-radius: 13px; border: 2px solid #0b0b0c; font-family: \'IBM Plex Mono\', monospace; font-size: 11px; letter-spacing: 0.08em; cursor: pointer; '
              + (active ? 'background: ' + t.color + '; color: #0b0b0c;' : 'background: #15171b; color: ' + t.color + ';'),
            pick: () => send({ type: 'pickModel', index: state.models.findIndex((m) => (m.t || '') === t.key) })
          };
        });
      }
      if (state.ir && state.irs.length && state.irIdx >= 0) {
        v.engine.irText = state.irs[state.irIdx].n + '  \u00b7 ' + (state.irIdx + 1) + ' / ' + state.irs.length;
      }
      if (state.live && v.meters) {
        const i = lvl(state.inLvl), o = lvl(state.outLvl);
        v.meters = Object.assign({}, v.meters, { inL: bar(i), inR: bar(i), outL: bar(o), outR: bar(o) });
      }
      return v;
    }
  };

  // Fit the 1100px-wide design to the window, whatever size the plugin window is.
  const fit = () => {
    const app = document.getElementById('app');
    if (app && window.innerWidth > 0) app.style.zoom = String(window.innerWidth / 1100);
  };
  window.addEventListener('resize', fit);
  setTimeout(fit, 0);

  // Right-click menu: window size (like most amp plugins)
  const SIZES = [
    { label: 'Small', scale: 0.8 },
    { label: 'Medium', scale: 1.0 },
    { label: 'Large', scale: 1.18 }
  ];
  let menu = null;
  const closeMenu = () => { if (menu) { menu.remove(); menu = null; } };
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    closeMenu();
    menu = document.createElement('div');
    menu.setAttribute('style', 'position: fixed; z-index: 9999; min-width: 150px; padding: 6px 0; background: #15171b; border: 3px solid #0b0b0c; border-radius: 6px; box-shadow: 4px 4px 0 #0b0b0c; font-family: "IBM Plex Sans", sans-serif; font-size: 13px; color: #e9e2d6');
    const head = document.createElement('div');
    head.textContent = 'WINDOW SIZE';
    head.setAttribute('style', 'padding: 4px 14px 6px; font-family: "IBM Plex Mono", monospace; font-size: 10px; letter-spacing: 0.14em; color: #9aa1a8');
    menu.appendChild(head);
    const current = state.windowScale || window.innerWidth / (1100 * 0.85);
    SIZES.forEach((sz) => {
      const item = document.createElement('div');
      const on = Math.abs(current - sz.scale) < 0.05 || (typeof IPlugSendMsg !== 'function' && sz.scale === 1.0);
      item.textContent = (on ? '\u2713 ' : '\u2003') + sz.label;
      item.setAttribute('style', 'padding: 6px 14px; cursor: pointer');
      item.onmouseenter = () => { item.style.background = '#3d434f'; };
      item.onmouseleave = () => { item.style.background = ''; };
      item.onclick = () => { closeMenu(); state.windowScale = sz.scale; send({ type: 'windowSize', scale: sz.scale }); };
      menu.appendChild(item);
    });
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(e.clientX, window.innerWidth - r.width - 4) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - r.height - 4) + 'px';
  });
  document.addEventListener('mousedown', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  const api = { recv, wrap, send, state };
  window.DK = api;
  return api;
})();
