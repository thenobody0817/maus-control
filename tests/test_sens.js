const assert = require("assert")
const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")

const A = require("../Actions.js")
const C = require("../Config.js")
const Sens = require("../Sens.js")
const Scroll = require("../Scroll.js")

// ---------------------------------------------------------------- the math

// Under the flat profile libinput is factor = speed + 1, so the conversion
// is exact in both directions. If this ever stops holding, every DPI number
// the panel shows is a lie, which is why it is asserted first.
for (const sensor of [400, 800, 1200, 1600, 3200]) {
  for (const target of [50, 100, 400, 800, 1600, sensor, sensor * 2]) {
    const sens = Sens.sensitivityFor(target, sensor)
    if (target > sensor * 2) {
      assert.strictEqual(sens, null, `${target} is out of reach from ${sensor}`)
      continue
    }
    assert.ok(sens !== null, `${target} should be reachable from ${sensor}`)
    assert.ok(sens >= -1 && sens <= 1, `sensitivity ${sens} out of libinput's range`)
    assert.ok(Math.abs(Sens.effectiveDpi(sens, sensor) - target) < 1e-9,
      `round trip lost ${target} at sensor ${sensor}`)
  }
}

// The sensor itself is always 1x, which is the one point the user can check
// by feel: the preset that matches their hardware DPI must not change how
// the mouse moves.
for (const sensor of [400, 800, 1600]) {
  assert.strictEqual(Sens.sensitivityFor(sensor, sensor), 0)
}

// Beyond 2x there is no sensitivity that works, and a pointer that does not
// move is not a preset.
assert.strictEqual(Sens.sensitivityFor(1601, 800), null)
assert.strictEqual(Sens.sensitivityFor(0, 800), null)
assert.strictEqual(Sens.sensitivityFor(-100, 800), null)
assert.strictEqual(Sens.sensitivityFor(800, 0), null)
assert.strictEqual(Sens.sensitivityFor(NaN, 800), null)
assert.strictEqual(Sens.ceilingFor(800), 1600)

// ---------------------------------------------------------------- literals

// The sensitivity is written into a file the compositor executes, so it
// must always be a plain decimal number and never an exponent, a NaN, or
// anything else JS might print.
for (const value of [-1, -0.9999999, -0.5, 0, 1e-9, -1e-9, 0.5, 1, 5, -5, NaN, Infinity]) {
  const text = Sens.luaSensitivity(value)
  assert.ok(/^-?\d+\.\d{6}$/.test(text), `bad lua literal ${text} for ${value}`)
  const parsed = parseFloat(text)
  assert.ok(parsed >= -1 && parsed <= 1, `literal ${text} outside libinput's range`)
}
// -0 prints as 0, so an unchanged preset does not churn the generated file.
assert.strictEqual(Sens.luaSensitivity(-0), "0.000000")
assert.strictEqual(Sens.luaSensitivity(-1e-12), "0.000000")

// ---------------------------------------------------------------- labels

// The one function the profile decides: DPI under flat, raw under adaptive.
assert.strictEqual(Sens.valueLabel(0, "flat", 800), "800 DPI")
assert.strictEqual(Sens.valueLabel(-0.5, "flat", 800), "400 DPI")
assert.strictEqual(Sens.valueLabel(-0.5, "adaptive", 800), "-0.50")
assert.strictEqual(Sens.presetLabel({ name: "Sniper", sensitivity: -0.5 }, "flat", 800),
  "Sniper · 400 DPI")
assert.strictEqual(Sens.presetLabel({ name: "Sniper", sensitivity: -0.5 }, "adaptive", 800),
  "Sniper · -0.50")

// ---------------------------------------------------------------- normalize

assert.deepStrictEqual(Sens.normalize(null), Sens.blank())
assert.deepStrictEqual(Sens.normalize("nonsense"), Sens.blank())
assert.strictEqual(Sens.blank().profile, "flat", "flat is the default")

// Presets are clamped into range rather than dropped: dropping one
// renumbers every preset after it, and the number is what a button is
// bound to.
{
  const wild = Sens.normalize({
    enabled: true, sensor: 800, profile: "adaptive", active: 99,
    presets: [{ name: "Way too fast", sensitivity: 5 }, { name: "  spaced  out ", sensitivity: -0.5 }]
  })
  assert.strictEqual(wild.presets.length, 2, "nothing was dropped")
  assert.strictEqual(wild.presets[0].sensitivity, 1, "clamped to libinput's ceiling")
  assert.strictEqual(wild.presets[1].name, "spaced out", "whitespace collapsed")
  assert.strictEqual(wild.active, 0, "an out-of-range active index falls back")
  assert.strictEqual(wild.profile, "adaptive")
}

// An unknown profile falls back rather than reaching the generated Lua.
assert.strictEqual(Sens.normalize({ profile: "bogus" }).profile, "flat")

// A name reaches an OSD line and a Lua string, so control characters go.
assert.strictEqual(Sens.normalizeName("a\nb\tc\x07"), "abc")
assert.strictEqual(Sens.normalizeName(""), "Preset")
assert.strictEqual(Sens.normalizeName("x".repeat(200)).length, Sens.MAX_NAME)

// Absurd sensors are bounded before anything divides by them.
assert.strictEqual(Sens.normalizeSensor(0), Sens.MIN_SENSOR)
assert.strictEqual(Sens.normalizeSensor(-5), Sens.MIN_SENSOR)
assert.strictEqual(Sens.normalizeSensor(1e9), Sens.MAX_SENSOR)
assert.strictEqual(Sens.normalizeSensor("nonsense"), Sens.DEFAULT_SENSOR)

// Presets never exceed the cap, whatever is on disk.
{
  const many = Sens.normalize({ presets: new Array(50).fill({ name: "x", sensitivity: 0 }) })
  assert.strictEqual(many.presets.length, Sens.MAX_PRESETS)
}

// Empty presets can never read back as enabled, because the runtime would
// then have a device slot with nothing to select.
assert.strictEqual(Sens.normalize({ enabled: true, presets: [] }).enabled, false)

// ---------------------------------------------------------------- legacy

// A config written before the rework has a `base` and DPI-valued presets.
// It must come back as a flat profile whose sensitivities mean exactly what
// the DPI numbers meant.
{
  assert.strictEqual(Sens.looksLegacy({ base: 800 }), true)
  assert.strictEqual(Sens.looksLegacy({ sensor: 800 }), false)
  assert.strictEqual(Sens.looksLegacy({ presets: [{ dpi: 400 }] }), true)

  const migrated = Sens.normalize({
    enabled: true, base: 1600, active: 1,
    presets: [{ name: "Sniper", dpi: 400 }, { name: "Full", dpi: 1600 }]
  })
  assert.strictEqual(migrated.sensor, 1600)
  assert.strictEqual(migrated.profile, "flat", "an old config is pinned to flat")
  assert.strictEqual(migrated.active, 1)
  assert.strictEqual(migrated.presets[0].sensitivity, -0.75)
  assert.strictEqual(migrated.presets[1].sensitivity, 0)
  assert.strictEqual(Sens.effectiveDpi(migrated.presets[0].sensitivity, 1600), 400)
}

// ---------------------------------------------------------------- editing

// Every seeded preset is a real sensitivity, and no two are the same.
{
  const seeds = Sens.seedPresets()
  assert.strictEqual(seeds.length, 3)
  const seen = {}
  for (const preset of seeds) {
    assert.ok(preset.sensitivity >= -1 && preset.sensitivity <= 1)
    assert.ok(!seen[preset.sensitivity], `seeded ${preset.sensitivity} twice`)
    seen[preset.sensitivity] = true
  }
}

// Changing the declared sensor never changes a preset's feel: only the
// label moves.
{
  const config = Sens.enable(Sens.normalize({ sensor: 1600 }))
  const moved = Sens.withSensor(config, 400)
  assert.strictEqual(moved.sensor, 400)
  for (let i = 0; i < config.presets.length; i++) {
    assert.strictEqual(moved.presets[i].sensitivity, config.presets[i].sensitivity)
  }
}

// setPreset takes a raw sensitivity, or a DPI from the flat editor.
{
  const config = Sens.enable(Sens.normalize({ sensor: 800 }))
  const byDpi = Sens.setPreset(config, 0, { dpi: 400 })
  assert.strictEqual(byDpi.presets[0].sensitivity, -0.5)
  const bySens = Sens.setPreset(config, 0, { sensitivity: -0.25 })
  assert.strictEqual(bySens.presets[0].sensitivity, -0.25)
}

// Removing a preset renumbers the rest, and the caller is told how so it
// can move the buttons bound to them.
{
  const three = Sens.enable(Sens.blank())
  assert.strictEqual(three.presets.length, 3)
  const { sens: two, remap } = Sens.removePreset(three, 1)
  assert.strictEqual(two.presets.length, 2)
  assert.strictEqual(remap[0], 0)
  assert.strictEqual(remap[1], -1, "the removed preset maps to nothing")
  assert.strictEqual(remap[2], 1, "everything after it shifts down")
  assert.ok(two.active >= 0 && two.active < two.presets.length)

  // Emptying it out turns the feature off rather than leaving an enabled
  // device with no presets.
  let left = two
  while (left.presets.length > 0) left = Sens.removePreset(left, 0).sens
  assert.strictEqual(left.enabled, false)
}

// Adding never lands on top of an existing preset, and stops at the cap.
{
  let config = Sens.enable(Sens.blank())
  while (config.presets.length < Sens.MAX_PRESETS) {
    const before = config.presets.length
    config = Sens.addPreset(config)
    assert.strictEqual(config.presets.length, before + 1)
    const seen = {}
    for (const preset of config.presets) {
      assert.ok(!seen[preset.sensitivity], `added a duplicate of ${preset.sensitivity}`)
      seen[preset.sensitivity] = true
    }
  }
  assert.strictEqual(Sens.addPreset(config).presets.length, Sens.MAX_PRESETS)
}

// ---------------------------------------------------------------- resolve

// A mouse Hyprland cannot name cannot have its sensitivity set for it
// alone, and setting it for every pointer would be worse than not setting
// it at all.
{
  const config = Sens.enable(Sens.blank())
  assert.strictEqual(Sens.resolve({ hyprName: "" }, config).ok, false)
  assert.ok(/does not report this device/.test(Sens.resolve({ hyprName: "" }, config).error))
  assert.strictEqual(Sens.resolve({ hyprName: "m" }, null).empty, true)
  assert.strictEqual(Sens.resolve({ hyprName: "m" }, Sens.blank()).empty, true)

  const resolved = Sens.resolve({ hyprName: "m", label: "Mouse" }, config)
  assert.strictEqual(resolved.ok, true)
  assert.strictEqual(resolved.profile, "flat")
  assert.strictEqual(resolved.sensor, Sens.DEFAULT_SENSOR)
  assert.strictEqual(resolved.presets.length, config.presets.length)
  for (let i = 0; i < resolved.presets.length; i++) {
    assert.strictEqual(resolved.presets[i].sensitivity, config.presets[i].sensitivity)
    assert.strictEqual(resolved.presets[i].label,
      Sens.presetLabel(config.presets[i], "flat", Sens.DEFAULT_SENSOR))
  }
}

// ---------------------------------------------------------------- lua

const HELPER = "/home/some body/.config/omarchy/plugins/x/scripts/maus-control"
const DEVICE = { key: "046d:4079:x", label: "G Pro", hyprName: "logitech-g-pro--1", hyprKbdName: "logitech-g-pro-" }

function build(bindings, sensConfig) {
  const config = C.normalize({
    scopeToDevice: true,
    devices: { "046d:4079:x": { bindings: bindings, sens: sensConfig } }
  }, Sens, Scroll)
  return C.generateLua([DEVICE], config, A, Sens, Scroll, HELPER)
}

function luaChecks(text) {
  const tmp = path.join(os.tmpdir(), "maus-control-sens-check.lua")
  fs.writeFileSync(tmp, text)
  try { execFileSync("luac", ["-p", tmp]) } finally { fs.unlinkSync(tmp) }
}

// ---------------------------------------------------------------- harness
//
// Reading the generated file and asserting that it contains the right
// substrings proves very little: what matters is what the compositor does
// when it runs it, and what happens when a button is actually pressed.
//
// So the file is executed by a real Lua interpreter against a stub `hl`,
// and the binds it registers are then invoked. Every hl.device and
// exec_cmd comes back as a trace line, which is the whole observable
// behaviour of the sensitivity runtime.
const HARNESS = `
local trace = {}
local binds = {}

os.execute = function() error("MAUS-ESCAPED: os.execute reached", 0) end
io.popen = function() error("MAUS-ESCAPED: io.popen reached", 0) end

hl = {
  device = function(spec)
    trace[#trace + 1] = table.concat({ "device", spec.name or "?",
      string.format("%.6f", spec.sensitivity or 0/0), spec.accel_profile or "?" }, "\\t")
  end,
  bind = function(key, fn, opts)
    opts = opts or {}
    binds[key .. (opts.release and "|up" or "|down")] = fn
  end,
  unbind = function() end,
  dispatch = function(value) trace[#trace + 1] = "dispatch\\t" .. tostring(value) end,
  timer = function() end,
  dsp = {
    exec_cmd = function(command) return "exec:" .. command end,
    window = setmetatable({}, { __index = function() return function() return "window" end end }),
    send_key_state = function() return "key" end,
  },
}

dofile(GENERATED)

for word in DRIVE:gmatch("%S+") do
  local fn = binds[word]
  if fn == nil then error("MAUS-NOBIND: " .. word, 0) end
  fn()
end

io.write(table.concat(trace, "\\n"))
`

// Run a generated file and drive the binds named in `drive`
// ("mouse:275|down mouse:275|up"). Returns the trace as rows.
function runLua(text, drive, home) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maus-control-lua-"))
  const generated = path.join(dir, "bindings.lua")
  const harness = path.join(dir, "harness.lua")
  fs.writeFileSync(generated, text)
  fs.writeFileSync(harness,
    `GENERATED = ${A.luaString(generated)}\nDRIVE = ${A.luaString(drive || "")}\n` + HARNESS)
  try {
    const out = execFileSync("lua", [harness], {
      encoding: "utf8",
      env: Object.assign({}, process.env, { HOME: home || dir })
    })
    return out === "" ? [] : out.split("\n").map(line => line.split("\t"))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// Every hl.device call, as { name, sensitivity, profile }.
function deviceCalls(rows) {
  return rows.filter(row => row[0] === "device")
             .map(row => ({ name: row[1], sensitivity: parseFloat(row[2]), profile: row[3] }))
}

// The whole sensitivity runtime, with every kind of bound button on it.
{
  const sensConfig = Sens.enable(Sens.normalize({ sensor: 1600 }))
  const generated = build({
    "275": { action: "sens-cycle" },
    "276": { action: "sens-cycle-back" },
    "277": { action: "sens-preset", preset: 0 },
    "278": { action: "sens-sniper", preset: 0 }
  }, sensConfig)

  assert.strictEqual(generated.skipped.length, 0, JSON.stringify(generated.skipped))
  assert.strictEqual(generated.binds, 4)
  assert.strictEqual(generated.sens.length, 1)
  luaChecks(generated.text)

  // Loading the file alone must put the pointer on the saved preset, under
  // the device's own profile.
  const onLoad = deviceCalls(runLua(generated.text, ""))
  assert.strictEqual(onLoad.length, 1)
  assert.strictEqual(onLoad[0].name, "logitech-g-pro--1")
  assert.strictEqual(onLoad[0].profile, "flat")
  const active = sensConfig.presets[sensConfig.active]
  assert.ok(Math.abs(onLoad[0].sensitivity - active.sensitivity) < 0.01,
    "loading the file did not select the active preset")

  // Cycling walks the presets in order and wraps, and every step lands on
  // exactly the sensitivity the panel promised.
  {
    const drive = new Array(sensConfig.presets.length + 1).fill("mouse:275|down").join(" ")
    const seen = deviceCalls(runLua(generated.text, drive)).slice(1)
    assert.strictEqual(seen.length, sensConfig.presets.length + 1)
    for (let i = 0; i < seen.length; i++) {
      const expected = sensConfig.presets[(sensConfig.active + 1 + i) % sensConfig.presets.length]
      assert.ok(Math.abs(seen[i].sensitivity - expected.sensitivity) < 0.01,
        `cycle step ${i} landed on ${seen[i].sensitivity}, wanted ${expected.sensitivity}`)
    }
  }

  // Cycling backwards from the first preset wraps to the last rather than
  // falling off the end — Lua's floored % is what makes that work.
  {
    const back = deviceCalls(runLua(generated.text, "mouse:276|down mouse:276|down")).slice(1)
    const count = sensConfig.presets.length
    for (let i = 0; i < back.length; i++) {
      const expected = sensConfig.presets[((sensConfig.active - 1 - i) % count + count) % count]
      assert.ok(Math.abs(back[i].sensitivity - expected.sensitivity) < 0.01,
        `reverse step ${i} wrapped wrong`)
    }
  }

  // Sniper: hold drops to its preset, release returns to the *selected*
  // one — not to whatever an earlier hold left behind.
  {
    const rows = runLua(generated.text, "mouse:278|down mouse:278|up")
    const seen = deviceCalls(rows).slice(1)
    assert.strictEqual(seen.length, 2, "hold and release are one device call each")
    assert.ok(Math.abs(seen[0].sensitivity - sensConfig.presets[0].sensitivity) < 0.01,
      "hold did not drop to its preset")
    assert.ok(Math.abs(seen[1].sensitivity - active.sensitivity) < 0.01,
      "release did not spring back to the selected preset")

    // A press with no matching release must not strand the pointer: the
    // next selection still wins.
    const stranded = deviceCalls(runLua(generated.text, "mouse:278|down mouse:277|down")).slice(1)
    assert.ok(Math.abs(stranded[1].sensitivity - sensConfig.presets[0].sensitivity) < 0.01,
      "selecting a preset while held did not take effect")
  }

  // Jumping to a preset also asks the helper to remember it and say so,
  // and that call carries nothing but two integers.
  {
    const rows = runLua(generated.text, "mouse:277|down")
    const execs = rows.filter(row => row[0] === "dispatch").map(row => row[1])
    assert.strictEqual(execs.length, 1, "one helper call per switch")
    assert.strictEqual(execs[0], "exec:'" + HELPER + "' sens note 1 1",
      "helper call: " + execs[0])
  }

  // A held button is not a switch, so it must not spam the helper or the
  // OSD on every press.
  assert.strictEqual(
    runLua(generated.text, "mouse:278|down mouse:278|up").filter(row => row[0] === "dispatch").length,
    0, "sniper must not write state or draw an OSD")
}

// An adaptive device is applied adaptive, and the switch still works.
{
  const sensConfig = Sens.enable(Sens.normalize({ sensor: 1600, profile: "adaptive" }))
  const generated = build({ "275": { action: "sens-cycle" } }, sensConfig)
  luaChecks(generated.text)
  const onLoad = deviceCalls(runLua(generated.text, ""))
  assert.strictEqual(onLoad[0].profile, "adaptive", "the profile reaches hl.device")
  const stepped = deviceCalls(runLua(generated.text, "mouse:275|down")).slice(1)
  assert.strictEqual(stepped[0].profile, "adaptive", "a switch keeps the profile")
}

// The preset chosen at runtime outlives a reload, which is the whole
// reason the state file exists.
{
  const sensConfig = Sens.enable(Sens.normalize({ sensor: 1600 }))
  const generated = build({}, sensConfig)
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maus-control-home-"))
  fs.mkdirSync(path.join(home, ".local/state/maus-control"), { recursive: true })
  const state = path.join(home, ".local/state/maus-control/sens-active")

  fs.writeFileSync(state, "1\t1\n")
  let seen = deviceCalls(runLua(generated.text, "", home))
  assert.ok(Math.abs(seen[0].sensitivity - sensConfig.presets[0].sensitivity) < 0.01,
    "the saved preset was not restored on load")

  // A state file naming a preset that has since been deleted falls back to
  // the configured one rather than leaving the pointer unset.
  fs.writeFileSync(state, "1\t99\n")
  seen = deviceCalls(runLua(generated.text, "", home))
  assert.ok(Math.abs(seen[0].sensitivity - sensConfig.presets[sensConfig.active].sensitivity) < 0.01,
    "a stale state file must fall back, not strand the pointer")

  // And so does junk.
  for (const junk of ["", "garbage\n", "1\tx\n", "\0\n", "-1\t-1\n"]) {
    fs.writeFileSync(state, junk)
    assert.strictEqual(deviceCalls(runLua(generated.text, "", home)).length, 1,
      `state file ${JSON.stringify(junk)} broke loading`)
  }
  fs.rmSync(home, { recursive: true, force: true })
}

// A sniper button aimed at a preset that has since been deleted must be
// refused with a reason, not compiled into a call that silently does
// nothing.
{
  const sensConfig = Sens.enable(Sens.blank())
  const generated = build({ "275": { action: "sens-preset", preset: 7 } }, sensConfig)
  assert.strictEqual(generated.binds, 0)
  assert.strictEqual(generated.skipped.length, 1)
  assert.ok(/no longer exists/.test(generated.skipped[0].reason), generated.skipped[0].reason)
}

// A sensitivity button on a mouse with presets switched off is refused too.
{
  const generated = build({ "275": { action: "sens-cycle" } }, Sens.blank())
  assert.strictEqual(generated.binds, 0)
  assert.strictEqual(generated.skipped.length, 1)
  assert.ok(/no presets switched on/.test(generated.skipped[0].reason), generated.skipped[0].reason)
  assert.ok(!generated.text.includes("mc_step"), "nothing emitted for a refused bind")
}

// Presets with no bound button still apply, because choosing one in the
// panel has to do something on its own.
{
  const generated = build({}, Sens.enable(Sens.blank()))
  assert.strictEqual(generated.binds, 0)
  assert.strictEqual(generated.sens.length, 1)
  assert.ok(generated.text.includes("mc_apply(1)"))
  luaChecks(generated.text)
}

// Two mice each get their own slot, and neither can reach the other's.
{
  const second = { key: "046d:c52b:y", label: "MX", hyprName: "mx-master" }
  const config = C.normalize({
    scopeToDevice: true,
    devices: {
      "046d:4079:x": { bindings: { "275": { action: "sens-cycle" } }, sens: Sens.enable(Sens.blank()) },
      "046d:c52b:y": { bindings: { "275": { action: "sens-cycle" } }, sens: Sens.enable(Sens.normalize({ sensor: 3200 })) }
    }
  }, Sens, Scroll)
  const generated = C.generateLua([DEVICE, second], config, A, Sens, Scroll, HELPER)
  assert.strictEqual(generated.sens.length, 2)
  assert.strictEqual(generated.binds, 2)
  assert.ok(generated.text.includes("mc_step(1, 1)") && generated.text.includes("mc_step(2, 1)"),
    "each mouse cycles its own presets")
  assert.ok(generated.text.includes('mc_names[2] = "mx-master"'))
  luaChecks(generated.text)

  // The sidecar the helper reads is in the same slot order as the Lua, and
  // each preset carries its own label.
  const sidecar = Sens.sidecar(generated.sens)
  assert.strictEqual(sidecar.devices.length, 2)
  assert.strictEqual(sidecar.devices[0].name, "logitech-g-pro--1")
  assert.strictEqual(sidecar.devices[1].name, "mx-master")
  assert.ok(sidecar.devices[0].presets[0].label.includes("DPI"))
}

// ---------------------------------------------------------------- legacy config

// A whole config written before the rework loads, migrates, and keeps its
// bound buttons working.
{
  const config = C.normalize({
    scopeToDevice: true,
    devices: { "046d:4079:x": {
      bindings: { "275": { action: "dpi-cycle" }, "277": { action: "dpi-preset", preset: 0 } },
      dpi: { enabled: true, base: 1600, active: 1,
             presets: [{ name: "Sniper", dpi: 400 }, { name: "Full", dpi: 1600 }] }
    } }
  }, Sens, Scroll)

  const entry = config.devices["046d:4079:x"]
  assert.strictEqual(entry.dpi, undefined, "the old key is not carried forward")
  assert.strictEqual(entry.sens.sensor, 1600)
  assert.strictEqual(entry.sens.profile, "flat")
  assert.strictEqual(entry.sens.presets[0].sensitivity, -0.75)
  assert.strictEqual(entry.bindings["275"].action, "sens-cycle", "legacy action id remapped")
  assert.strictEqual(entry.bindings["277"].action, "sens-preset")

  const generated = C.generateLua([DEVICE], config, A, Sens, Scroll, HELPER)
  assert.strictEqual(generated.skipped.length, 0, JSON.stringify(generated.skipped))
  assert.ok(generated.text.includes('mc_profile[1] = "flat"'))
  luaChecks(generated.text)
}

// ---------------------------------------------------------------- hostile

// A preset name is user text that reaches a Lua file, a JSON sidecar, and
// an OSD line. It must survive all three as data.
{
  const hostile = 'x"; os.execute("touch /tmp/pwn"); --'
  const sensConfig = Sens.normalize({
    enabled: true, sensor: 800, profile: "flat",
    presets: [{ name: hostile, sensitivity: 0 }]
  })
  const generated = build({ "275": { action: "sens-preset", preset: 0 } }, sensConfig)
  luaChecks(generated.text)
  // The harness deletes os.execute, so a name that broke out of its string
  // literal raises rather than running.
  runLua(generated.text, "mouse:275|down")

  // It rides in the sidecar as JSON instead, where the helper reads it.
  const sidecar = Sens.sidecar(generated.sens)
  assert.strictEqual(sidecar.devices[0].presets[0].name, Sens.normalizeName(hostile))
  JSON.parse(JSON.stringify(sidecar))
}

// A device name comes from a USB descriptor, so it is equally untrusted.
{
  const evil = { key: "046d:4079:x", label: "X", hyprName: 'a"); os.execute("id"); ("' }
  const config = C.normalize({
    devices: { "046d:4079:x": { sens: Sens.enable(Sens.blank()) } }
  }, Sens, Scroll)
  const generated = C.generateLua([evil], config, A, Sens, Scroll, HELPER)
  luaChecks(generated.text)
  const seen = deviceCalls(runLua(generated.text, ""))
  assert.strictEqual(seen[0].name, evil.hyprName,
    "the device name must arrive as data, byte for byte")
}

// The helper path is interpolated into a shell command by the generated
// Lua, so a path with a space in it has to survive as one argument.
{
  const generated = build({ "275": { action: "sens-cycle" } }, Sens.enable(Sens.blank()))
  const quoted = execFileSync("lua", ["-e", `
    local mc_helper = ${A.luaString(HELPER)}
    local function mc_quote(value)
      return "'" .. tostring(value):gsub("'", "'\\\\''") .. "'"
    end
    io.write(mc_quote(mc_helper))
  `], { encoding: "utf8" })
  const back = execFileSync("sh", ["-c", `printf '%s\\n' ${quoted}`], { encoding: "utf8" })
  assert.strictEqual(back, HELPER + "\n", "helper path did not survive shell quoting")
  assert.ok(generated.text.includes("mc_quote(mc_helper)"))
}

console.log("sens: all assertions passed")
