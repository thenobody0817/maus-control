const assert = require("assert")
const L = require("../Layout.js")

// ---------------------------------------------------------------- breakpoints

// A wide window docks the pane; a narrow one floats it. The crossover has to
// be reachable both ways as the window grows and shrinks.
{
  const wide = L.layout(1400, 800, 1)
  assert.strictEqual(wide.mode, "docked")
  assert.strictEqual(wide.chrome, "full")
  assert.strictEqual(wide.deviceDetail, true)
  assert.strictEqual(wide.actionStyle, "labels")

  const small = L.layout(720, 520, 1)
  assert.strictEqual(small.mode, "overlay")
  assert.strictEqual(small.chrome, "compact")
  assert.strictEqual(small.deviceDetail, false)
  assert.strictEqual(small.actionStyle, "icons")
}

// Growing the window never takes a feature away and shrinking never adds one:
// the mode only moves one way, with no flicker band in between.
{
  let sawDocked = false
  for (let w = 600; w <= 1600; w += 5) {
    const mode = L.layout(w, 800, 1).mode
    if (mode === "docked") sawDocked = true
    else assert.ok(!sawDocked, `mode went back to overlay at ${w}`)
  }
  assert.ok(sawDocked, "never reached docked mode")
}

// The scale is the theme's, so a bigger font needs a bigger window to dock.
{
  const atOne = L.layout(900, 800, 1)
  const at14 = L.layout(900, 800, 14 / 12)
  assert.strictEqual(atOne.mode, "docked")
  assert.strictEqual(at14.mode, "overlay", "the same width docks at scale 1 but not at 14px")
}

// ---------------------------------------------------------------- side width

// The pane stays within its bounds and never exceeds the window.
{
  for (const [w, s] of [[720, 1], [900, 1], [1200, 1], [1600, 1], [900, 14 / 12], [1600, 14 / 12]]) {
    const width = L.sidePaneWidth(w, s)
    const min = L.SIDE_MIN * s
    const max = L.SIDE_MAX * s
    assert.ok(width >= Math.min(min, w * 0.34) - 1, `side ${width} below its floor at ${w}@${s}`)
    assert.ok(width <= max + 1, `side ${width} above ${max} at ${w}@${s}`)
    assert.ok(width <= w, `side ${width} wider than the window ${w}`)
  }
}

// ---------------------------------------------------------------- chips

// A measured label is padded, and clamped at both ends.
assert.strictEqual(L.chipWidth(150, 1), 170)
assert.strictEqual(L.chipWidth(5, 1), L.CHIP_MIN, "a tiny label still gets a readable chip")
assert.strictEqual(L.chipWidth(9999, 1), L.CHIP_MAX, "a huge label cannot eat the diagram")
assert.ok(L.chipWidth(150, 2) > L.chipWidth(150, 1), "the scale widens the chip")

// ---------------------------------------------------------------- diagram

const SHELL = { gutterWidth: 200, gutterGap: 30, boxW: 100, boxH: 160 }

// The shell and gutters are laid out left to right without overlapping the
// gutter, and the whole thing is centred.
{
  const m = L.diagramMetrics(1000, 700, SHELL)
  assert.ok(m.shell.w > 0 && m.shell.h > 0)
  assert.ok(m.left.x + m.left.width <= m.shell.x + 0.001, "left gutter overlaps the shell")
  assert.ok(m.shell.x + m.shell.w <= m.right.x + 0.001, "shell overlaps the right gutter")
  const totalCentre = (m.left.x + (m.right.x + m.right.width)) / 2
  assert.ok(Math.abs(totalCentre - 500) < 1, "composition is not centred")
  // The shell keeps its aspect ratio.
  assert.ok(Math.abs(m.shell.w / m.shell.h - SHELL.boxW / SHELL.boxH) < 1e-9)
}

// A taller pane gives a taller mouse, which is the point of filling the space.
{
  const short = L.diagramMetrics(1000, 400, SHELL)
  const tall = L.diagramMetrics(1000, 900, SHELL)
  assert.ok(tall.shell.h > short.shell.h, "the shell did not grow with the window")
}

// When width is the binding constraint the shell scales down rather than the
// gutters being clipped.
{
  const cramped = L.diagramMetrics(420, 700, SHELL)
  assert.ok(cramped.shell.w >= 1, "shell collapsed")
  assert.ok(cramped.left.width + cramped.right.width + cramped.shell.w <= 420 + 0.001,
    "the composition overflowed a narrow pane")
}

// A caller can cap how large the mouse grows.
{
  const capped = L.diagramMetrics(2000, 2000, Object.assign({ maxShellHeight: 480 }, SHELL))
  assert.ok(capped.shell.h <= 480 + 1e-9)
}

// Never negative, at any size, including degenerate ones.
{
  for (const [w, h] of [[0, 0], [1, 1], [50, 50], [320, 200], [720, 520], [4000, 3000]]) {
    const m = L.diagramMetrics(w, h, SHELL)
    for (const key of ["x", "y", "w", "h"]) {
      assert.ok(isFinite(m.shell[key]) && m.shell[key] >= 0, `shell.${key}=${m.shell[key]} at ${w}x${h}`)
    }
    assert.ok(m.left.width >= 0 && m.right.width >= 0)
  }
}

console.log("layout: all assertions passed")
