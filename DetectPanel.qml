import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui as Ui
import "Devices.js" as Devices
import "Profiles.js" as Profiles

// The guided detection pass: one prompt per button, and what has been
// claimed so far. Shown in the side pane while a pass is running.
Item {
  id: root
  property var panel: null

Rectangle {
  anchors.fill: parent
  visible: panel.learning
  radius: Style.cornerRadius > 0 ? Style.cornerRadius : 6
  color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.06)
  border.width: 1
  border.color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.35)

  ColumnLayout {
    anchors.fill: parent
    anchors.margins: Style.space(4)
    spacing: Style.space(3)

    Text {
      Layout.fillWidth: true
      text: "Detecting buttons"
      color: Color.foreground
      font.family: Style.font.family
      font.pixelSize: Style.font.subtitle
      font.weight: Font.DemiBold
    }
    Text {
      Layout.fillWidth: true
      text: panel.learnCurrent
        ? "Step " + (panel.learnStep + 1) + " of " + panel.learnSteps.length
        : ""
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }

    // The ask.
    Rectangle {
      Layout.fillWidth: true
      radius: Style.cornerRadius > 0 ? Style.cornerRadius : 5
      color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.14)
      border.color: Color.accent
      border.width: 1
      implicitHeight: promptText.implicitHeight + Style.space(6)

      Text {
        id: promptText
        anchors.fill: parent
        anchors.margins: Style.space(3)
        text: panel.learnCurrent ? panel.learnCurrent.prompt : ""
        wrapMode: Text.WordWrap
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        color: Color.accent
        font.family: Style.font.family
        font.pixelSize: Style.font.body
        font.weight: Font.DemiBold
      }
    }

    Text {
      Layout.fillWidth: true
      text: "If your mouse has no such button, press Skip."
      wrapMode: Text.WordWrap
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }

    // What has been claimed so far, so a mis-press is visible
    // immediately rather than at the end.
    Ui.PanelSectionHeader {
      Layout.fillWidth: true
      Layout.topMargin: Style.space(2)
      text: "FOUND SO FAR"
    }

    Repeater {
      model: { panel.learnRev; return panel.learnSeen }
      delegate: RowLayout {
        required property var modelData
        Layout.fillWidth: true
        spacing: Style.space(2)
        Text {
          text: Devices.buttonName(modelData)
          color: Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }
        Item { Layout.fillWidth: true }
        Text {
          text: {
            panel.learnRev
            for (var place in panel.learnLayout) {
              if (panel.learnLayout[place] === modelData) {
                var spec = Profiles.places()[place]
                return spec ? spec.role : place
              }
            }
            return ""
          }
          color: Color.accent
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }
      }
    }

    Text {
      Layout.fillWidth: true
      visible: panel.learnSeen.length === 0
      text: "nothing yet"
      color: Color.muted
      font.italic: true
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }

    Item { Layout.fillHeight: true }

    RowLayout {
      Layout.fillWidth: true
      spacing: Style.space(2)
      Ui.Button {
        text: "Cancel"
        bordered: true
        onClicked: panel.cancelLearn()
      }
      Item { Layout.fillWidth: true }
      Ui.Button {
        text: "Skip"
        bordered: true
        onClicked: panel.skipLearnStep()
      }
      Ui.Button {
        text: "Finish"
        bordered: true
        active: panel.learnSeen.length > 0
        onClicked: panel.finishLearn()
      }
    }
  }
}
}
