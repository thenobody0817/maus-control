import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui as Ui
import "Sens.js" as Sens

// Pointer sensitivity for the current mouse.
//
// Three things live here, and only two of them are settings the compositor
// actually has: the acceleration profile and the raw sensitivity. The third,
// the mouse's own DPI, is a number the user declares so the pointer can be
// shown as an effective DPI under the flat profile. See Sens.js.
//
// Reads and writes through the panel rather than holding its own copy, so
// the header readout and this sidebar can never disagree.
Item {
  id: root

  property var panel: null

  readonly property var config: panel ? panel.sensConfig : Sens.blank()
  readonly property bool on: panel ? panel.sensOn : false
  readonly property int current: panel ? panel.sensCurrent : 0
  readonly property int editing: panel ? panel.sensEditing : -1

  readonly property bool flat: config.profile === "flat"
  readonly property var live: on && current < config.presets.length
    ? config.presets[current] : null

  // The number on screen is the DPI the pointer acts like under flat, and
  // the raw libinput value under adaptive. One profile decides it.
  readonly property real liveSensitivity: live ? live.sensitivity : 0
  readonly property real liveDpi: Sens.effectiveDpi(liveSensitivity, config.sensor)
  readonly property real liveFactor: 1 + liveSensitivity
  readonly property real ceiling: Sens.ceilingFor(config.sensor)

  // Where the live value sits on its own scale, which is what the meter
  // under the readout is showing.
  readonly property real position: live === null ? 0
    : (flat ? Math.max(0, Math.min(1, liveDpi / ceiling))
            : Math.max(0, Math.min(1, (liveSensitivity + 1) / 2)))

  // The preset editor works in DPI under flat (the unit people think in)
  // and in the raw value under adaptive (where DPI would mean nothing).
  readonly property real editValue: editing >= 0 && editing < config.presets.length
    ? (flat ? Math.round(Sens.effectiveDpi(config.presets[editing].sensitivity, config.sensor))
            : config.presets[editing].sensitivity)
    : 0

  ColumnLayout {
    anchors.fill: parent
    spacing: Style.space(3)

    // ---------------------------------------------------------- header
    RowLayout {
      Layout.fillWidth: true
      spacing: Style.space(2)

      ColumnLayout {
        spacing: 1
        Text {
          text: "Sens"
          color: Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.subtitle
          font.weight: Font.DemiBold
        }
        Text {
          text: root.on ? root.config.presets.length + " presets · " + root.config.profile : "off"
          color: Color.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }
      }
      Item { Layout.fillWidth: true }
      Ui.Button {
        text: root.on ? "Turn off" : "Turn on"
        bordered: true
        active: !root.on
        onClicked: root.panel.setSensEnabled(!root.on)
      }
    }

    Rectangle {
      Layout.fillWidth: true
      implicitHeight: 1
      color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)
    }

    // ---------------------------------------------------------- off
    ColumnLayout {
      Layout.fillWidth: true
      visible: !root.on
      spacing: Style.space(3)

      Text {
        Layout.fillWidth: true
        text: "Adjust the pointer for this mouse: its acceleration profile, the "
            + "raw libinput sensitivity, and a declared sensor DPI so the speed "
            + "can be shown as one number you recognise."
        wrapMode: Text.WordWrap
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
      Text {
        Layout.fillWidth: true
        text: "Like everything else here, this is a Hyprland setting scoped to "
            + "this mouse. Nothing is written to the mouse itself, so it still "
            + "behaves as it always did on any other machine."
        wrapMode: Text.WordWrap
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.caption
      }
      Item { Layout.fillHeight: true }
    }

    // ---------------------------------------------------------- readout
    Rectangle {
      Layout.fillWidth: true
      visible: root.on
      radius: Style.cornerRadius > 0 ? Style.cornerRadius : 6
      color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.10)
      border.color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.35)
      border.width: 1
      implicitHeight: readout.implicitHeight + Style.space(6)

      ColumnLayout {
        id: readout
        // Positioned, not anchored to fill: the parent's implicit height is
        // this ColumnLayout's height, so anchoring would make each depend on
        // the other and QML would rearrange forever.
        x: Style.space(3)
        y: Style.space(3)
        width: parent.width - 2 * Style.space(3)
        spacing: Style.space(2)

        RowLayout {
          Layout.fillWidth: true
          spacing: Style.space(2)
          Text {
            text: root.live === null ? "—"
                  : (root.flat ? String(Math.round(root.liveDpi))
                               : root.liveSensitivity.toFixed(2))
            color: Color.accent
            font.family: Style.font.family
            font.pixelSize: Style.font.displayLarge
            font.weight: Font.DemiBold
          }
          Text {
            Layout.alignment: Qt.AlignBottom
            Layout.bottomMargin: Style.space(2)
            text: root.flat ? "DPI" : "sens"
            color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.7)
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
            font.weight: Font.DemiBold
          }
          Item { Layout.fillWidth: true }
          Text {
            Layout.alignment: Qt.AlignBottom
            Layout.bottomMargin: Style.space(2)
            text: root.live ? root.live.name : ""
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            elide: Text.ElideRight
            Layout.maximumWidth: readout.width * 0.45
          }
        }

        Rectangle {
          Layout.fillWidth: true
          implicitHeight: Math.max(4, Style.space(2))
          radius: height / 2
          color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.14)

          Rectangle {
            height: parent.height
            radius: parent.radius
            color: Color.accent
            width: parent.width * root.position
            Behavior on width { NumberAnimation { duration: 160; easing.type: Easing.OutCubic } }
          }
        }

        Text {
          Layout.fillWidth: true
          text: root.flat
            ? root.liveFactor.toFixed(2) + "× · reaches " + root.ceiling + " DPI at this sensor"
            : "Hyprland's adaptive curve, shifted by this value"
          wrapMode: Text.WordWrap
          color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.75)
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }
      }
    }

    // ---------------------------------------------------------- scroll body
    Flickable {
      Layout.fillWidth: true
      Layout.fillHeight: true
      visible: root.on
      contentWidth: width
      contentHeight: body.implicitHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds

      ColumnLayout {
        id: body
        width: parent.width
        spacing: Style.space(2)

        // ------------------------------------------------------ accel
        Ui.PanelSectionHeader {
          Layout.fillWidth: true
          text: "ACCELERATION"
        }

        RowLayout {
          Layout.fillWidth: true
          spacing: Style.space(2)
          Ui.Button {
            Layout.fillWidth: true
            text: "Adaptive"
            bordered: true
            selected: !root.flat
            onClicked: root.panel.setSensProfile("adaptive")
          }
          Ui.Button {
            Layout.fillWidth: true
            text: "Flat"
            bordered: true
            selected: root.flat
            onClicked: root.panel.setSensProfile("flat")
          }
        }

        Text {
          Layout.fillWidth: true
          text: root.flat
            ? "Flat: a constant multiplier, so sensitivity maps exactly to DPI."
            : "Adaptive: Hyprland's default curve, faster on quick movement. DPI is not shown, because no single multiplier describes it."
          wrapMode: Text.WordWrap
          color: Color.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        // ------------------------------------------------------ presets
        Ui.PanelSectionHeader {
          Layout.fillWidth: true
          Layout.topMargin: Style.space(3)
          text: "PRESETS"
        }

        Repeater {
          model: { root.panel ? root.panel.configRev : 0; return root.config.presets }

          delegate: Rectangle {
            id: card
            required property var modelData
            required property int index
            readonly property bool chosen: root.current === index
            readonly property bool open: root.editing === index

            Layout.fillWidth: true
            implicitHeight: cardRow.implicitHeight + Style.space(4)
            radius: Style.cornerRadius > 0 ? Style.cornerRadius : 5
            color: chosen ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.16)
                          : (cardMouse.containsMouse
                             ? Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.08)
                             : Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.035))
            border.width: 1
            border.color: chosen ? Color.accent
                                 : (open ? Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.3)
                                         : Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.10))

            RowLayout {
              id: cardRow
              anchors.fill: parent
              anchors.leftMargin: Style.space(3)
              anchors.rightMargin: Style.space(2)
              spacing: Style.space(2)

              Text {
                Layout.fillWidth: true
                text: card.modelData.name
                color: card.chosen ? Color.accent : Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
                font.weight: card.chosen ? Font.DemiBold : Font.Normal
                elide: Text.ElideRight
              }
              Text {
                text: Sens.valueLabel(card.modelData.sensitivity, root.config.profile, root.config.sensor)
                color: card.chosen ? Color.accent : Color.muted
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }
              Ui.Button {
                text: card.open ? "✕" : "✎"
                bordered: false
                fontSize: Style.font.caption
                horizontalPadding: Style.space(2)
                verticalPadding: Style.space(1)
                tooltipText: card.open ? "Close" : "Rename or change this preset"
                onClicked: root.panel.sensEditing = card.open ? -1 : card.index
              }
            }

            MouseArea {
              id: cardMouse
              anchors.fill: parent
              anchors.rightMargin: Style.space(9)   // leave the edit button clickable
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: root.panel.selectSensPreset(card.index)
            }
          }
        }

        // ------------------------------------------------------ editor
        Rectangle {
          Layout.fillWidth: true
          visible: root.editing >= 0 && root.editing < root.config.presets.length
          radius: Style.cornerRadius > 0 ? Style.cornerRadius : 5
          color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.05)
          border.width: 1
          border.color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.14)
          implicitHeight: editor.implicitHeight + Style.space(5)

          ColumnLayout {
            id: editor
            anchors.fill: parent
            anchors.margins: Style.space(3)
            spacing: Style.space(2)

            readonly property var preset: root.editing >= 0 && root.editing < root.config.presets.length
              ? root.config.presets[root.editing] : null

            Ui.TextField {
              Layout.fillWidth: true
              // One way only: rebinding on every keystroke fights the
              // cursor. The panel is updated on edit instead.
              text: editor.preset ? editor.preset.name : ""
              placeholderText: "Name"
              maximumLength: Sens.MAX_NAME
              onTextEdited: root.panel.editSensPreset(root.editing, { name: text }, false)
            }

            RowLayout {
              Layout.fillWidth: true
              spacing: Style.space(2)
              Ui.PanelSlider {
                Layout.fillWidth: true
                fillColor: Color.accent
                knobColor: Color.accent
                // DPI under flat, raw sensitivity under adaptive.
                minimum: root.flat ? Sens.SENSOR_STEP : Sens.MIN_SENSITIVITY
                maximum: root.flat ? root.ceiling : Sens.MAX_SENSITIVITY
                step: root.flat ? Sens.SENSOR_STEP : Sens.SENS_STEP
                integer: root.flat
                value: root.editValue
                onMoved: function (next) {
                  root.panel.editSensPreset(root.editing,
                    root.flat ? { dpi: next } : { sensitivity: next }, false)
                }
                onReleased: function (next) {
                  root.panel.editSensPreset(root.editing,
                    root.flat ? { dpi: next } : { sensitivity: next }, true)
                }
              }
              Text {
                Layout.minimumWidth: Style.space(24)
                horizontalAlignment: Text.AlignRight
                text: editor.preset
                  ? Sens.valueLabel(editor.preset.sensitivity, root.config.profile, root.config.sensor) : ""
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
              }
            }

            RowLayout {
              Layout.fillWidth: true
              spacing: Style.space(2)
              Item { Layout.fillWidth: true }
              Ui.Button {
                text: "Remove preset"
                bordered: true
                onClicked: root.panel.removeSensPreset(root.editing)
              }
            }
          }
        }

        Ui.Button {
          Layout.fillWidth: true
          text: "Add a preset"
          bordered: true
          enabled: root.config.presets.length < Sens.MAX_PRESETS
          onClicked: root.panel.addSensPreset()
        }

        // ------------------------------------------------------ sensor
        Ui.PanelSectionHeader {
          Layout.fillWidth: true
          Layout.topMargin: Style.space(3)
          text: "YOUR MOUSE'S OWN DPI"
        }

        RowLayout {
          Layout.fillWidth: true
          spacing: Style.space(2)
          Ui.PanelSlider {
            Layout.fillWidth: true
            minimum: Sens.MIN_SENSOR
            maximum: 6400
            step: Sens.SENSOR_STEP
            integer: true
            value: root.config.sensor
            onMoved: function (next) { root.panel.setSensSensor(next, false) }
            onReleased: function (next) { root.panel.setSensSensor(next, true) }
          }
          Text {
            Layout.minimumWidth: Style.space(24)
            horizontalAlignment: Text.AlignRight
            text: root.config.sensor
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
          }
        }

        Text {
          Layout.fillWidth: true
          text: "What the sensor itself is set to. Maus Control never changes it and "
              + "cannot read it — set it with your mouse's own configurator "
              + "(Solaar, Piper, or a vendor tool) and say so here. It only "
              + "scales the DPI shown above; changing it never changes how a "
              + "preset feels."
          wrapMode: Text.WordWrap
          color: Color.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        // Where the button hint lives, inside the scroll rather than
        // competing with the presets for the column's fixed height.
        Text {
          Layout.fillWidth: true
          Layout.topMargin: Style.space(3)
          text: "Click a button on the diagram and pick Next preset to switch "
              + "with your thumb, or Hold to slow down for a sniper button."
          wrapMode: Text.WordWrap
          color: Color.muted
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Item { Layout.preferredHeight: Style.space(3) }
      }
    }

    // ---------------------------------------------------------- footer
    RowLayout {
      Layout.fillWidth: true
      spacing: Style.space(2)
      Item { Layout.fillWidth: true }
      Ui.Button {
        text: "Done"
        bordered: true
        onClicked: root.panel.sensOpen = false
      }
    }
  }
}
