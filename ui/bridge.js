// Bridge between the Deathknell Requiem GUI (Main.dc.html) and the plugin engine (C++).
//
// GUI -> engine: IPlugSendMsg({type: ...}) - a function the plugin's web view injects.
// engine -> GUI: the plugin calls DK.recv({type: ...}).
// Opened in a normal browser (no plugin), everything still works as a mockup.

const DK = (() => {
  // Engine parameter indices (must match EParams in NeuralAmpModeler.h)
  const P = { input: 0, gateThreshold: 1, bass: 2, mid: 3, treble: 4, output: 5, gateActive: 6, eqActive: 7, irOn: 8, chopActive: 13, chopRate: 14 };

  // Pedals, EQ and FX: [gui key, default, type (0 knob, 1 switch, 2 three-way), scope (0 on, 1 vals, 2 per amp slot, 3 state)].
  // Filled in by tools/build_ui.py from kDKParams in NeuralAmpModeler/DKEffects.h; engine index = DK_FIRST + row.
  const DKP = /*DK_PARAMS*/[];
  const DK_FIRST = P.chopRate + 1;

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

  const state = { model: '', ir: '', inLvl: 0, outLvl: 0, live: false, models: [], modelIdx: -1, irs: [], irIdx: -1,
    tunerHz: 0, tunerSmooth: 0, userPresets: [], preset: 'Empty Grave' };
  const tunerSent = { on: null, mute: null };

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
    // Wraith chopper: CHOP footswitch (held) and the Speed knob (note value, 7 steps)
    sendParam(P.chopActive, st.wHeld && st.wHeld.chop ? 1 : 0);
    sendParam(P.chopRate, Math.round(val('wr_Speed', 0.84) * 6) / 6);
    // every pedal, the EQ and the FX
    DKP.forEach(([key, def, type, scope], i) => {
      let g;
      if (scope === 0) g = on[key] === undefined ? def : (on[key] ? 1 : 0);
      else if (scope === 1) g = val(key, def);
      else if (scope === 2) g = val(sk + key, def);
      else g = st[key] ?? def;
      if (type === 1) g = g ? 1 : 0;
      else if (type === 2) g = Math.max(0, Math.min(2, Math.round(g))) / 2;
      sendParam(DK_FIRST + i, g);
    });
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
      else if (idx === P.chopRate) vals.wr_Speed = n;
      else if (idx === P.chopActive) return { wHeld: Object.assign({}, s.wHeld || {}, { chop: n >= 0.5 }) };
      else if (idx >= DK_FIRST && idx < DK_FIRST + DKP.length) {
        const [key, , type, scope] = DKP[idx - DK_FIRST];
        if (scope === 0) on[key] = n >= 0.5;
        else if (scope === 1) vals[key] = n;
        else if (scope === 2) vals[sk + key] = n;
        else return { [key]: type === 2 ? Math.round(n * 2) : n };
      }
      else return null;
      return { vals, on };
    });
  };


  // ---- Presets -------------------------------------------------------------------------
  // Factory presets: only what differs from the defaults. Keys are the GUI keys of the pedals
  // (see DKP), plus gateDb (gate threshold, dB, or null for off), bass/mid/treble (0..10).
  const FACTORY = [
    { name: 'Empty Grave', p: {} },
    { name: 'Last Rites', p: { gateDb: -62, drive: 1, drive_Drive: 0.08, drive_Tone: 0.55, drive_Level: 0.9, eq_lc: 0.3, eq_lm: 0.44, eq_hm: 0.56, eq_hc: 0.82, pres: 0.56, doubler: 1, dbl_Delay: 0.3, reverb: 1, reverb_Size: 0.3, reverb_Decay: 0.25, reverb_Mix: 0.1 } },
    { name: 'Funeral March', p: { gateDb: -65, drive: 1, drive_Drive: 0.45, drive_Tone: 0.45, drive_Level: 0.75, eq_lo: 0.62, eq_hi: 0.44, eq_hc: 0.7, delay: 1, delay_Time: 1 / 6, delay_Fdbk: 0.3, delay_Mix: 0.15, reverb: 1, reverb_Size: 0.85, reverb_Decay: 0.7, reverb_Mix: 0.25 } },
    { name: 'Gravedigger Lead', p: { gateDb: -70, boost: 1, boost_Gain: 0.6, drive: 1, drive_Drive: 0.35, drive_Tone: 0.6, drive_Level: 0.8, eq_hm: 0.6, delay: 1, delay_Time: 2 / 6, delay_Fdbk: 0.35, delay_Mix: 0.22, reverb: 1, reverb_Size: 0.6, reverb_Mix: 0.15 } },
    { name: 'Toll of Doom', p: { gateDb: -55, gateHard: 1, pitch: 1, pitch_Shift: 0, pitch_Mix: 0.5, boost: 1, boost_Gain: 0.4, eq_lc: 0.15, eq_lo: 0.6, eq_hc: 0.75 } },
    { name: 'Whammy from the Crypt', p: { pitch: 1, pitch_Shift: 1, pitch_Mix: 1, drive: 1, drive_Drive: 0.25, drive_Level: 0.85, delay: 1, delay_Time: 0.5, delay_Mix: 0.18, reverb: 1, reverb_Mix: 0.12 } },
    { name: 'Banshee Wail', p: { gateDb: -60, wtrash: 1, wOct: 1, wr_Octave: 0.7, wr_Square: 0.8, wr_Detune: 0.35, wah: 1, wah_Pedal: 0.7, wah_Q: 0.6, delay: 1, delay_Time: 0.5, delay_Fdbk: 0.3, delay_Mix: 0.2 } },
    { name: 'Requiem Clean', p: { gateDb: -80, comp: 1, comp_Sustain: 0.45, comp_Attack: 0.5, schorus: 1, schorus_Rate: 0.25, schorus_Depth: 0.4, schorus_Mix: 0.35, reverb: 1, reverb_Size: 0.55, reverb_Decay: 0.45, reverb_Mix: 0.2, eq_hi: 0.56 } },
    { name: 'Séance', p: { gateDb: -75, comp: 1, comp_Sustain: 0.5, chorus: 1, chorus_Rate: 0.25, chorus_Depth: 0.5, chorus_Mix: 0.4, schorus: 1, schorus_Mix: 0.35, delay: 1, delay_Time: 2 / 6, delay_Fdbk: 0.45, delay_Mix: 0.3, reverb: 1, reverb_Size: 0.9, reverb_Decay: 0.8, reverb_Mix: 0.35 } },
    { name: 'Phantom Phase', p: { phaser: 1, phaser_Rate: 0.2, phaser_Depth: 0.75, delay: 1, delay_Time: 0.5, delay_Fdbk: 0.25, delay_Mix: 0.15 } },
    { name: 'Vortex of Souls', p: { flanger: 1, flanger_Rate: 0.12, flanger_Depth: 0.8, flanger_Fdbk: 0.6, reverb: 1, reverb_Size: 0.7, reverb_Mix: 0.2 } },
    { name: 'Choir of the Dead', p: { chorus: 1, chorus_Rate: 0.3, chorus_Depth: 0.6, chorus_Mix: 0.5, schorus: 1, schorus_Mix: 0.4, delay: 1, delay_Time: 1 / 6, delay_Fdbk: 0.4, delay_Mix: 0.2, reverb: 1, reverb_Size: 0.95, reverb_Decay: 0.9, reverb_Mix: 0.4 } },
    { name: 'Catacomb Drone', p: { comp: 1, comp_Sustain: 0.8, delay: 1, delay_Time: 0, delay_Fdbk: 0.6, delay_Mix: 0.3, reverb: 1, reverb_Size: 1, reverb_Decay: 1, reverb_Mix: 0.5, eq_hc: 0.6 } }
  ];
  // Normalized engine values for a factory preset: defaults, then the preset's own settings.
  const presetValues = (p) => {
    const v = {};
    v[P.input] = 0.5; v[P.output] = 0.5;
    v[P.bass] = (p.bass ?? 5) / 10; v[P.mid] = (p.mid ?? 5) / 10; v[P.treble] = (p.treble ?? 5) / 10;
    const gdb = p.gateDb === undefined ? -80 : p.gateDb;
    v[P.gateActive] = gdb === null ? 0 : 1;
    v[P.gateThreshold] = ((gdb === null ? -80 : gdb) + 100) / 100;
    v[P.eqActive] = 1; v[P.irOn] = 1; v[P.chopRate] = 5 / 6;
    DKP.forEach(([key, def, type], i) => {
      let g = p[key] ?? def;
      if (type === 1) g = g ? 1 : 0;
      else if (type === 2) g = Math.max(0, Math.min(2, Math.round(g))) / 2;
      v[DK_FIRST + i] = g;
    });
    return v;
  };
  const applyFactory = (preset) => {
    const v = presetValues(preset.p);
    Object.keys(v).forEach((k) => { const idx = +k; sendParam(idx, v[k]); applyParam(idx, v[k]); });
    state.preset = preset.name;
    if (instance) instance.forceUpdate();
  };
  const allPresets = () => FACTORY.map((f) => ({ name: f.name, factory: true })).concat(state.userPresets.map((n) => ({ name: n, factory: false })));
  const loadPreset = (item) => {
    if (item.factory) applyFactory(FACTORY.find((f) => f.name === item.name));
    else { send({ type: 'loadPreset', name: item.name }); state.preset = item.name; if (instance) instance.forceUpdate(); }
  };
  const stepPreset = (dir) => {
    const list = allPresets();
    let i = list.findIndex((x) => x.name === state.preset);
    i = i < 0 ? 0 : (i + dir + list.length) % list.length;
    loadPreset(list[i]);
  };

  // Small pop-up menus and the "save preset" box (plain DOM, on top of the GUI)
  let popup = null;
  const closePopup = () => { if (popup) { popup.remove(); popup = null; } };
  const popupBox = (x, y, width) => {
    closePopup();
    popup = document.createElement('div');
    popup.setAttribute('style', 'position: fixed; z-index: 9999; width: ' + width + 'px; max-height: 70vh; overflow-y: auto; padding: 6px 0; background: #15171b; border: 3px solid #0b0b0c; border-radius: 6px; box-shadow: 4px 4px 0 #0b0b0c; font-family: "IBM Plex Sans", sans-serif; font-size: 13px; color: #e9e2d6');
    popup.style.left = Math.max(4, Math.min(x, window.innerWidth - width - 8)) + 'px';
    popup.style.top = y + 'px';
    document.body.appendChild(popup);
    return popup;
  };
  const popupHead = (text) => {
    const h = document.createElement('div');
    h.textContent = text;
    h.setAttribute('style', 'padding: 6px 14px 4px; font-family: "IBM Plex Mono", monospace; font-size: 10px; letter-spacing: 0.14em; color: #9aa1a8');
    popup.appendChild(h);
  };
  const popupItem = (text, on, fn) => {
    const it = document.createElement('div');
    it.textContent = (on ? '✓ ' : ' ') + text;
    it.setAttribute('style', 'padding: 6px 14px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis');
    it.onmouseenter = () => { it.style.background = '#3d434f'; };
    it.onmouseleave = () => { it.style.background = ''; };
    it.onclick = (e) => { e.stopPropagation(); closePopup(); fn(); };
    popup.appendChild(it);
  };
  const presetMenu = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const zoom = parseFloat((document.getElementById('app') || {}).style?.zoom || '1') || 1;
    popupBox(r.left * zoom, (r.bottom + 4) * zoom, 260);
    popupHead('FACTORY PRESETS');
    FACTORY.forEach((f) => popupItem(f.name, f.name === state.preset, () => applyFactory(f)));
    popupHead('YOUR PRESETS');
    if (!state.userPresets.length) {
      const none = document.createElement('div');
      none.textContent = typeof IPlugSendMsg === 'function' ? 'None yet. Click Save to keep your sound.' : 'Saved presets appear here in the plugin.';
      none.setAttribute('style', 'padding: 4px 14px 8px; color: #6c7379; font-size: 12px');
      popup.appendChild(none);
    }
    state.userPresets.forEach((n) => popupItem(n, n === state.preset, () => loadPreset({ name: n, factory: false })));
  };
  const saveBox = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const zoom = parseFloat((document.getElementById('app') || {}).style?.zoom || '1') || 1;
    popupBox(r.left * zoom - 200, (r.bottom + 4) * zoom, 280);
    popupHead('SAVE PRESET AS');
    const row = document.createElement('div');
    row.setAttribute('style', 'display: flex; gap: 6px; padding: 4px 12px 8px');
    const input = document.createElement('input');
    input.value = FACTORY.some((f) => f.name === state.preset) ? '' : state.preset;
    input.placeholder = 'Preset name';
    input.maxLength = 60;
    input.setAttribute('style', 'flex: 1; min-width: 0; height: 30px; padding: 0 8px; background: #0b0b0c; color: #e9e2d6; border: 1px solid #4a5158; border-radius: 4px; font-size: 13px');
    const ok = document.createElement('button');
    ok.textContent = 'Save';
    ok.setAttribute('style', 'height: 30px; padding: 0 12px; background: #d9b46a; color: #1b1e21; border: 0; border-radius: 4px; font-weight: 700; cursor: pointer');
    const doSave = () => {
      const name = input.value.replace(/[<>:"\/\\|?*\u0000-\u001f]/g, '').trim();
      if (!name) { input.focus(); return; }
      send({ type: 'savePreset', name });
      state.preset = name;
      if (!state.userPresets.includes(name)) state.userPresets = state.userPresets.concat([name]);
      closePopup();
      if (instance) instance.forceUpdate();
    };
    ok.onclick = (ev) => { ev.stopPropagation(); doSave(); };
    input.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') doSave(); if (ev.key === 'Escape') closePopup(); };
    row.appendChild(input);
    row.appendChild(ok);
    popup.appendChild(row);
    setTimeout(() => input.focus(), 0);
  };
  document.addEventListener('mousedown', (e) => { if (popup && !popup.contains(e.target)) closePopup(); });

  // ---- Tuner ---------------------------------------------------------------------------
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const tunerFields = (hz, ref, mute, accent) => {
    const title = 'TUNER' + (mute ? ' · OUTPUT MUTED' : '');
    if (!(hz > 20)) {
      return { note: '–', oct: '', title, color: '#6c7379', text: 'Play a single open string', footer: 'Tuner: –',
        needle: 'position: absolute; top: 2px; bottom: 2px; width: 4px; border-radius: 2px; background: #4a5158; left: calc(50% - 2px);' };
    }
    const midiF = 69 + 12 * Math.log2(hz / ref);
    const midi = Math.round(midiF);
    const cents = Math.round((midiF - midi) * 100);
    const inTune = Math.abs(cents) <= 3;
    const color = inTune ? '#6fbf73' : accent;
    const note = NOTE_NAMES[((midi % 12) + 12) % 12];
    return {
      note, oct: String(Math.floor(midi / 12) - 1), title, color,
      needle: 'position: absolute; top: 2px; bottom: 2px; width: 4px; border-radius: 2px; background: ' + color + '; left: calc(' + (50 + Math.max(-50, Math.min(50, cents))) + '% - 2px); transition: left 80ms;',
      text: hz.toFixed(1) + ' Hz · ' + (inTune ? 'in tune' : Math.abs(cents) + ' cents ' + (cents < 0 ? 'flat' : 'sharp')) + ' · A = ' + ref + ' Hz',
      footer: 'Tuner: ' + note + ' ' + (cents > 0 ? '+' : '') + cents + '¢'
    };
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
    } else if (msg.type === 'presetList') {
      state.userPresets = (msg.reset ? [] : state.userPresets).concat(msg.items || []);
    } else if (msg.type === 'tuner') {
      const hz = msg.hz || 0;
      // smooth the reading a little so the needle doesn't jitter
      state.tunerSmooth = hz > 0 && state.tunerSmooth > 0 && Math.abs(Math.log2(hz / state.tunerSmooth)) < 0.03 ? state.tunerSmooth * 0.6 + hz * 0.4 : hz;
      state.tunerHz = state.tunerSmooth;
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
      if (!state.live) return;
      pushFromGui(this.state);
      const st = this.state || {};
      const on = st.view === 'tuner';
      const mute = ((st.opt && st.opt.mute) || 'On') === 'On';
      if (on !== tunerSent.on || mute !== tunerSent.mute) {
        tunerSent.on = on;
        tunerSent.mute = mute;
        send({ type: 'tuner', on, mute });
      }
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
      v.preset = {
        name: state.preset,
        prev: () => stepPreset(-1),
        next: () => stepPreset(1),
        menu: (e) => presetMenu(e),
        save: (e) => saveBox(e)
      };
      if (state.live) {
        const st = this.state || {};
        const opt = st.opt || {};
        const t = tunerFields(state.tunerHz, Number(opt.ref || 440), (opt.mute || 'On') === 'On', v.accent || '#d9b46a');
        v.tuner = Object.assign({}, v.tuner, t);
        v.footerTuner = t.footer;
      } else if (plugin) {
        v.footerInfo = 'Not connected to the sound engine yet' + (v.footerInfo ? ' · ' + v.footerInfo : '');
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
