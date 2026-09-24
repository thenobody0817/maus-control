import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui as Ui
import "Devices.js" as Devices

// The panel's one line of chrome: what is connected, what it is doing, and
// the mode switch. At a narrow width the readouts drop out and the summary
// elides, so the title, the mode switch and the mouse itself always fit.
RowLayout {
  id: root

  property var panel: null
  property bool compact: false
  property bool deviceDetail: true

  spacing: Style.space(3)

  // ---------------------------------------------------------- identity
  ColumnLayout {
    Layout.fillWidth: true
    Layout.minimumWidth: Style.space(70)
    spacing: 1

    RowLayout {
      spacing: Style.space(3)
      Text {
        text: "Maus Control"
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: root.compact ? Style.font.subtitle : Style.font.heading
        font.weight: Font.DemiBold
      }
      Rectangle {
        visible: root.panel && root.panel.device
        radius: Style.cornerRadius > 0 ? Style.cornerRadius : 3
        color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.14)
        border.color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.4)
        border.width: 1
        implicitWidth: sourceLabel.implicitWidth + Style.space(4)
        implicitHeight: sourceLabel.implicitHeight + Style.space(2)
        Layout.alignment: Qt.AlignVCenter
        Text {
          id: sourceLabel
          anchors.centerIn: parent
          color: Color.accent
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
          text: {
            if (!root.panel || !root.panel.device) return ""
            if (root.panel.device.source === "learned") return "LEARNED"
            if (root.panel.device.source === "profile") return "KNOWN MODEL"
            if (root.panel.device.source === "assumed") return "GUESSED"
            return "DETECTED"
          }
        }
      }
    }

    // The device line, and the live readings. Everything past the name is
    // the first thing to go when the window is narrow; the name itself
    // elides rather than pushing the controls off the edge.
    RowLayout {
      Layout.fillWidth: true
      spacing: Style.space(2)

      Text {
        Layout.fillWidth: true
        Layout.minimumWidth: Style.space(30)
        elide: Text.ElideRight
        text: root.panel && root.panel.device
          ? root.panel.device.label + "  ·  " + root.panel.buttonList.length + " buttons  ·  " +
            root.panel.mappedCount + " mapped"
          : "Looking for a mouse…"
        color: Color.muted
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }

      Text {
        visible: root.deviceDetail && root.panel && root.panel.battery !== null
        text: {
          if (!root.panel || !root.panel.battery) return ""
          // Written as characters, not escapes; see the mouse glyph below.
          var glyph = root.panel.battery.charging ? "" : ""
          return glyph + "  " + Devices.batteryLabel(root.panel.battery)
        }
        color: root.panel && root.panel.battery && root.panel.battery.low ? Color.urgent : Color.accent
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
        font.weight: Font.DemiBold
      }

      // The live sensitivity. Clicking it opens the Sens pane.
      Text {
        visible: root.deviceDetail && root.panel && root.panel.sensPresetText !== ""
        text: root.panel && root.panel.sensPresetText !== ""
          ? "  " + root.panel.sensPresetText : ""
        color: Color.accent
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
        font.weight: Font.DemiBold

        MouseArea {
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: if (root.panel) root.panel.openSens()
        }
      }

      // Wheel speed, plain readout; clicking opens the Scroll pane.
      Text {
        visible: root.deviceDetail && root.panel && root.panel.scrollOn
        text: root.panel && root.panel.scrollOn
          ? "⇅  " + root.panel.scrollReadout + " scroll" : ""
        color: Color.accent
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
        font.weight: Font.DemiBold

        MouseArea {
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: if (root.panel) root.panel.openScroll()
        }
      }
    }
  }

  // ---------------------------------------------------------- mode
  Ui.ButtonGroup {
    options: [
      { value: "map", label: "Map" },
      { value: "sens", label: "Sens" },
      { value: "scroll", label: "Scroll" }
    ]
    value: root.panel && ["map", "sens", "scroll"].indexOf(root.panel.mode) >= 0
      ? root.panel.mode : ""
    onChanged: function (value) { if (root.panel) root.panel.setMode(value) }
  }

  // Device switcher, only when there is a choice to make.
  Repeater {
    model: root.panel && root.panel.devices.length > 1 ? root.panel.devices : []
    Ui.Button {
      text: modelData.label
      bordered: true
      selected: index === root.panel.deviceIndex
      onClicked: {
        root.panel.deviceIndex = index
        root.panel.selectedCode = -1
        root.panel.configRev++
      }
    }
  }
}
