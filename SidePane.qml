import QtQuick
import qs.Commons

// The one pane that lives on the right of the diagram: the detection wizard,
// the sensitivity sidebar, the wheel-speed sidebar, or the button inspector.
//
// It is docked when the window is wide enough that the diagram can lose the
// space, and floats over the diagram when it is not (the panel decides which
// and positions this accordingly). Only one occupant is ever visible.
Rectangle {
  id: root

  property var panel: null
  property bool overlay: false

  radius: Style.cornerRadius > 0 ? Style.cornerRadius : 6
  // An overlay has to sit on top of the diagram, so it is opaque; a docked
  // pane is a subtle tint that matches the rest of the panel.
  color: root.overlay
    ? Color.background
    : Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.035)
  border.width: 1
  border.color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)

  Behavior on x { NumberAnimation { duration: 160; easing.type: Easing.OutCubic } }

  DetectPanel {
    anchors.fill: parent
    anchors.margins: Style.space(4)
    panel: root.panel
    visible: root.panel && root.panel.mode === "detect"
  }
  SensPanel {
    anchors.fill: parent
    anchors.margins: Style.space(4)
    panel: root.panel
    visible: root.panel && root.panel.mode === "sens"
  }
  ScrollPanel {
    anchors.fill: parent
    anchors.margins: Style.space(4)
    panel: root.panel
    visible: root.panel && root.panel.mode === "scroll"
  }
  ActionPicker {
    anchors.fill: parent
    anchors.margins: Style.space(4)
    panel: root.panel
    visible: root.panel && root.panel.mode === "inspector"
  }
}
