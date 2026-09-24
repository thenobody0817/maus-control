# Maus Control

An Omarchy shell plugin that shows every button on your mouse on a diagram,
with a leader line from each button to a label saying what it does — and lets
you rebind any of them to a shortcut, a window action, or a command. It also
tunes the pointer per mouse — acceleration profile, declared sensor DPI, and
named sensitivity presets you can switch between from a button on the mouse
itself — and sets a per-mouse wheel-speed multiplier.

The diagram is generated from whatever mouse is actually plugged in. A
two-button travel mouse and a seven-button gaming mouse each draw as
themselves, and the leaders land on the right places on the shell.

![the panel](preview.png)

## Nothing is written to the mouse

This is the important difference from Piper / libratbag, which is the usual
answer to remapping a mouse on Linux. Piper flashes the mouse's **onboard
memory**, so your remaps follow the device to every machine you plug it into.

Maus Control never touches the hardware. Everything it does is a Hyprland setting
on *this* machine, scoped to *this* device name — a keybinding, a pointer
speed, or a wheel speed. Plug the mouse into another computer and it behaves
exactly as it did out of the box.

## Install

```bash
omarchy plugin add https://github.com/thenobody0817/maus-control --enable
```

That clones the repository into `~/.config/omarchy/plugins/` and enables it.
Open the map from its bar icon, or:

```bash
omarchy-shell shell toggle local.maus.control
```

The first time you open the panel it sets itself up, because the panel cannot
draw itself without it: the window rule that floats this window lives in the
file it generates. Setup writes that generated file under
`~/.local/state/maus-control/`, takes a one-time backup of
`~/.config/hypr/bindings.lua` at `bindings.lua.maus-control.bak`, and adds one
`dofile` line to it inside `-- BEGIN maus-control` markers.

That line is the only change ever made to a file you wrote, and nothing of
yours is rewritten — everything outside the markers is preserved byte for
byte. Your own mappings are a separate step: a button does nothing until you
choose an action and press **Apply**.

To update later:

```bash
omarchy plugin update local.maus.control
```

### Requirements

Omarchy 4 (Hyprland 0.56+ with the Lua config), which is where `hl.bind`,
`hl.device`, the `device` bind option and `send_key_state` come from.

No packages beyond what Omarchy already installs. The helper script uses
`bash`, `python3` and `hyprctl`; the panel is Quickshell QML. Two of the
built-in actions shell out to things Omarchy ships — `playerctl` for the media
actions and `wpctl` for the volume ones — and *Toggle dictation* runs
`voxtype`, which is optional. An action whose command is missing simply does
nothing; nothing else is affected.

### Developing on it

```bash
./install
```

`install` copies this checkout into
`~/.config/omarchy/plugins/local.maus.control`. It copies rather
than symlinks on purpose: Quickshell watches the plugin tree for changes and
does not follow a symlinked directory, so a symlinked install silently stops
hot-reloading. (The marketplace refuses symlinks inside a plugin folder for a
better reason: a symlink in a trusted plugin directory can point anywhere.)

Re-run `./install` after editing. QML components are cached once loaded, so
changes to an already-open panel need `omarchy restart shell`.

### This fork

This is a personal fork of
[Steezy-code/omarchy-mousemap](https://github.com/Steezy-code/omarchy-mousemap),
renamed to Maus Control. The upstream project is the origin of everything
here except the wheel-speed feature and the rename; the licence and the
original authorship are unchanged.

The fork is developed on `main` and tracks upstream with a second remote. To
fold in an upstream change:

```bash
git fetch upstream
git rebase upstream/main
```

`omarchy plugin update` is fast-forward only, so it will refuse while local
commits sit on `main` — that refusal is what keeps this fork from being
overwritten by the upstream release. Pull upstream deliberately with the
rebase above instead.

## Using it

Click any button on the diagram, or its label, and pick what it should do.
Nothing is live until you press **Apply**.

- **Sens** — next / previous sensitivity preset, jump to one, hold for one
- **Navigate** — Back, Forward, tab switching, reload
- **Edit** — copy, paste, cut, undo, redo, find
- **Window** — close, fullscreen, float/tile, pin
- **Workspace** — next, previous, last, scratchpad
- **Omarchy** — menu, launcher, screenshot, clipboard history, emoji picker,
  dictation
- **Media** — volume, play/pause, track skip
- **Custom** — record any key combo, or run any command

Left and right click are shown but flagged: binding them takes the click
away everywhere, including in the panel that did it.

## Sens

Press **Sens** in the footer. This is where the pointer is tuned for this
mouse, and it holds three things — only two of which are settings Hyprland
actually has.

**Acceleration** — `Adaptive` or `Flat`. Adaptive is Hyprland's default curve:
faster on a quick movement, gentler when you aim. Flat is a constant
multiplier, and it is the only profile in which sensitivity maps cleanly onto
DPI.

**Presets** — named sensitivities. The defaults are a slow one for aiming, a
middle one, and the sensor's own speed. Switch between them by clicking, or by
binding a button to **Next preset**. A switch draws an on-screen overlay saying
which one you landed on, and the choice survives a Hyprland reload. Under the
flat profile each preset is shown as the DPI it acts like; under adaptive it is
shown as the raw value, because no single DPI describes a curve.

**Hold to slow down** is the sniper button: press and hold to drop to one
preset, let go and spring back to the one you had. Both edges are bound, so
there is nothing to toggle back.

### What "sensitivity" and "DPI" mean here

Hyprland hands a device's `sensitivity` to libinput as the pointer
acceleration speed, clamped to `-1.00…+1.00`. Under the **flat** profile
libinput turns that into a constant factor:

```
factor = 1 + sensitivity        (libinput, filter-flat.c)
```

an exact linear multiplier from 0× to 2×, with 1× at 0. So the effective DPI
is:

```
effective = sensor × (1 + sensitivity)
```

`sensor` is the DPI the mouse's own firmware is set to. Maus Control can
neither read nor change it, so you declare it in the panel; a preset stores
the *sensitivity*, not the DPI. That is why changing the sensor only relabels
presets and never changes how they feel, and it is what lets a preset work
under either profile. Set the sensor with your mouse's own configurator —
`solaar`, `piper`/`ratbagd`, or a vendor tool such as G HUB.

Under the **adaptive** profile the curve is velocity-dependent and no single
multiplier exists, so the panel stops showing DPI and shows the raw value
instead. Presets still work; they just shift the curve.

Switching a preset is one `hl.device` call inside the generated Lua, with the
sensitivity table and the profile precomputed — no process to spawn on the
press. The helper is only asked afterwards to remember the choice and draw the
overlay.

A note for anyone upgrading from a version that only had DPI presets: the old
values are converted on first open (`sensitivity = dpi / base − 1`), pinned to
the flat profile, and the old `dpi` block is replaced by `sens` the next time
you press **Apply**.

## Scroll speed

Press **Scroll** in the footer to put a multiplier on the wheel. `1.00×` is the
wheel exactly as Hyprland had it, above `1.00×` scrolls further per notch, and
below it scrolls less. It is a plain multiplier rather than an acceleration
curve, so the number is the whole setting.

Dragging the slider previews the change live, so you can feel where the wheel
should sit; **Apply** writes it. Like the sensitivity presets it is a Hyprland
setting scoped to this one device, and nothing is written to the mouse. There
is no overlay and no button to bind: the wheel is the thing you are adjusting.

In the generated Lua it is a single `hl.device` call carrying `scroll_factor`,
applied once at load and emitted after the sensitivity runtime. A preset switch
touches only `accel_profile` and `sensitivity`, and Hyprland merges partial
per-device configs, so the two settings never disturb each other.

### Moving a button

Drag a label to say where its button really is. The shell shows every spot
it could go, and dropping on one — or onto another label — exchanges the
two, so nothing is ever left stacked on top of anything else. The same
spots are listed in the sidebar under **Where is this button?** for anyone
who would rather click than drag.

This matters because detection asks *which button is which*, and a
mis-press during that pass puts a button in the wrong place on the diagram.
**Test placement** arms the same probes but records nothing: press a
button, watch where it lights up, and drag its label if it is wrong.

### Detect buttons

Behind a wireless receiver the kernel often cannot tell you which buttons the
mouse has. A receiver is a HID multiplexer: it advertises the union of
everything it *could* ever carry — all sixteen `BTN_MOUSE` codes plus a full
keyboard — regardless of what is actually paired to it. Logitech's Unifying
and Lightspeed dongles are the common case, but anything that multiplexes
behaves this way. That is why a capability list alone is not trustworthy.

**Detect buttons** resolves it by watching: it temporarily binds every
candidate button code, you press each button on your mouse, and whatever
fires is recorded as the real button list. Left and right click are left
alone so you can still click. Press **Apply** to keep the result.

If a button never shows up during a detect pass, it is probably not sending a
mouse button at all — see below.

### Battery

Wireless mice that speak HID++ report their charge through the kernel, and
Maus Control shows it in the header and draws it on the mouse's palm. The reading
is matched to the mouse by sysfs path rather than by name, so it stays correct
when two of the same model are paired to one receiver. Wired mice simply have
no battery section.

## Buttons that type instead of clicking

Plenty of mouse buttons never send a mouse button at all. An onboard profile
that assigns a button a keystroke or a shift-layer macro makes it arrive as a
**keyboard key**, from the receiver's keyboard interface rather than its
pointer one — vendor configurators all do this, Logitech's G HUB and Razer's
Synapse among them. A gaming mouse can easily have one thumb button sending
`2` and the other sending `Left Ctrl`.

Maus Control handles these. The same physical mouse appears in Hyprland a second
time as a keyboard, with its own device name, so the key can be bound scoped
to *that* device — the mouse and nothing else. Your real keyboard keeps
working normally, and the button stops typing because the compositor now
consumes it.

This is why per-device scoping is not optional for such a button: binding a
bare `2` or `Ctrl` globally would swallow that key everywhere and break
typing. Generation refuses to emit one unscoped, and says so in the panel
rather than doing it anyway.

Detection covers them too — the guided pass watches the mouse's keyboard
device alongside its buttons, which is only safe because every one of those
probe binds is scoped to the mouse.

If you would rather have real mouse buttons, reassign them in the mouse's
onboard profile with its vendor configurator, or `piper`/`ratbagd`. Be aware
that this writes to the mouse, so unlike everything else here it *does*
follow the device to other machines.

If a button still never shows up — in **Detect buttons** or **Test
placement** — the compositor is not receiving anything from it, and the only
place left to look is the raw kernel event stream. Maus Control deliberately ships
nothing for that. Reading `/dev/input/event*` needs root, and root should only
ever run code that cannot be swapped out while the password prompt is open,
which rules out anything in a plugin folder the desktop user can write to. Use
a packaged, root-owned tool instead, such as `evtest` from the Arch
repositories.

Nothing in Maus Control runs with elevated privileges, at any point.

## How it works

```
~/.config/omarchy/maus-control.json          your mapping (source of truth)
        │
        ▼  generated on Apply
~/.local/state/maus-control/
   bindings.lua    the binds and the sensitivity runtime
   sens.json       preset labels and profiles, for the overlay
   sens-active     which preset each mouse is on
        │
        ▼  one loader line, added once
~/.config/hypr/bindings.lua
```

The plugin generates whole files it owns, rather than editing a fenced block
inside your hand-written `bindings.lua`. The only change to your own config is
a single `dofile` line inside `-- BEGIN maus-control` markers, and a one-time
backup is taken at `bindings.lua.maus-control.bak` before that line is ever added.

`dofile` rather than `require`: Hyprland's bootstrap only clears
`package.loaded` for the `default.hypr`, `hypr` and theme prefixes, so a
required module under any other name would be cached and a reload would
silently keep serving the previous mapping.

Bindings and pointer settings are both scoped to the device with Hyprland's
`device` option, so two different mice can carry two different maps.

Everything that touches the filesystem or the compositor goes through
`scripts/maus-control`, so there is one place to read to know what this plugin can
do. Nothing generated ever interpolates a name into a shell command: a preset
bind passes the helper two integers, and the helper looks up what they mean.

### Typing a shortcut

A binding like "Back" works by pressing `Alt+Left` at whatever is focused,
via `send_key_state` down/up rather than `send_shortcut` — Hyprland can leave
the synthetic key latched with the latter, so the modifier sticks down and the
next real keystroke arrives mangled. Omarchy's own clipboard bindings use the
same workaround ([discussion #14099](https://github.com/hyprwm/Hyprland/discussions/14099)).

A virtual keyboard such as `wtype` is also wrong here: it types at the seat,
so a modifier you are physically holding merges into the injected chord.

The limit of this mechanism is that a chord only ever reaches the focused
**application**. Hyprland matches its own keybindings against real input
from the seat, so an injected key never reaches the bind matcher and a
shortcut the compositor owns cannot be triggered by typing it —
`send_shortcut` included. Anything Hyprland binds (a Super shortcut, nearly
always) has to be **Run command…** with whatever that binding runs, which
is why *Toggle dictation* execs `voxtype record toggle` rather than sending
Super+Ctrl+X. The panel says so when you record a chord carrying Super.

## Layout

The panel rearranges itself with the window instead of assuming one size. A
top bar carries the device and the mode switch; the side pane docks beside the
diagram when there is room (≥ roughly 980px at your font size) and floats over
it as an opaque drawer when there is not, so the mouse keeps the full width
where it matters most. The diagram measures its own labels and sizes the
gutters from them, then fills whatever height is left, so a large window shows
a large mouse rather than a capped one with dead space around it. The
breakpoints live in `Layout.js`, scaled by the theme's spacing so a larger
font moves them with it, and are unit-tested in `test_layout.js`. The window
floor is ~720×520 (in theme units).

The chip placement itself is isotonic regression (pool-adjacent-violators).
Each chip wants to sit at its button's height; chips must not overlap; and
leaders must not cross. The third falls out of the second as long as chips
keep their anchors' vertical order, which makes the whole thing one-dimensional
and exactly solvable.

The obvious greedy alternative — push each label down until it fits — drifts
badly once a cluster forms near the top, shoving every label below it down
even when there was slack above. PAVA spreads a crowded cluster around its own
centre of mass and leaves everything else where it wanted to be.

The shell silhouette is sampled from one width function, which the button
anchors also call, so a side-button marker can never drift off the drawn edge.

## Files

| | |
|---|---|
| `Devices.js` | discovery: evdev capabilities, receiver detection, battery join |
| `Profiles.js` | shell geometry and the known-device table |
| `Leaders.js` | label placement and leader routing |
| `Layout.js` | responsive breakpoints and diagram geometry |
| `Actions.js` | what a button can do, and the Lua it compiles to |
| `Sens.js` | sensitivity presets, profiles, and the DPI arithmetic behind them |
| `Scroll.js` | wheel speed, as a per-device multiplier |
| `Config.js` | config shape, Lua generation, the loader hook |
| `MouseCanvas.qml` | the diagram |
| `MausControlPanel.qml` | the panel: state, geometry, processes |
| `PanelTopBar.qml` | device summary and the mode switch |
| `PanelBottomBar.qml` | status and the action buttons |
| `SidePane.qml` | the docked/overlay pane host |
| `DetectPanel.qml` | the guided detection wizard |
| `ActionPicker.qml` | the rebinding sidebar |
| `SensPanel.qml` | the sensitivity sidebar |
| `ScrollPanel.qml` | the wheel-speed sidebar |
| `scripts/maus-control` | the only path to the filesystem and the compositor |

## Tests

```bash
tests/run
```

No framework and no dependencies — each file is `node` plus the real `lua`
and `luac` binaries, because the interesting failures are not in JavaScript.

`test_sens.js` executes the generated Lua in a real interpreter against a stub
compositor and then presses the binds, so cycling, wrapping, sniper release,
the applied profile and the state file are checked by behaviour rather than by
grepping the output. It also checks the migration of an old DPI config. That
sandbox has `os.execute` and `io.popen` deleted, which turns a preset name or a
device name that escaped its string literal into a loud failure rather than
something a substring check might miss.

`test_config.js` round-trips hostile strings through the real `lua`
interpreter and syntax-checks generated output with `luac -p`, because the
generated file is executed by the compositor. It also holds the two copies
of the trigger rules — `Config` generates the bind string, `Devices` states
it for the UI — to each other across the whole id space, because two copies
of one rule is how keystroke buttons were silently dropped once already.

`test_layout.js` checks the responsive breakpoints and the diagram geometry:
that the mode only moves one way as the window grows, that the side pane stays
within its bounds, and that the shell and gutters never overflow or go
negative at any size.

`test_scroll.js` checks the multiplier's clamp, step and literal formatting,
that every slider position compiles to a Lua number, and that the emitted
`hl.device` call is byte-stable and follows the sensitivity runtime. It also
runs the generated file through `luac` with a hostile device name, the same way
`test_config.js` does.

`test_leaders.js` sweeps every button count from 2 to 16 and shuffles each
one through every place, asserting that no two buttons ever end up in the
same spot.

`test_manifest.js` checks the manifest against the schema the shell enforces,
and holds every other file that repeats the plugin id to it.

## Uninstall

```bash
omarchy plugin remove local.maus.control
```

Then delete the `-- BEGIN maus-control` … `-- END maus-control` block from
`~/.config/hypr/bindings.lua` and run `hyprctl reload`. Your original file is
at `~/.config/hypr/bindings.lua.maus-control.bak`.

Your mapping and the generated files are left behind in case you come back;
remove them with:

```bash
rm -f  ~/.config/omarchy/maus-control.json
rm -rf ~/.local/state/maus-control
```

## License

MIT — see [LICENSE](LICENSE).
