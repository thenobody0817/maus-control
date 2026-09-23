// Pointer sensitivity: the raw libinput value, the acceleration profile it
// is read under, and the mouse's own DPI as a reference for the readout.
//
// Nothing here writes to the mouse. Like the rest of Maus Control, every
// setting is a compositor setting scoped to one device, so the mouse
// behaves exactly as it did out of the box on any other machine.
//
// ------------------------------------------------------------ the two knobs
//
// Hyprland gives a device exactly two pointer settings that matter here:
//
//   accel_profile   "adaptive" (Hyprland's default) or "flat"
//   sensitivity     libinput's acceleration speed, clamped to [-1, 1]
//
// Under the *flat* profile libinput turns that speed into a constant factor:
//
//     factor = sensitivity + 1                (libinput filter-flat.c)
//
// an exact linear multiplier from 0x to 2x, with 1x at 0. Under the
// *adaptive* profile the curve is velocity-dependent and no single
// multiplier exists — the same number only shifts the curve. So a preset is
// just a stored sensitivity, and an effective DPI is only shown while the
// profile is flat, because otherwise it would be a number that means
// nothing.
//
// ------------------------------------------------------------ what DPI is
//
// DPI belongs to the mouse's own sensor, set in its firmware. The compositor
// can neither read nor change it, so `sensor` here is a number the user
// declares and the only thing it is used for is turning a sensitivity into
// the DPI the pointer behaves like under a flat profile:
//
//     effective = sensor * (1 + sensitivity)
//
// Because a preset stores a sensitivity and not a DPI, changing the declared
// sensor only relabels presets; it never changes how they feel. That is the
// honest arrangement — the sensor number is a reference, the sensitivity is
// the setting — and it is also what makes a preset work under either
// profile.

// libinput's flat profile tops out at 2x, so sensitivity tops out at 1.
var MAX_FACTOR = 2
var MAX_SENSITIVITY = MAX_FACTOR - 1
var MIN_SENSITIVITY = -1

// The two profiles Hyprland exposes per device. "custom" exists globally
// but its point table is not part of the Lua device API, so it is not
// offered here.
var PROFILES = ["adaptive", "flat"]

// Flat is the default: it is the one the presets and the DPI readout are
// exact under, and it matches what this feature did before the profile was
// selectable. A device migrated from the old DPI config is pinned to flat.
var DEFAULT_PROFILE = "flat"

// Hardware DPI the presets are measured against when nothing says
// otherwise. 800 is the most common factory default; the panel says plainly
// that it is a guess and where to check.
var DEFAULT_SENSOR = 800

// A sensor below this is not a real setting, and above it is beyond
// anything shipping. Bounds, not opinions — they only exist to keep a typo
// out of the generated Lua.
var MIN_SENSOR = 100
var MAX_SENSOR = 32000

// The declared sensor and the flat DPI readout move in round numbers; a
// slider that lands on 1447 reads as broken.
var SENSOR_STEP = 50

// The raw sensitivity slider's notch under the adaptive profile.
var SENS_STEP = 0.01

var MAX_PRESETS = 8
var MAX_NAME = 24

// Sensitivity is written into Lua as a literal, so it is fixed to a known
// number of decimals rather than left to whatever the runtime prints. That
// stable text is what lets the setup check compare on-disk with generated
// and skip a pointless rewrite, and it is what keeps a DPI-typed preset
// from drifting when it round-trips.
var SENS_DECIMALS = 6

function clamp(value, low, high) {
  return value < low ? low : (value > high ? high : value)
}

function isNumber(value) {
  return typeof value === "number" && isFinite(value)
}

// ------------------------------------------------------------ conversion

// The sensitivity that makes `sensor` feel like `target` DPI under the flat
// profile, or null when none can: libinput cannot exceed 2x, and a pointer
// that does not move is not a preset.
function sensitivityFor(target, sensor) {
  if (!isNumber(target) || !isNumber(sensor)) return null
  if (sensor <= 0 || target <= 0) return null
  var sens = target / sensor - 1
  if (sens < MIN_SENSITIVITY || sens > MAX_SENSITIVITY) return null
  return sens
}

function effectiveDpi(sensitivity, sensor) {
  if (!isNumber(sensitivity) || !isNumber(sensor)) return 0
  return sensor * (1 + sensitivity)
}

// The highest DPI a sensor can reach under the flat profile.
function ceilingFor(sensor) {
  return Math.round(normalizeSensor(sensor) * MAX_FACTOR)
}

function reachable(target, sensor) {
  return sensitivityFor(target, sensor) !== null
}

function normalizeProfile(value) {
  return PROFILES.indexOf(String(value)) === -1 ? DEFAULT_PROFILE : String(value)
}

// A Lua number literal. Rounded first so the same preset always generates
// the same bytes.
function luaSensitivity(sensitivity) {
  var value = clamp(isNumber(sensitivity) ? sensitivity : 0, MIN_SENSITIVITY, MAX_SENSITIVITY)
  var text = value.toFixed(SENS_DECIMALS)
  // toFixed(-0.0000001) is "-0.000000", a valid Lua number but an ugly one
  // to find in a generated file.
  return text === "-0." + new Array(SENS_DECIMALS + 1).join("0")
    ? "0." + new Array(SENS_DECIMALS + 1).join("0")
    : text
}

// A human label for one sensitivity: the DPI it acts like under flat, the
// raw number under adaptive. This is the single place the profile decides
// what the number on screen means.
function valueLabel(sensitivity, profile, sensor) {
  if (normalizeProfile(profile) === "flat") {
    return Math.round(effectiveDpi(sensitivity, sensor)) + " DPI"
  }
  return normalizeSensitivity(sensitivity).toFixed(2)
}

function presetLabel(preset, profile, sensor) {
  if (!preset) return ""
  return preset.name + " · " + valueLabel(preset.sensitivity, profile, sensor)
}

// ------------------------------------------------------------ config shape

function blank() {
  return { enabled: false, sensor: DEFAULT_SENSOR, profile: DEFAULT_PROFILE, active: 0, presets: [] }
}

function normalizeSensor(sensor) {
  var value = Math.round(Number(sensor))
  if (!isFinite(value)) return DEFAULT_SENSOR
  return clamp(value, MIN_SENSOR, MAX_SENSOR)
}

function normalizeSensitivity(sensitivity) {
  var value = Number(sensitivity)
  if (!isFinite(value)) return 0
  // Pin to the same decimals the Lua literal uses, so a value that reaches
  // the generated file is identical to the one the panel stored.
  return clamp(Number(clamp(value, MIN_SENSITIVITY, MAX_SENSITIVITY).toFixed(SENS_DECIMALS)),
    MIN_SENSITIVITY, MAX_SENSITIVITY)
}

// Strip a name down to something that can sit on a preset chip and in an
// OSD line. Control characters are dropped rather than escaped: a name is
// a label, and a label with a newline in it is a mistake, not a style.
function normalizeName(value, fallback) {
  var text = String(value === undefined || value === null ? "" : value)
  var out = ""
  for (var i = 0; i < text.length && out.length < MAX_NAME; i++) {
    var code = text.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) continue
    out += text.charAt(i)
  }
  out = out.replace(/\s+/g, " ").replace(/^ | $/g, "")
  return out === "" ? String(fallback || "Preset") : out
}

// A checkout that predates the profile field stored `base` and DPI-valued
// presets. Convert it to the current shape, pinning it to flat so the
// numbers mean exactly what they meant before.
function fromLegacy(legacy) {
  if (!legacy || typeof legacy !== "object") return null
  var sensor = normalizeSensor(legacy.base)
  var presets = []
  var list = Array.isArray(legacy.presets) ? legacy.presets : []
  for (var i = 0; i < list.length && presets.length < MAX_PRESETS; i++) {
    var entry = list[i] || {}
    var sens = sensitivityFor(entry.dpi, sensor)
    if (sens === null) continue
    presets.push({
      name: normalizeName(entry.name, Math.round(entry.dpi) + " DPI"),
      sensitivity: normalizeSensitivity(sens)
    })
  }
  return { enabled: legacy.enabled === true, sensor: sensor, profile: "flat",
           active: parseInt(legacy.active, 10) || 0, presets: presets }
}

function looksLegacy(raw) {
  if (!raw || typeof raw !== "object") return false
  if (raw.sensor !== undefined) return false
  if (raw.base !== undefined) return true
  return Array.isArray(raw.presets) && raw.presets.length > 0 && raw.presets[0].dpi !== undefined
}

// Accept whatever is on disk and hand back something every caller can
// index into without checking. Presets that cannot be reached from the
// stored sensor are clamped rather than dropped, because dropping one
// silently renumbers every preset after it — and the index is what a
// button is bound to.
function normalize(raw) {
  var source = looksLegacy(raw) ? fromLegacy(raw) : raw
  var out = blank()
  if (!source || typeof source !== "object") return out

  out.sensor = normalizeSensor(source.sensor)
  out.profile = normalizeProfile(source.profile)

  var list = Array.isArray(source.presets) ? source.presets : []
  for (var i = 0; i < list.length && out.presets.length < MAX_PRESETS; i++) {
    var entry = list[i] || {}
    var sens = normalizeSensitivity(entry.sensitivity)
    out.presets.push({
      name: normalizeName(entry.name, valueLabel(sens, out.profile, out.sensor)),
      sensitivity: sens
    })
  }

  out.enabled = source.enabled === true && out.presets.length > 0

  var active = parseInt(source.active, 10)
  out.active = isFinite(active) && active >= 0 && active < out.presets.length ? active : 0
  return out
}

// Presets for a mouse that has none yet: a slow one for aiming, a middle
// one, and the sensor's own speed. Ratios, not fixed numbers, so the seeds
// are always reachable and always feel the same whatever the sensor is
// declared to be.
function seedPresets() {
  var made = [
    { name: "Sniper", sensitivity: -0.75 },
    { name: "Precise", sensitivity: -0.5 },
    { name: "Full", sensitivity: 0 }
  ]
  var out = []
  for (var i = 0; i < made.length; i++) {
    var duplicate = false
    for (var j = 0; j < out.length; j++) {
      if (normalizeSensitivity(out[j].sensitivity) === normalizeSensitivity(made[i].sensitivity)) duplicate = true
    }
    if (!duplicate) out.push({ name: made[i].name, sensitivity: normalizeSensitivity(made[i].sensitivity) })
  }
  return out
}

function enable(sens) {
  var next = normalize(sens)
  if (next.presets.length === 0) next.presets = seedPresets()
  next.active = next.presets.length - 1
  next.enabled = true
  return next
}

// The declared sensor is a reference only: it changes the DPI labels, never
// a preset's feel. Presets are therefore left exactly as they are.
function withSensor(sens, sensor) {
  var next = normalize(sens)
  next.sensor = normalizeSensor(sensor)
  return next
}

function setProfile(sens, profile) {
  var next = normalize(sens)
  next.profile = normalizeProfile(profile)
  return next
}

// `patch` accepts a stored `sensitivity`, or a `dpi` from the flat editor
// which is converted against the device's declared sensor.
function setPreset(sens, index, patch) {
  var next = normalize(sens)
  if (index < 0 || index >= next.presets.length) return next
  var current = next.presets[index]
  var entry = { name: current.name, sensitivity: current.sensitivity }
  if (patch && patch.name !== undefined) entry.name = normalizeName(patch.name, current.name)
  if (patch && patch.dpi !== undefined) {
    var converted = sensitivityFor(patch.dpi, next.sensor)
    if (converted !== null) entry.sensitivity = normalizeSensitivity(converted)
  } else if (patch && patch.sensitivity !== undefined) {
    entry.sensitivity = normalizeSensitivity(patch.sensitivity)
  }
  next.presets[index] = entry
  return next
}

// A new preset lands a quarter faster than the highest one, which is where
// someone adding one usually wants it, and never on top of an existing
// preset. Once the top is full it walks down instead of up.
function addPreset(sens) {
  var next = normalize(sens)
  if (next.presets.length >= MAX_PRESETS) return next

  var taken = {}
  var highest = MIN_SENSITIVITY
  for (var i = 0; i < next.presets.length; i++) {
    taken[next.presets[i].sensitivity] = true
    highest = Math.max(highest, next.presets[i].sensitivity)
  }

  var candidate = normalizeSensitivity(Math.min(MAX_SENSITIVITY, highest + 0.25))
  if (taken[candidate]) {
    candidate = MIN_SENSITIVITY
    for (var value = MAX_SENSITIVITY; value >= MIN_SENSITIVITY; value -= 0.05) {
      var stepped = normalizeSensitivity(value)
      if (!taken[stepped]) { candidate = stepped; break }
    }
    if (candidate === MIN_SENSITIVITY && taken[MIN_SENSITIVITY]) return next
  }

  next.presets.push({ name: valueLabel(candidate, next.profile, next.sensor), sensitivity: candidate })
  next.active = next.presets.length - 1
  return next
}

// Removing a preset renumbers the ones after it, and a button bound to
// "preset 3" now points somewhere else. Callers get the index map back so
// they can move those bindings with it.
function removePreset(sens, index) {
  var next = normalize(sens)
  if (index < 0 || index >= next.presets.length) return { sens: next, remap: null }
  var remap = {}
  var kept = []
  for (var i = 0; i < next.presets.length; i++) {
    if (i === index) { remap[i] = -1; continue }
    remap[i] = kept.length
    kept.push(next.presets[i])
  }
  next.presets = kept
  next.enabled = next.enabled && kept.length > 0
  next.active = clamp(next.active > index ? next.active - 1 : next.active, 0, Math.max(0, kept.length - 1))
  return { sens: next, remap: remap }
}

function activePreset(sens) {
  var current = normalize(sens)
  if (current.presets.length === 0) return null
  return current.presets[clamp(current.active, 0, current.presets.length - 1)]
}

// ------------------------------------------------------------ resolution

// Everything the generator and the runtime helper need for one device, or
// a reason there is nothing to generate. Both consumers read this rather
// than redoing the arithmetic, so the sensitivity a preset compiles to, the
// label it shows, and the profile it is applied under cannot drift apart.
function resolve(device, sens) {
  var config = normalize(sens)
  if (!config.enabled || config.presets.length === 0) return { ok: false, empty: true }
  if (!device || !device.hyprName) {
    return {
      ok: false, empty: false,
      error: "Hyprland does not report this device by name, so its sensitivity cannot be set for it alone."
    }
  }

  var presets = []
  for (var i = 0; i < config.presets.length; i++) {
    var preset = config.presets[i]
    presets.push({
      name: preset.name,
      sensitivity: preset.sensitivity,
      label: presetLabel(preset, config.profile, config.sensor)
    })
  }
  if (presets.length === 0) return { ok: false, empty: true }

  return {
    ok: true, empty: false,
    name: device.hyprName,
    label: device.label || device.key || "Mouse",
    sensor: config.sensor,
    profile: config.profile,
    active: clamp(config.active, 0, presets.length - 1),
    presets: presets
  }
}

// Which preset each device is on, in the format the generated Lua reads
// back on load and the helper rewrites on every runtime switch.
//
// Apply writes this as well as the Lua, so choosing a preset in the panel
// wins over whatever a button last left behind. Without it the panel would
// appear to do nothing: the generated file would set the preset the panel
// asked for and this file would immediately override it.
function activeFile(slots) {
  var lines = []
  // `slots` is the generator's slot list: every entry is a device that got
  // a slot, and its position *is* the slot number. Filtering here instead
  // of trusting that would renumber everything after a dropped entry, and
  // the generated Lua would then be reading another mouse's preset.
  for (var i = 0; i < slots.length; i++) {
    lines.push((i + 1) + "\t" + (slots[i].active + 1))
  }
  return lines.length === 0 ? "" : lines.join("\n") + "\n"
}

// The JSON the helper script reads to answer "what is preset 2 on device 1,
// and what does it say in the OSD". Written beside the generated Lua on
// every Apply. Each preset carries its own ready-made label, so the helper
// never has to know what profile the device is on.
//
// Takes the generator's slot list, whose order is the slot numbering.
function sidecar(slots) {
  var devices = []
  // Same contract as activeFile: position is the slot number, so nothing
  // may be skipped here either.
  for (var i = 0; i < slots.length; i++) {
    var entry = slots[i]
    devices.push({
      name: entry.name,
      label: entry.label,
      sensor: entry.sensor,
      profile: entry.profile,
      active: entry.active,
      presets: entry.presets
    })
  }
  return { version: 1, devices: devices }
}

if (typeof module !== "undefined") {
  module.exports = {
    MAX_FACTOR: MAX_FACTOR,
    MAX_SENSITIVITY: MAX_SENSITIVITY,
    MIN_SENSITIVITY: MIN_SENSITIVITY,
    PROFILES: PROFILES,
    DEFAULT_PROFILE: DEFAULT_PROFILE,
    DEFAULT_SENSOR: DEFAULT_SENSOR,
    MIN_SENSOR: MIN_SENSOR,
    MAX_SENSOR: MAX_SENSOR,
    SENSOR_STEP: SENSOR_STEP,
    SENS_STEP: SENS_STEP,
    MAX_PRESETS: MAX_PRESETS,
    MAX_NAME: MAX_NAME,
    blank: blank,
    normalize: normalize,
    normalizeSensor: normalizeSensor,
    normalizeSensitivity: normalizeSensitivity,
    normalizeProfile: normalizeProfile,
    normalizeName: normalizeName,
    fromLegacy: fromLegacy,
    looksLegacy: looksLegacy,
    sensitivityFor: sensitivityFor,
    effectiveDpi: effectiveDpi,
    ceilingFor: ceilingFor,
    reachable: reachable,
    luaSensitivity: luaSensitivity,
    valueLabel: valueLabel,
    presetLabel: presetLabel,
    seedPresets: seedPresets,
    enable: enable,
    withSensor: withSensor,
    setProfile: setProfile,
    setPreset: setPreset,
    addPreset: addPreset,
    removePreset: removePreset,
    activePreset: activePreset,
    resolve: resolve,
    sidecar: sidecar,
    activeFile: activeFile
  }
}
