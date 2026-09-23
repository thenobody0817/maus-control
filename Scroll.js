// Wheel speed, as libinput's per-device scroll factor.
//
// Nothing here writes to the mouse. Like the rest of Maus Control, this is
// a compositor setting scoped to one device, so the mouse behaves exactly
// as it did out of the box on any other machine.
//
// ------------------------------------------------------------ the setting
//
// Hyprland takes `scroll_factor` per device and hands it to libinput, which
// multiplies every wheel and touchpad scroll delta by it. 1.0 is the
// untouched default, above 1.0 scrolls further per notch, below it scrolls
// less. It is a plain multiplier, not an acceleration curve, so the value
// maps directly onto what the user feels — which is why there is exactly
// one number here and no DPI-style arithmetic.
//
// A keyboard with a scroll wheel or a trackpoint also responds to this, so
// the setting is offered for whatever device the panel is showing rather
// than only for mice.

// libinput accepts any positive multiplier. The bounds only keep a typo (or
// a slider) out of the generated Lua; they are not a claim about hardware.
var MIN_FACTOR = 0.1
var MAX_FACTOR = 4.0

// 1.0 is untouched. The panel's off switch keeps the number but stops
// emitting it, so turning the feature back on restores the last value.
var DEFAULT_FACTOR = 1.0

// Sliders land on round steps; without this a stored 1.5000001 reads as a
// bug and rewrites the generated file for no reason.
var STEP = 0.05

// The factor is written into Lua as a literal, so it is fixed to a known
// number of decimals rather than left to whatever the runtime prints. That
// stable text is what lets the setup check compare on-disk with generated
// and skip a pointless rewrite.
var DECIMALS = 2

function clamp(value, low, high) {
  return value < low ? low : (value > high ? high : value)
}

function isNumber(value) {
  return typeof value === "number" && isFinite(value)
}

// A Lua number literal. Rounded first so the same factor always generates
// the same bytes.
function luaFactor(factor) {
  var value = clamp(isNumber(factor) ? factor : DEFAULT_FACTOR, MIN_FACTOR, MAX_FACTOR)
  var text = value.toFixed(DECIMALS)
  // toFixed(-0.001) is "-0.00", a valid Lua number but an ugly one to find
  // in a generated file.
  return text === "-0." + new Array(DECIMALS + 1).join("0")
    ? "0." + new Array(DECIMALS + 1).join("0")
    : text
}

// ------------------------------------------------------------ config shape

function blank() {
  return { enabled: false, factor: DEFAULT_FACTOR }
}

function normalizeFactor(value) {
  var number = Number(value)
  if (!isFinite(number)) return DEFAULT_FACTOR
  var stepped = Math.round(number / STEP) * STEP
  // Rounding to STEP can still leave a binary fraction (0.30000000000000004),
  // so pin it to the same decimals the literal uses.
  return clamp(Number(stepped.toFixed(DECIMALS)), MIN_FACTOR, MAX_FACTOR)
}

// Accept whatever is on disk and hand back something the UI can rely on.
function normalize(raw) {
  var out = blank()
  if (!raw || typeof raw !== "object") return out
  out.factor = normalizeFactor(raw.factor)
  out.enabled = raw.enabled === true
  return out
}

function enable(scroll) {
  var next = normalize(scroll)
  next.enabled = true
  return next
}

function withFactor(scroll, factor) {
  var next = normalize(scroll)
  next.factor = normalizeFactor(factor)
  return next
}

// A short label for the readout and a chip.
function factorLabel(factor) {
  return normalizeFactor(factor).toFixed(DECIMALS) + "×"
}

// ------------------------------------------------------------ resolution

// Everything the generator and the helper need for one device, or a reason
// there is nothing to emit. Both consumers read this rather than redoing the
// normalization, so the factor a slider shows and the factor the helper
// applies cannot drift apart.
function resolve(device, scroll) {
  var config = normalize(scroll)
  if (!config.enabled) return { ok: false, empty: true }
  if (!device || !device.hyprName) {
    return {
      ok: false, empty: false,
      error: "Hyprland does not report this device by name, so its wheel speed cannot be set for it alone."
    }
  }
  return {
    ok: true, empty: false,
    name: device.hyprName,
    label: device.label || device.key || "Mouse",
    factor: config.factor
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    MIN_FACTOR: MIN_FACTOR,
    MAX_FACTOR: MAX_FACTOR,
    DEFAULT_FACTOR: DEFAULT_FACTOR,
    STEP: STEP,
    DECIMALS: DECIMALS,
    blank: blank,
    normalize: normalize,
    normalizeFactor: normalizeFactor,
    enable: enable,
    withFactor: withFactor,
    factorLabel: factorLabel,
    luaFactor: luaFactor,
    resolve: resolve
  }
}
