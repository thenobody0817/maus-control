const assert = require("assert")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")

const A = require("../Actions.js")
const C = require("../Config.js")
const Dpi = require("../Dpi.js")
const Scroll = require("../Scroll.js")

// ---------------------------------------------------------------- shape

// Anything on disk comes back as something every caller can index without
// checking, and only an explicit `true` turns it on.
{
  const off = Scroll.normalize(null)
  assert.deepStrictEqual(off, { enabled: false, factor: Scroll.DEFAULT_FACTOR })
  assert.strictEqual(Scroll.normalize({ factor: 1.5 }).enabled, false,
    "a factor alone does not switch the feature on")
  assert.strictEqual(Scroll.normalize({ enabled: "yes", factor: 1.5 }).enabled, false,
    "only boolean true enables it")
  assert.strictEqual(Scroll.normalize({ enabled: true, factor: 1.5 }).enabled, true)
}

// ---------------------------------------------------------------- numbers

// The slider is stepped and the Lua literal is fixed at two decimals, so a
// factor always normalizes to the same number: that stable text is what
// lets the setup check skip a pointless rewrite.
assert.strictEqual(Scroll.normalizeFactor(1.5), 1.5)
assert.strictEqual(Scroll.normalizeFactor(1.23), 1.25)
assert.strictEqual(Scroll.normalizeFactor(1.22), 1.2)
assert.strictEqual(Scroll.normalizeFactor(0.30000000000000004), 0.3)
assert.strictEqual(Scroll.normalizeFactor(-5), Scroll.MIN_FACTOR, "clamped low")
assert.strictEqual(Scroll.normalizeFactor(99), Scroll.MAX_FACTOR, "clamped high")
assert.strictEqual(Scroll.normalizeFactor("nonsense"), Scroll.DEFAULT_FACTOR)
assert.strictEqual(Scroll.normalizeFactor(NaN), Scroll.DEFAULT_FACTOR)

assert.strictEqual(Scroll.luaFactor(1.5), "1.50")
assert.strictEqual(Scroll.luaFactor(1), "1.00")
assert.strictEqual(Scroll.luaFactor(0.25), "0.25")
assert.strictEqual(Scroll.luaFactor(-0.0000001), "0.10", "no negative zero, clamped up")
assert.strictEqual(Scroll.factorLabel(2), "2.00×")

// Every value the slider can produce compiles to a Lua number, so the
// generated file can never be handed something the parser rejects. Lua
// prints numbers in its own shortest form (0.10 comes back "0.1"), so the
// value is compared numerically, not as text.
for (let f = Scroll.MIN_FACTOR; f <= Scroll.MAX_FACTOR + 1e-9; f += Scroll.STEP) {
  const literal = Scroll.luaFactor(f)
  const out = execFileSync("lua", ["-e", "io.write(" + literal + ")"], { encoding: "utf8" })
  assert.ok(Math.abs(Number(out) - Number(literal)) < 1e-9,
    `lua did not read back ${literal} (got ${out})`)
}

// ---------------------------------------------------------------- toggle

{
  const on = Scroll.enable(Scroll.blank())
  assert.strictEqual(on.enabled, true)
  assert.strictEqual(on.factor, Scroll.DEFAULT_FACTOR)
  const faster = Scroll.withFactor(on, 1.5)
  assert.strictEqual(faster.factor, 1.5)
  assert.strictEqual(Scroll.enable(faster).factor, 1.5, "enabling keeps the last factor")
}

// ---------------------------------------------------------------- resolve

const DEVICE = { key: "k", label: "Mouse", hyprName: "mouse-1" }

assert.strictEqual(Scroll.resolve(DEVICE, Scroll.blank()).empty, true,
  "a disabled setting resolves to nothing to emit")

const resolved = Scroll.resolve(DEVICE, { enabled: true, factor: 1.5 })
assert.strictEqual(resolved.ok, true)
assert.strictEqual(resolved.name, "mouse-1")
assert.strictEqual(resolved.factor, 1.5)

const unnamed = Scroll.resolve({ key: "k", label: "Mouse", hyprName: "" },
  { enabled: true, factor: 1.5 })
assert.strictEqual(unnamed.ok, false)
assert.ok(/does not report this device by name/.test(unnamed.error))

// ---------------------------------------------------------------- slots

{
  const config = C.normalize({
    devices: { k: { scroll: { enabled: true, factor: 1.5 } } }
  }, Dpi, Scroll)
  const slots = C.scrollSlots([DEVICE], config, Scroll)
  assert.strictEqual(slots.slots.length, 1)
  assert.strictEqual(slots.byKey.k, 1)
  assert.strictEqual(slots.skipped.length, 0)

  const unnamedSlots = C.scrollSlots([{ key: "k", label: "M", hyprName: "" }], config, Scroll)
  assert.strictEqual(unnamedSlots.slots.length, 0)
  assert.strictEqual(unnamedSlots.skipped.length, 1)
  assert.ok(/does not report this device by name/.test(unnamedSlots.skipped[0].reason))
}

// ---------------------------------------------------------------- generation

const HELPER = "/home/somebody/.config/omarchy/plugins/x/scripts/maus-control"

function generate(scroll, extra) {
  const config = C.normalize({
    devices: Object.assign({ k: { scroll } }, extra || {})
  }, Dpi, Scroll)
  return C.generateLua([DEVICE], config, A, Dpi, Scroll, HELPER)
}

{
  const on = generate({ enabled: true, factor: 1.5 })
  assert.ok(on.text.includes('hl.device({ name = "mouse-1", scroll_factor = 1.50 })'),
    "the factor is emitted per device")
  assert.ok(on.text.includes("scroll 1.50x"), "the comment names the setting")
  assert.strictEqual(on.scroll.length, 1)
  assert.strictEqual(on.skipped.length, 0)

  // A device with nothing switched on emits nothing at all.
  const off = generate({ enabled: false, factor: 1.5 })
  assert.ok(!off.text.includes("scroll_factor"), "disabled emits no call")
  assert.ok(off.text.includes("-- Nothing mapped."), "and the file says so")
  assert.strictEqual(off.scroll.length, 0)

  // Generating the same config twice is byte-identical, which is what the
  // setup check relies on.
  assert.strictEqual(generate({ enabled: true, factor: 1.5 }).text,
    generate({ enabled: true, factor: 1.5 }).text)
}

// Wheel speed is applied after the pointer-speed runtime, so a DPI switch
// cannot be mistaken for it.
{
  const config = C.normalize({
    devices: { k: {
      dpi: { enabled: true, base: 1600, active: 0, presets: [{ name: "Full", dpi: 1600 }] },
      scroll: { enabled: true, factor: 2 }
    } }
  }, Dpi, Scroll)
  const generated = C.generateLua([DEVICE], config, A, Dpi, Scroll, HELPER)
  assert.ok(generated.text.indexOf("scroll_factor") > generated.text.indexOf("mc_apply("),
    "scroll follows the DPI runtime")
}

// ---------------------------------------------------------------- real lua

// The whole file is executed by the compositor, so hand it to the parser
// with a hostile device name in it: the name reaches both a comment and a
// string literal, and neither may become code.
{
  const payload = "maus_control_scroll_marker()"
  const hostile = 'Mouse\n' + payload + '\n-- '
  const config = C.normalize({
    devices: { k: { scroll: { enabled: true, factor: 1.5 } } }
  }, Dpi, Scroll)
  const generated = C.generateLua(
    [{ key: "k", label: hostile, hyprName: hostile, hyprKbdName: "kbd" }],
    config, A, Dpi, Scroll, HELPER)

  const tmp = path.join(os.tmpdir(), "maus-control-scroll-check.lua")
  fs.writeFileSync(tmp, generated.text)
  execFileSync("luac", ["-p", tmp])
  fs.rmSync(tmp, { force: true })

  const masked = generated.text.replace(/"(?:[^"\\]|\\.)*"/g, '""')
  const code = masked.split("\n").map(l => l.replace(/--.*$/, "")).join("\n")
  assert.ok(!code.includes(payload), "the comment was escaped into a statement")
}

console.log("scroll: all assertions passed")
