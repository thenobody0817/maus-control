import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui as Ui

// The action bar under the diagram: what the panel is telling you on the
// left, what you can do about it on the right. Apply and Revert are the
// primary pair and keep their labels; the rest shorten as the window
// narrows so nothing is ever pushed off the edge.
RowLayout {
  id: root

  property var panel: null
  property bool compact: false

  spacing: Style.space(3)

  Text {
    Layout.fillWidth: true
    Layout.minimumWidth: Style.space(40)
    text: panel && panel.status !== ""
      ? panel.status
      : (panel && panel.dirty ? "Unsaved changes." : "Click a button on the mouse to map it.")
    color: panel && panel.statusBad ? Color.urgent
         : (panel && panel.dirty ? Color.accent : Color.muted)
    font.family: Style.font.family
    font.pixelSize: Style.font.bodySmall
    elide: Text.ElideRight
    verticalAlignment: Text.AlignVCenter
  }

  Ui.Button {
    text: root.compact ? "Scan" : "Rescan"
    bordered: true
    enabled: panel && !panel.busy
    tooltipText: "Look for the mouse again, and re-read its battery."
    onClicked: panel.refresh()
  }
  Ui.Button {
    text: panel && panel.learning ? "Cancel" : (root.compact ? "Detect" : "Detect buttons")
    bordered: true
    selected: panel && panel.learning
    tooltipText: "Walk through each button so Maus Control learns which ones exist and where they are."
    onClicked: panel && panel.learning ? panel.cancelLearn() : panel.startLearn()
  }
  Ui.Button {
    text: panel && panel.testing ? "Stop" : "Test"
    bordered: true
    selected: panel && panel.testing
    enabled: panel && !panel.learning
    tooltipText: "Press your mouse buttons and watch them light up, so you can check each one is drawn in the right place."
    onClicked: panel && panel.testing ? panel.stopTest() : panel.startTest()
  }
  Ui.Button {
    text: "Revert"
    bordered: true
    enabled: panel && panel.dirty && !panel.busy
    onClicked: panel.revert()
  }
  Ui.Button {
    text: panel && panel.busy ? "Applying…" : "Apply"
    bordered: true
    active: panel && panel.dirty
    enabled: panel && panel.dirty && !panel.busy
    onClicked: panel.applyNow()
  }
}
