// Deathknell Requiem effects engine.
//
// Everything around the amp capture that isn't NAM itself:
//   before the amp:  Pitch (whammy) > Wah > Wraith octave fuzz > Comp > Overdrive > Boost > Phaser > Chorus > Flanger
//   after the cab:   EQ (low cut, 4 bands, high cut) + presence > Doubler > Room > Stereo Chorus > Delay > Reverb
//   FX volume = level of the Stereo Chorus, Delay and Reverb; Master input / output at the very start and end
//
// The table kDKParams below is the single list of these controls. The plugin makes one
// host parameter per row (so they're saved with the project and can be automated), and
// tools/build_ui.py reads the same rows to tell the GUI which knob or switch drives which
// parameter. Every value is 0..1 the way the GUI's knobs are, except switches (0/1) and
// the Wraith octave switch (0, 1, 2).
#pragma once

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <vector>

namespace dk
{
enum DKParamType
{
  kKnob = 0, // 0..1
  kSwitch, // off / on
  kChoice3 // 0, 1, 2
};

// Where the GUI keeps the value: on = st.on[key], val = st.vals[key],
// slot = st.vals['a<slot>_' + key] (per amp slot), state = st[key]
enum DKGuiScope
{
  kOn = 0,
  kVal,
  kSlot,
  kState
};

struct DKParamDef
{
  const char* key;
  const char* name;
  double def;
  DKParamType type;
  DKGuiScope scope;
};

// clang-format off
// build_ui.py parses these rows: keep one per line, in this exact shape.
static const DKParamDef kDKParams[] = {
  {"pitch", "Pitch", 0, kSwitch, kOn},
  {"pitch_Shift", "Pitch shift", 0.5, kKnob, kVal},
  {"pitch_Mix", "Pitch mix", 1, kKnob, kVal},
  {"wah", "Wah", 0, kSwitch, kOn},
  {"wah_Pedal", "Wah pedal", 0.45, kKnob, kVal},
  {"wah_Q", "Wah Q", 0.5, kKnob, kVal},
  {"wtrash", "Trash", 0, kSwitch, kOn},
  {"wr_Detune", "Trash detune", 0.3, kKnob, kVal},
  {"wr_Square", "Trash square", 0.7, kKnob, kVal},
  {"wr_Octave", "Trash octave", 0.5, kKnob, kVal},
  {"wOct", "Trash octave mode", 0, kChoice3, kState},
  {"comp", "Comp", 0, kSwitch, kOn},
  {"comp_Sustain", "Comp sustain", 0.55, kKnob, kVal},
  {"comp_Attack", "Comp attack", 0.4, kKnob, kVal},
  {"comp_Level", "Comp level", 0.6, kKnob, kVal},
  {"drive", "Overdrive", 0, kSwitch, kOn},
  {"drive_Drive", "Overdrive drive", 0.2, kKnob, kVal},
  {"drive_Tone", "Overdrive tone", 0.6, kKnob, kVal},
  {"drive_Level", "Overdrive level", 0.8, kKnob, kVal},
  {"boost", "Boost", 0, kSwitch, kOn},
  {"boost_Gain", "Boost gain", 0.5, kKnob, kVal},
  {"phaser", "Phaser", 0, kSwitch, kOn},
  {"phaser_Rate", "Phaser rate", 0.3, kKnob, kVal},
  {"phaser_Depth", "Phaser depth", 0.6, kKnob, kVal},
  {"chorus", "Chorus", 0, kSwitch, kOn},
  {"chorus_Rate", "Chorus rate", 0.35, kKnob, kVal},
  {"chorus_Depth", "Chorus depth", 0.5, kKnob, kVal},
  {"chorus_Mix", "Chorus mix", 0.5, kKnob, kVal},
  {"flanger", "Flanger", 0, kSwitch, kOn},
  {"flanger_Rate", "Flanger rate", 0.2, kKnob, kVal},
  {"flanger_Depth", "Flanger depth", 0.7, kKnob, kVal},
  {"flanger_Fdbk", "Flanger feedback", 0.4, kKnob, kVal},
  {"pres", "Presence", 0.5, kKnob, kSlot},
  {"eq_lc", "EQ low cut", 0, kKnob, kSlot},
  {"eq_lo", "EQ low", 0.5, kKnob, kSlot},
  {"eq_lm", "EQ low mid", 0.5, kKnob, kSlot},
  {"eq_hm", "EQ high mid", 0.5, kKnob, kSlot},
  {"eq_hi", "EQ high", 0.5, kKnob, kSlot},
  {"eq_hc", "EQ high cut", 1, kKnob, kSlot},
  {"c_mix", "Cab mix", 1, kKnob, kVal},
  {"c_lvl", "Cab level", 0.5, kKnob, kVal},
  {"c_room", "Cab room", 0, kKnob, kVal},
  {"doubler", "Doubler", 0, kSwitch, kOn},
  {"dbl_Delay", "Doubler delay", 0.35, kKnob, kVal},
  {"schorus", "Stereo chorus", 0, kSwitch, kOn},
  {"schorus_Rate", "Stereo chorus rate", 0.3, kKnob, kVal},
  {"schorus_Depth", "Stereo chorus depth", 0.45, kKnob, kVal},
  {"schorus_Mix", "Stereo chorus mix", 0.3, kKnob, kVal},
  {"delay", "Delay", 0, kSwitch, kOn},
  {"delay_Time", "Delay time", 0.5, kKnob, kVal},
  {"delay_Fdbk", "Delay feedback", 0.35, kKnob, kVal},
  {"delay_Mix", "Delay mix", 0.25, kKnob, kVal},
  {"reverb", "Reverb", 0, kSwitch, kOn},
  {"reverb_Size", "Reverb size", 0.6, kKnob, kVal},
  {"reverb_Decay", "Reverb decay", 0.45, kKnob, kVal},
  {"reverb_Mix", "Reverb mix", 0.18, kKnob, kVal},
  {"fx_Volume", "FX volume", 0.857, kKnob, kVal},
  {"gateHard", "Gate hard", 1, kSwitch, kOn},
  {"m_In", "Master input", 0.6667, kKnob, kVal},
  {"m_Out", "Master output", 0.6667, kKnob, kVal},
};
// clang-format on

// Indices into kDKParams (same order as the table)
enum DKParam
{
  pPitch = 0, pPitchShift, pPitchMix,
  pWah, pWahPedal, pWahQ,
  pTrash, pTrashDetune, pTrashSquare, pTrashOctave, pTrashOctMode,
  pComp, pCompSustain, pCompAttack, pCompLevel,
  pDrive, pDriveDrive, pDriveTone, pDriveLevel,
  pBoost, pBoostGain,
  pPhaser, pPhaserRate, pPhaserDepth,
  pChorus, pChorusRate, pChorusDepth, pChorusMix,
  pFlanger, pFlangerRate, pFlangerDepth, pFlangerFdbk,
  pPresence, pEqLowCut, pEqLow, pEqLowMid, pEqHighMid, pEqHigh, pEqHighCut,
  pCabMix, pCabLevel, pCabRoom,
  pDoubler, pDoublerDelay,
  pSChorus, pSChorusRate, pSChorusDepth, pSChorusMix,
  pDelay, pDelayTime, pDelayFdbk, pDelayMix,
  pReverb, pReverbSize, pReverbDecay, pReverbMix,
  pFxVolume, pGateHard,
  pMasterIn, pMasterOut,
  kNumDKParams
};
static_assert(sizeof(kDKParams) / sizeof(kDKParams[0]) == kNumDKParams, "kDKParams and DKParam must match");

constexpr double kPi = 3.14159265358979323846;
inline double DbToGain(double db) { return std::pow(10.0, db / 20.0); }
inline double Lerp(double a, double b, double t) { return a + (b - a) * t; }

// Note lengths in beats, matching the GUI's "notes" knobs: 1/2, 1/4, 1/4., 1/8, 1/8T, 1/16, 1/32
inline double NoteBeats(double t)
{
  static const double beats[] = {2.0, 1.0, 1.5, 0.5, 1.0 / 3.0, 0.25, 0.125};
  return beats[std::clamp((int)std::lround(t * 6.0), 0, 6)];
}

// ---------------------------------------------------------------------------------------------
// Building blocks

struct Smooth
{
  double v = 0.0, k = 1.0;
  void Init(double sr, double seconds, double value)
  {
    k = 1.0 - std::exp(-1.0 / (seconds * sr));
    v = value;
  }
  double Next(double target) { return v += (target - v) * k; }
};

// Fades an effect in and out over ~15 ms so switching it doesn't click.
struct Fade
{
  double g = 0.0, k = 0.001;
  bool on = false;
  bool justStarted = false;
  void Init(double sr) { k = 1.0 - std::exp(-1.0 / (0.015 * sr)); }
  void Set(bool o)
  {
    justStarted = o && !on && g < 1e-4;
    on = o;
  }
  bool Active() const { return on || g > 1e-4; }
  double Next()
  {
    g += ((on ? 1.0 : 0.0) - g) * k;
    if (!on && g <= 1e-4)
      g = 0.0;
    return g;
  }
};

struct Biquad
{
  double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
  void Reset() { z1 = z2 = 0; }
  double Process(double x)
  {
    const double y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  }
  void Set(double B0, double B1, double B2, double A0, double A1, double A2)
  {
    b0 = B0 / A0;
    b1 = B1 / A0;
    b2 = B2 / A0;
    a1 = A1 / A0;
    a2 = A2 / A0;
  }
  static double W(double sr, double f) { return 2.0 * kPi * std::clamp(f, 10.0, 0.45 * sr) / sr; }
  void LowPass(double sr, double f, double q)
  {
    const double w = W(sr, f), c = std::cos(w), al = std::sin(w) / (2 * q);
    Set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
  }
  void HighPass(double sr, double f, double q)
  {
    const double w = W(sr, f), c = std::cos(w), al = std::sin(w) / (2 * q);
    Set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  }
  void Peak(double sr, double f, double q, double db)
  {
    const double w = W(sr, f), c = std::cos(w), al = std::sin(w) / (2 * q), A = std::pow(10.0, db / 40.0);
    Set(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
  }
  void HighShelf(double sr, double f, double db)
  {
    const double w = W(sr, f), c = std::cos(w), A = std::pow(10.0, db / 40.0), sq = std::sqrt(A);
    const double al = std::sin(w) / 2 * std::sqrt(2.0);
    Set(A * ((A + 1) + (A - 1) * c + 2 * sq * al), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - 2 * sq * al),
        (A + 1) - (A - 1) * c + 2 * sq * al, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - 2 * sq * al);
  }
};

struct OnePoleHP
{
  double a = 0.99, x1 = 0, y1 = 0;
  void Set(double sr, double f) { a = std::exp(-2.0 * kPi * f / sr); }
  void Reset() { x1 = y1 = 0; }
  double Process(double x)
  {
    const double y = a * (y1 + x - x1);
    x1 = x;
    y1 = y;
    return y;
  }
};

struct OnePoleLP
{
  double a = 0.5, y = 0;
  void Set(double sr, double f) { a = 1.0 - std::exp(-2.0 * kPi * f / sr); }
  void Reset() { y = 0; }
  double Process(double x) { return y += (x - y) * a; }
};

struct DelayLine
{
  std::vector<double> buf;
  size_t mask = 0, w = 0;
  void Init(size_t maxSamples)
  {
    size_t n = 1;
    while (n < maxSamples + 4)
      n <<= 1;
    buf.assign(n, 0.0);
    mask = n - 1;
    w = 0;
  }
  void Clear() { std::fill(buf.begin(), buf.end(), 0.0); }
  void Push(double x)
  {
    buf[w] = x;
    w = (w + 1) & mask;
  }
  // d = how many samples before the most recent pushed one (fractional, linear interpolation)
  double Read(double d) const
  {
    const double pos = (double)w - 1.0 - d;
    const double fl = std::floor(pos);
    const long i = (long)fl;
    const double f = pos - fl;
    const double a = buf[(size_t)i & mask], b = buf[(size_t)(i + 1) & mask];
    return a + (b - a) * f;
  }
  double ReadInt(size_t d) const { return buf[(w - 1 - d) & mask]; }
};

// ---------------------------------------------------------------------------------------------
// Effects

// Whammy-style pitch shifter: two read heads sweep through a 50 ms delay line at the new
// speed, each faded in and out so the jumps back are never heard.
struct PitchShifter
{
  DelayLine d;
  double win = 2400, phase = 0;
  Smooth ratio;
  void Init(double sr)
  {
    win = 0.05 * sr;
    d.Init((size_t)win + 8);
    phase = 0;
    ratio.Init(sr, 0.03, 1.0);
  }
  void Clear() { d.Clear(); }
  double Process(double x, double targetRatio)
  {
    d.Push(x);
    const double r = ratio.Next(targetRatio);
    phase += (1.0 - r) / win;
    phase -= std::floor(phase);
    double p2 = phase + 0.5;
    p2 -= std::floor(p2);
    const double s1 = std::sin(kPi * phase), s2 = std::sin(kPi * p2);
    return d.Read(phase * win) * s1 * s1 + d.Read(p2 * win) * s2 * s2;
  }
};

// Wah: a resonant band-pass (state variable filter) swept from 350 Hz (heel) to 2.2 kHz (toe).
struct Wah
{
  double ic1 = 0, ic2 = 0, sr = 48000;
  Smooth pedal;
  void Init(double s)
  {
    sr = s;
    ic1 = ic2 = 0;
    pedal.Init(sr, 0.02, 0.45);
  }
  void Clear() { ic1 = ic2 = 0; }
  double Process(double x, double pedalTarget, double qKnob)
  {
    const double p = pedal.Next(pedalTarget);
    const double f = 350.0 * std::pow(2200.0 / 350.0, p);
    const double Q = 2.0 + 8.0 * qKnob;
    const double g = std::tan(kPi * f / sr), k = 1.0 / Q;
    const double a1 = 1.0 / (1.0 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const double v3 = x - ic2;
    const double v1 = a1 * ic1 + a2 * v3;
    const double v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return 2.6 * k * v1 + 0.25 * v2;
  }
};

// Wraith TRASH: octave-up fuzz. Rectifying the signal doubles its pitch (+1 octave), doing it
// again gives +2. Square = how hard the fuzz clips, Octave = how much octave is mixed in,
// Detune = a slightly wobbling second voice that thickens it.
struct OctaveFuzz
{
  OnePoleHP inHP, dc1, dc2, outDC;
  Biquad outLP;
  DelayLine det;
  double lfo = 0, sr = 48000;
  void Init(double s)
  {
    sr = s;
    inHP.Set(sr, 90.0);
    dc1.Set(sr, 40.0);
    dc2.Set(sr, 40.0);
    outDC.Set(sr, 30.0);
    outLP.LowPass(sr, 5500.0, 0.707);
    det.Init((size_t)(0.03 * sr));
    Clear();
  }
  void Clear()
  {
    inHP.Reset();
    dc1.Reset();
    dc2.Reset();
    outDC.Reset();
    outLP.Reset();
    det.Clear();
  }
  double Process(double x, double detune, double square, double octMix, int mode)
  {
    const double in = inHP.Process(x) * 3.0;
    const double o1 = dc1.Process(std::fabs(in));
    const double o2 = dc2.Process(std::fabs(o1)) * 1.5;
    const double oct = mode == 0 ? o1 : mode == 1 ? o2 : 0.6 * (o1 + o2);
    double v = in * (1.0 - octMix) + oct * 2.0 * octMix;
    det.Push(v);
    lfo += 0.35 / sr;
    lfo -= std::floor(lfo);
    const double dd = (0.006 + 0.004 * detune * std::sin(2 * kPi * lfo)) * sr;
    v += det.Read(dd) * 0.8 * detune;
    const double g = 3.0 + 250.0 * square * square;
    const double y = std::tanh(g * v + 0.15) - std::tanh(0.15);
    return outDC.Process(outLP.Process(y)) * 0.15;
  }
};

// Compressor: the more Sustain, the lower the threshold and the higher the ratio.
// Attack: how long it lets the pick attack through before clamping down.
struct Compressor
{
  double env = 0, grDb = 0, sr = 48000, relEnv = 0.999, relGr = 0.999;
  void Init(double s)
  {
    sr = s;
    env = grDb = 0;
    relEnv = std::exp(-1.0 / (0.05 * sr));
    relGr = std::exp(-1.0 / (0.15 * sr));
  }
  void Clear() { env = grDb = 0; }
  double Process(double x, double sustain, double attack, double level)
  {
    const double a = std::fabs(x);
    env = a > env ? a : env * relEnv + a * (1.0 - relEnv);
    const double thr = -12.0 - 30.0 * sustain, ratio = 2.0 + 8.0 * sustain;
    const double lvl = 20.0 * std::log10(env + 1e-9);
    const double target = lvl > thr ? -(lvl - thr) * (1.0 - 1.0 / ratio) : 0.0;
    const double att = std::exp(-1.0 / ((0.0005 + 0.05 * attack) * sr));
    const double c = target < grDb ? att : relGr;
    grDb = target + (grDb - target) * c;
    const double makeup = -thr * (1.0 - 1.0 / ratio) * 0.4;
    return x * DbToGain(grDb + makeup - 15.0 + 25.0 * level);
  }
};

// Overdrive in the style of the classic green mid-hump pedals: the highs (above ~720 Hz) are
// clipped and added back on top of the clean signal, then a tone filter and level.
struct Overdrive
{
  OnePoleHP hp;
  Biquad tone;
  double sr = 48000, lastTone = -1;
  void Init(double s)
  {
    sr = s;
    hp.Set(sr, 720.0);
    lastTone = -1;
    Clear();
  }
  void Clear()
  {
    hp.Reset();
    tone.Reset();
  }
  void Update(double toneKnob)
  {
    if (std::fabs(toneKnob - lastTone) > 1e-4)
    {
      tone.LowPass(sr, 700.0 * std::pow(10.0, toneKnob), 0.707);
      lastTone = toneKnob;
    }
  }
  double Process(double x, double drive, double level)
  {
    const double g = 2.0 + 150.0 * drive * drive;
    const double y = 0.6 * x + 0.5 * std::tanh(g * hp.Process(x));
    return tone.Process(y) * DbToGain(-24.0 + 30.0 * level);
  }
};

// Phaser: four all-pass stages whose corner frequency is swept by an LFO.
struct Phaser
{
  double x1[4] = {0}, y1[4] = {0}, lfo = 0, fb = 0, sr = 48000;
  void Init(double s)
  {
    sr = s;
    Clear();
  }
  void Clear()
  {
    for (int i = 0; i < 4; i++)
      x1[i] = y1[i] = 0;
    fb = 0;
  }
  double Process(double x, double rate, double depth)
  {
    lfo += (0.1 + 4.9 * rate) / sr;
    lfo -= std::floor(lfo);
    const double f = 650.0 * std::pow(2.0, depth * 2.3 * std::sin(2 * kPi * lfo));
    const double t = std::tan(kPi * std::min(f, 0.45 * sr) / sr);
    const double a = (t - 1.0) / (t + 1.0);
    double v = x + 0.45 * fb;
    for (int i = 0; i < 4; i++)
    {
      const double y = a * (v - y1[i]) + x1[i];
      x1[i] = v;
      y1[i] = y;
      v = y;
    }
    fb = v;
    return 0.6 * (x + v);
  }
};

// Chorus / flanger: a short delay whose length is wobbled by an LFO, mixed with the dry sound.
struct ModDelay
{
  DelayLine d;
  double lfo = 0, sr = 48000, fbSample = 0;
  void Init(double s, double phase0 = 0.0)
  {
    sr = s;
    d.Init((size_t)(0.03 * sr));
    lfo = phase0;
    fbSample = 0;
  }
  void Clear()
  {
    d.Clear();
    fbSample = 0;
  }
  // Returns the wet (delayed) signal.
  double Process(double x, double rateHz, double centerMs, double depthMs, double feedback)
  {
    lfo += rateHz / sr;
    lfo -= std::floor(lfo);
    d.Push(x + feedback * fbSample);
    const double ms = std::max(0.05, centerMs + depthMs * std::sin(2 * kPi * lfo));
    fbSample = d.Read(ms * 0.001 * sr);
    return fbSample;
  }
};

// Echo: tempo-synced delay; the repeats get darker each time round, like tape.
struct Echo
{
  DelayLine d;
  Biquad lp;
  OnePoleHP hp;
  Smooth time;
  double sr = 48000;
  bool snap = true; // jump straight to the first delay time instead of gliding to it
  void Init(double s)
  {
    sr = s;
    d.Init((size_t)(4.0 * sr));
    lp.LowPass(sr, 3800.0, 0.6);
    hp.Set(sr, 90.0);
    time.Init(sr, 0.15, 0.25 * sr);
  }
  void Clear()
  {
    d.Clear();
    lp.Reset();
    hp.Reset();
    snap = true;
  }
  double Process(double x, double samples, double fdbk)
  {
    if (snap)
    {
      time.v = std::clamp(samples, 1.0, 3.9 * sr);
      snap = false;
    }
    const double t = time.Next(std::clamp(samples, 1.0, 3.9 * sr));
    const double wet = d.Read(t);
    d.Push(x + hp.Process(lp.Process(wet)) * std::min(0.95, fdbk));
    return wet;
  }
};

// Reverb: the well-known public-domain "Freeverb" design (8 combs + 4 all-passes per side).
struct Reverb
{
  struct Comb
  {
    std::vector<double> b;
    size_t i = 0, len = 1;
    double store = 0;
    double Process(double x, double fb, double damp)
    {
      const double out = b[i];
      store = out * (1.0 - damp) + store * damp;
      b[i] = x + store * fb;
      if (++i >= len)
        i = 0;
      return out;
    }
  };
  struct AllPass
  {
    std::vector<double> b;
    size_t i = 0, len = 1;
    double Process(double x)
    {
      const double bo = b[i];
      b[i] = x + bo * 0.5;
      if (++i >= len)
        i = 0;
      return bo - x;
    }
  };
  Comb combL[8], combR[8];
  AllPass apL[4], apR[4];
  double sr = 48000, lastSize = -1;
  static constexpr int kCombs[8] = {1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617};
  static constexpr int kAps[4] = {556, 441, 341, 225};
  static constexpr int kSpread = 23;
  void Init(double s)
  {
    sr = s;
    const double k = sr / 44100.0 * 1.5; // room for the largest size
    for (int c = 0; c < 8; c++)
    {
      combL[c].b.assign((size_t)((kCombs[c]) * k) + 2, 0.0);
      combR[c].b.assign((size_t)((kCombs[c] + kSpread) * k) + 2, 0.0);
    }
    for (int a = 0; a < 4; a++)
    {
      apL[a].b.assign((size_t)(kAps[a] * sr / 44100.0) + 2, 0.0);
      apR[a].b.assign((size_t)((kAps[a] + kSpread) * sr / 44100.0) + 2, 0.0);
      apL[a].len = apL[a].b.size() - 1;
      apR[a].len = apR[a].b.size() - 1;
      apL[a].i = apR[a].i = 0;
    }
    lastSize = -1;
    SetSize(0.6);
  }
  void Clear()
  {
    for (int c = 0; c < 8; c++)
    {
      std::fill(combL[c].b.begin(), combL[c].b.end(), 0.0);
      std::fill(combR[c].b.begin(), combR[c].b.end(), 0.0);
      combL[c].store = combR[c].store = 0;
    }
    for (int a = 0; a < 4; a++)
    {
      std::fill(apL[a].b.begin(), apL[a].b.end(), 0.0);
      std::fill(apR[a].b.begin(), apR[a].b.end(), 0.0);
    }
  }
  void SetSize(double size)
  {
    if (std::fabs(size - lastSize) < 0.01)
      return;
    lastSize = size;
    const double k = sr / 44100.0 * (0.5 + size);
    for (int c = 0; c < 8; c++)
    {
      combL[c].len = std::clamp((size_t)(kCombs[c] * k), (size_t)1, combL[c].b.size() - 1);
      combR[c].len = std::clamp((size_t)((kCombs[c] + kSpread) * k), (size_t)1, combR[c].b.size() - 1);
      if (combL[c].i >= combL[c].len)
        combL[c].i = 0;
      if (combR[c].i >= combR[c].len)
        combR[c].i = 0;
    }
  }
  void Process(double inL, double inR, double decay, double& outL, double& outR)
  {
    const double fb = 0.7 + 0.28 * decay, damp = 0.35;
    const double in = (inL + inR) * 0.015;
    double l = 0, r = 0;
    for (int c = 0; c < 8; c++)
    {
      l += combL[c].Process(in, fb, damp);
      r += combR[c].Process(in, fb, damp);
    }
    for (int a = 0; a < 4; a++)
    {
      l = apL[a].Process(l);
      r = apR[a].Process(r);
    }
    outL = l * 3.0;
    outR = r * 3.0;
  }
};

// Tuner: finds the pitch of a mono buffer with the YIN method. Returns 0 if there's no clear note.
inline double DetectPitch(const float* x, int n, double sr)
{
  const int w = n / 2;
  const int tauMin = std::max(2, (int)(sr / 1400.0));
  const int tauMax = std::min(w - 1, (int)(sr / 28.0));
  double energy = 0.0;
  for (int i = 0; i < n; i++)
    energy += (double)x[i] * x[i];
  if (std::sqrt(energy / n) < 0.003)
    return 0.0; // too quiet
  std::vector<double> d((size_t)tauMax + 2, 0.0);
  for (int tau = 1; tau <= tauMax + 1; tau++)
  {
    double sum = 0.0;
    for (int i = 0; i < w; i++)
    {
      const double diff = (double)x[i] - x[i + tau];
      sum += diff * diff;
    }
    d[(size_t)tau] = sum;
  }
  // cumulative mean normalised difference
  double running = 0.0;
  d[0] = 1.0;
  for (int tau = 1; tau <= tauMax + 1; tau++)
  {
    running += d[(size_t)tau];
    d[(size_t)tau] = running > 0.0 ? d[(size_t)tau] * tau / running : 1.0;
  }
  int best = -1;
  for (int tau = tauMin; tau <= tauMax; tau++)
  {
    if (d[(size_t)tau] < 0.15)
    {
      while (tau + 1 <= tauMax && d[(size_t)tau + 1] < d[(size_t)tau])
        tau++;
      best = tau;
      break;
    }
  }
  if (best < 0)
    return 0.0;
  const double a = d[(size_t)best - 1], b = d[(size_t)best], c = d[(size_t)best + 1];
  const double den = a - 2.0 * b + c;
  const double shift = std::fabs(den) > 1e-12 ? 0.5 * (a - c) / den : 0.0;
  return sr / (best + std::clamp(shift, -1.0, 1.0));
}

// ---------------------------------------------------------------------------------------------
// The whole chain

class FxChain
{
public:
  void Reset(double sampleRate)
  {
    mSR = sampleRate;
    for (auto& f : mFades)
      f.Init(mSR);
    mPitch.Init(mSR);
    mWah.Init(mSR);
    mFuzz.Init(mSR);
    mComp.Init(mSR);
    mDrive.Init(mSR);
    mPhaser.Init(mSR);
    mChorus.Init(mSR);
    mFlanger.Init(mSR);
    mSChorusL.Init(mSR, 0.0);
    mSChorusR.Init(mSR, 0.5);
    mEcho.Init(mSR);
    mReverb.Init(mSR);
    mDoubler.Init((size_t)(0.05 * mSR));
    mRoom.Init((size_t)(0.05 * mSR));
    mDoublerTime.Init(mSR, 0.05, 0.015 * mSR);
    mBoostGain.Init(mSR, 0.02, 1.0);
    mCabLevel.Init(mSR, 0.02, 1.0);
    mFxVolume.Init(mSR, 0.02, 1.0);
    mPitchMix.Init(mSR, 0.02, 1.0);
    mMasterIn.Init(mSR, 0.02, 1.0);
    mMasterOut.Init(mSR, 0.02, 1.0);
    for (auto& b : mEq)
      b.Reset();
    mLastEq.assign(8, -1.0);
    mEqLowCutOn = mEqHighCutOn = false;
  }

  // v = the values of kDKParams; tempo in BPM (0 if the host gives none)
  void SetParams(const double* v, double tempo, bool chopHeld)
  {
    for (int i = 0; i < kNumDKParams; i++)
      mV[i] = v[i];
    mTempo = tempo > 1.0 ? tempo : 120.0;
    mFades[fPitch].Set(v[pPitch] > 0.5);
    mFades[fWah].Set(v[pWah] > 0.5);
    mFades[fTrash].Set(v[pTrash] > 0.5 || chopHeld); // holding CHOP also kicks in the fuzz, like on the pedal
    mFades[fComp].Set(v[pComp] > 0.5);
    mFades[fDrive].Set(v[pDrive] > 0.5);
    mFades[fBoost].Set(v[pBoost] > 0.5);
    mFades[fPhaser].Set(v[pPhaser] > 0.5);
    mFades[fChorus].Set(v[pChorus] > 0.5);
    mFades[fFlanger].Set(v[pFlanger] > 0.5);
    mFades[fDoubler].Set(v[pDoubler] > 0.5);
    mFades[fSChorus].Set(v[pSChorus] > 0.5);
    mFades[fDelay].Set(v[pDelay] > 0.5);
    mFades[fReverb].Set(v[pReverb] > 0.5);
    mFades[fRoom].Set(v[pCabRoom] > 0.005);
    if (mFades[fPitch].justStarted) mPitch.Clear();
    if (mFades[fWah].justStarted) mWah.Clear();
    if (mFades[fTrash].justStarted) mFuzz.Clear();
    if (mFades[fComp].justStarted) mComp.Clear();
    if (mFades[fDrive].justStarted) mDrive.Clear();
    if (mFades[fPhaser].justStarted) mPhaser.Clear();
    if (mFades[fChorus].justStarted) mChorus.Clear();
    if (mFades[fFlanger].justStarted) mFlanger.Clear();
    if (mFades[fDoubler].justStarted) mDoubler.Clear();
    if (mFades[fRoom].justStarted) mRoom.Clear();
    if (mFades[fSChorus].justStarted) { mSChorusL.Clear(); mSChorusR.Clear(); }
    if (mFades[fDelay].justStarted) mEcho.Clear();
    if (mFades[fReverb].justStarted) mReverb.Clear();
    mDrive.Update(v[pDriveTone]);
    mReverb.SetSize(v[pReverbSize]);
    _UpdateEq();
  }

  // Pedals before the amp. Mono, in place.
  void ProcessPre(double* x, size_t n)
  {
    const double ratio = std::pow(2.0, std::round(-12.0 + 24.0 * mV[pPitchShift]) / 12.0);
    const int octMode = std::clamp((int)std::lround(mV[pTrashOctMode]), 0, 2);
    const double boost = DbToGain(12.0 * mV[pBoostGain]);
    const double masterIn = DbToGain(-24.0 + 36.0 * mV[pMasterIn]);
    for (size_t s = 0; s < n; s++)
    {
      double v = x[s] * mMasterIn.Next(masterIn);
      if (mFades[fPitch].Active())
      {
        const double mix = mPitchMix.Next(mV[pPitchMix]);
        const double w = mPitch.Process(v, ratio);
        v = _Blend(v, v * (1.0 - mix) + w * mix, fPitch);
      }
      if (mFades[fWah].Active())
        v = _Blend(v, mWah.Process(v, mV[pWahPedal], mV[pWahQ]), fWah);
      if (mFades[fTrash].Active())
        v = _Blend(v, mFuzz.Process(v, mV[pTrashDetune], mV[pTrashSquare], mV[pTrashOctave], octMode), fTrash);
      if (mFades[fComp].Active())
        v = _Blend(v, mComp.Process(v, mV[pCompSustain], mV[pCompAttack], mV[pCompLevel]), fComp);
      if (mFades[fDrive].Active())
        v = _Blend(v, mDrive.Process(v, mV[pDriveDrive], mV[pDriveLevel]), fDrive);
      if (mFades[fBoost].Active())
        v = _Blend(v, v * mBoostGain.Next(boost), fBoost);
      if (mFades[fPhaser].Active())
        v = _Blend(v, mPhaser.Process(v, mV[pPhaserRate], mV[pPhaserDepth]), fPhaser);
      if (mFades[fChorus].Active())
      {
        const double w = mChorus.Process(v, 0.1 + 4.9 * mV[pChorusRate], 12.0, 5.0 * mV[pChorusDepth], 0.0);
        v = _Blend(v, Lerp(v, w, mV[pChorusMix]), fChorus);
      }
      if (mFades[fFlanger].Active())
      {
        const double depth = 2.0 * mV[pFlangerDepth];
        const double w = mFlanger.Process(v, 0.05 + 1.95 * mV[pFlangerRate], 0.3 + depth, depth, 0.92 * mV[pFlangerFdbk]);
        v = _Blend(v, 0.5 * (v + w), fFlanger);
      }
      x[s] = v;
    }
  }

  // Cab mix and level: wet = the cab IR's output, dry = the amp before the cab.
  void ProcessCab(const double* dry, const double* wet, double* out, size_t n, bool irOn)
  {
    const double mix = irOn ? mV[pCabMix] : 1.0;
    const double lvl = DbToGain(-12.0 + 24.0 * mV[pCabLevel]);
    for (size_t s = 0; s < n; s++)
      out[s] = Lerp(dry[s], wet[s], mix) * mCabLevel.Next(lvl);
  }

  // After the cab: EQ and presence (mono), then the stereo effects into L and R.
  void ProcessPost(const double* x, double* L, double* R, size_t n)
  {
    const double dblSamples = (0.005 + 0.035 * mV[pDoublerDelay]) * mSR;
    const double echoSamples = NoteBeats(mV[pDelayTime]) * 60.0 / mTempo * mSR;
    // FX VOLUME: the level of the FX pedals (Stereo Chorus, Delay, Reverb) only
    const double fxVol = mV[pFxVolume] < 0.01 ? 0.0 : DbToGain(-36.0 + 42.0 * mV[pFxVolume]);
    const double masterOut = DbToGain(-24.0 + 36.0 * mV[pMasterOut]);
    static const double tapsL[4] = {0.0071, 0.0133, 0.0197, 0.0271}, tapsR[4] = {0.0093, 0.0151, 0.0233, 0.0317};
    static const double tapG[4] = {0.5, 0.35, 0.25, 0.15};
    for (size_t s = 0; s < n; s++)
    {
      double m = x[s];
      for (int b = 0; b < mNumEq; b++)
        m = mEq[mEqOrder[b]].Process(m);

      double l = m, r = m;
      if (mFades[fDoubler].Active())
      {
        mDoubler.Push(m);
        r = Lerp(m, mDoubler.Read(mDoublerTime.Next(dblSamples)), mFades[fDoubler].Next());
      }
      if (mFades[fRoom].Active())
      {
        mRoom.Push(m);
        double el = 0, er = 0;
        for (int t = 0; t < 4; t++)
        {
          el += mRoom.ReadInt((size_t)(tapsL[t] * mSR)) * tapG[t];
          er += mRoom.ReadInt((size_t)(tapsR[t] * mSR)) * tapG[t];
        }
        const double g = mV[pCabRoom] * mFades[fRoom].Next();
        l += el * g;
        r += er * g;
      }
      const double fv = mFxVolume.Next(fxVol);
      if (mFades[fSChorus].Active())
      {
        const double rate = 0.1 + 4.9 * mV[pSChorusRate], depth = 6.0 * mV[pSChorusDepth];
        const double wl = mSChorusL.Process(l, rate, 15.0, depth, 0.0);
        const double wr = mSChorusR.Process(r, rate, 15.0, depth, 0.0);
        const double g = std::min(1.0, mFades[fSChorus].Next() * mV[pSChorusMix] * fv);
        l = Lerp(l, wl, g);
        r = Lerp(r, wr, g);
      }
      if (mFades[fDelay].Active())
      {
        const double w = mEcho.Process(0.5 * (l + r), echoSamples, mV[pDelayFdbk]) * mV[pDelayMix] * mFades[fDelay].Next() * fv;
        l += w;
        r += w;
      }
      if (mFades[fReverb].Active())
      {
        double rl, rr;
        mReverb.Process(l, r, mV[pReverbDecay], rl, rr);
        const double g = mV[pReverbMix] * mFades[fReverb].Next() * fv;
        l += rl * g;
        r += rr * g;
      }
      const double gm = mMasterOut.Next(masterOut);
      L[s] = l * gm;
      R[s] = r * gm;
    }
  }

private:
  enum
  {
    fPitch = 0, fWah, fTrash, fComp, fDrive, fBoost, fPhaser, fChorus, fFlanger,
    fDoubler, fRoom, fSChorus, fDelay, fReverb, kNumFades
  };

  double _Blend(double dry, double wet, int fade) { return Lerp(dry, wet, mFades[fade].Next()); }

  void _UpdateEq()
  {
    const double vals[8] = {mV[pEqLowCut], mV[pEqLow], mV[pEqLowMid], mV[pEqHighMid], mV[pEqHigh], mV[pEqHighCut], mV[pPresence], mSR};
    bool changed = false;
    for (int i = 0; i < 8; i++)
      if (std::fabs(vals[i] - mLastEq[i]) > 1e-5)
        changed = true;
    if (!changed)
      return;
    const double gain = 24.0;
    // 0: low cut, 1-4: bands, 5: high cut, 6: presence. Bands at 0 dB are skipped.
    const bool lowCutOn = vals[0] > 0.005, highCutOn = vals[5] < 0.995;
    if (lowCutOn != mEqLowCutOn)
      mEq[0].Reset();
    if (highCutOn != mEqHighCutOn)
      mEq[5].Reset();
    mEqLowCutOn = lowCutOn;
    mEqHighCutOn = highCutOn;
    mEq[0].HighPass(mSR, 20.0 * std::pow(15.0, vals[0]), 0.707);
    static const double freqs[4] = {120.0, 400.0, 1600.0, 4000.0};
    for (int b = 0; b < 4; b++)
      mEq[1 + b].Peak(mSR, freqs[b], 1.1, (vals[1 + b] - 0.5) * gain);
    mEq[5].LowPass(mSR, 3000.0 * std::pow(20000.0 / 3000.0, vals[5]), 0.707);
    mEq[6].HighShelf(mSR, 3500.0, (vals[6] - 0.5) * 12.0);
    mNumEq = 0;
    if (lowCutOn)
      mEqOrder[mNumEq++] = 0;
    for (int b = 0; b < 4; b++)
      if (std::fabs(vals[1 + b] - 0.5) > 0.002)
        mEqOrder[mNumEq++] = 1 + b;
    if (std::fabs(vals[6] - 0.5) > 0.002)
      mEqOrder[mNumEq++] = 6;
    if (highCutOn)
      mEqOrder[mNumEq++] = 5;
    for (int i = 0; i < 8; i++)
      mLastEq[i] = vals[i];
  }

  double mSR = 48000.0, mTempo = 120.0;
  double mV[kNumDKParams] = {0};
  Fade mFades[kNumFades];
  PitchShifter mPitch;
  Wah mWah;
  OctaveFuzz mFuzz;
  Compressor mComp;
  Overdrive mDrive;
  Phaser mPhaser;
  ModDelay mChorus, mFlanger, mSChorusL, mSChorusR;
  Echo mEcho;
  Reverb mReverb;
  DelayLine mDoubler, mRoom;
  Smooth mDoublerTime, mBoostGain, mCabLevel, mFxVolume, mPitchMix, mMasterIn, mMasterOut;
  Biquad mEq[7];
  int mEqOrder[7] = {0};
  int mNumEq = 0;
  std::vector<double> mLastEq;
  bool mEqLowCutOn = false, mEqHighCutOn = false;
};
} // namespace dk
