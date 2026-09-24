// Panel layout math: how the window arranges itself at any size.
//
// Everything here is a pure function of the window size and the theme's
// spacing scale, so it can be tested in node the way the rest of the
// plugin's arithmetic is. The QML side only measures text and draws.
//
// The scale multiplies every threshold: a theme with a larger base font
// makes the controls and gaps larger, so the widths at which the layout
// rearranges have to move with it or the panel would decide it has room
// it does not.

function num(value, fallback) {
  var n = Number(value)
  return isFinite(n) ? n : fallback
}

function positive(value) {
  var n = num(value, 1)
  return n > 0 ? n : 1
}

function clamp(value, low, high) {
  return value < low ? low : (value > high ? high : value)
}

// ------------------------------------------------------------ thresholds
//
// Design pixels, before the spacing scale is applied.

// The side pane on its own, and the diagram's own comfortable minimum.
var SIDE_MIN = 300
var SIDE_MAX = 400
var SIDE_FRACTION = 0.34

// Below this width for the diagram, docking would leave the mouse too small
// to read, so the pane floats over it instead.
var DOCKED_MIN_DIAGRAM = 520

// Chrome folds to one compact line below this height.
var COMPACT_CHROME_HEIGHT = 560

// The device readouts and labelled buttons are the first things to give way.
var DEVICE_DETAIL_MIN = 880
var ACTION_LABELS_MIN = 800

// Chip gutters: measured text plus padding, bounded so a very short label
// does not make a sliver and a very long one does not eat the diagram.
var CHIP_PADDING = 10
var CHIP_MIN = 120
var CHIP_MAX = 260

var DIAGRAM_INSET = 8
var GUTTER_GAP = 30
var MIN_SHELL_HEIGHT = 120
var MIN_SHELL_WIDTH = 50

// ------------------------------------------------------------ panel

// How the window should arrange itself at this size.
//
//   mode        "docked" | "overlay"
//   chrome      "full" | "compact"
//   sideWidth   the pane's width, docked or floating
//   deviceDetail  show the battery / sensitivity / scroll readouts
//   actionStyle  "labels" | "icons"
function layout(width, height, scale) {
  var s = positive(scale)
  var sideMin = SIDE_MIN * s
  var gap = 16 * s
  var docked = width >= sideMin + DOCKED_MIN_DIAGRAM * s + gap

  // Never let the pane crowd a small window: it is capped at the window
  // width minus a little, so the diagram it floats over stays partly visible.
  var sideWidth = Math.round(clamp(width * SIDE_FRACTION, sideMin,
    Math.min(SIDE_MAX * s, Math.max(sideMin, width - gap))))

  return {
    mode: docked ? "docked" : "overlay",
    chrome: height < COMPACT_CHROME_HEIGHT * s ? "compact" : "full",
    sideWidth: sideWidth,
    deviceDetail: width >= DEVICE_DETAIL_MIN * s,
    actionStyle: width >= ACTION_LABELS_MIN * s ? "labels" : "icons"
  }
}

function sidePaneWidth(width, scale) {
  return layout(width, 100000, scale).sideWidth
}

// ------------------------------------------------------------ chip gutter

// The gutter has to be at least as wide as the widest chip. The renderer
// measures the text and hands the number in; this bounds it.
function chipWidth(measured, scale) {
  var s = positive(scale)
  return Math.round(clamp(num(measured, 0) + 2 * CHIP_PADDING * s, CHIP_MIN * s, CHIP_MAX * s))
}

// ------------------------------------------------------------ diagram

// Where the mouse and its two gutters sit in a pane of this size.
//
// The shell grows to use the available height (floored so the chips still
// fit, capped by the caller when a giant mouse would be silly), and the
// gutters are whatever the chips measured. When even that will not fit the
// width, the shell is scaled down rather than the labels being clipped.
//
//   opts { gutterWidth, gutterGap, inset, boxW, boxH,
//          minShellHeight, minShellWidth, maxShellHeight }
//
// Returns { gutterWidth, shell {x,y,w,h}, left {x,width}, right {x,width} }.
function diagramMetrics(width, height, opts) {
  opts = opts || {}
  var gutterWidth = Math.max(0, num(opts.gutterWidth, CHIP_MIN))
  var gutterGap = Math.max(0, num(opts.gutterGap, GUTTER_GAP))
  var inset = Math.max(0, num(opts.inset, DIAGRAM_INSET))
  var boxW = Math.max(1, num(opts.boxW, 100))
  var boxH = Math.max(1, num(opts.boxH, 160))
  var minShellHeight = Math.max(0, num(opts.minShellHeight, MIN_SHELL_HEIGHT))
  var minShellWidth = Math.max(0, num(opts.minShellWidth, MIN_SHELL_WIDTH))
  var maxShellHeight = Math.max(0, num(opts.maxShellHeight, height))

  var availableH = Math.max(0, height - 2 * inset)

  // If the measured gutters alone would not leave room for even the smallest
  // shell, take it out of the gutters rather than overflowing the pane.
  var maxGutterForWidth = Math.max(0, (width - minShellWidth) / 2 - gutterGap)
  if (gutterWidth > maxGutterForWidth) gutterWidth = maxGutterForWidth

  var sides = 2 * (gutterWidth + gutterGap)

  var shellH = Math.min(Math.max(minShellHeight, availableH), maxShellHeight)
  var shellW = shellH * (boxW / boxH)
  if (sides + shellW > width) {
    shellW = Math.max(minShellWidth, width - sides)
    shellH = shellW * (boxH / boxW)
    if (shellH > availableH) {
      shellH = Math.max(minShellHeight, availableH)
      shellW = shellH * (boxW / boxH)
    }
  }

  var total = sides + shellW
  var originX = Math.max(0, (width - total) / 2)
  var shellX = originX + gutterWidth + gutterGap

  return {
    gutterWidth: gutterWidth,
    shell: { x: shellX, y: Math.max(0, (height - shellH) / 2), w: shellW, h: shellH },
    left: { x: originX, width: gutterWidth },
    right: { x: shellX + shellW + gutterGap, width: gutterWidth }
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    SIDE_MIN: SIDE_MIN,
    SIDE_MAX: SIDE_MAX,
    DOCKED_MIN_DIAGRAM: DOCKED_MIN_DIAGRAM,
    COMPACT_CHROME_HEIGHT: COMPACT_CHROME_HEIGHT,
    DEVICE_DETAIL_MIN: DEVICE_DETAIL_MIN,
    ACTION_LABELS_MIN: ACTION_LABELS_MIN,
    CHIP_MIN: CHIP_MIN,
    CHIP_MAX: CHIP_MAX,
    clamp: clamp,
    layout: layout,
    sidePaneWidth: sidePaneWidth,
    chipWidth: chipWidth,
    diagramMetrics: diagramMetrics
  }
}
