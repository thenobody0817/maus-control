import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui as Ui
import "Scroll.js" as Scroll

// Wheel speed for the current mouse.
//
// Reads and writes through the panel rather than holding its own copy, so
// the header readout and this sidebar can never disagree about the factor.
//
// Moving the slider applies the factor to the running compositor
// immediately, because wheel speed is something you judge by feel and not
// by a number. Nothing is written to disk until Apply, which is the same
// promise every other control in this panel makes.
Item {
  id: root

  property var panel: null

  readonly property var config: panel ? panel.scrollConfig : Scroll.blank()
  readonly property bool on: panel ? panel.scrollOn : false
  readonly property string readout: panel ? panel.scrollReadout
    : Scroll.factorLabel(Scroll.DEFAULT_FACTOR)

  // Where the factor sits on the slider's own scale, which is what the
  // meter under the readout is showing. Anchored at MIN_FACTOR rather than
  // at 0 so the bar means the same thing whatever the bounds become.
  readonly property real position: {
    var span = Scroll.MAX_FACTOR - Scroll.MIN_FACTOR
    return span > 0
      ? Math.max(0, Math.min(1, (config.factor - Scroll.MIN_FACTOR) / span)) : 0
  }

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
          text: "Scroll speed"
          color: Color.foreground
          font.family: Style.font.family
          font.pixelSize: Style.font.subtitle
          font.weight: Font.DemiBold
        }
        Text {
          text: root.on ? "on" : "off"
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
        onClicked: root.panel.setScrollEnabled(!root.on)
      }
    }

    Rectangle {
      Layout.fillWidth: true
      implicitHeight: 1
      color: Qt.rgba(Color.foreground.r, Color.foreground.g, Color.foreground.b, 0.12)
    }

    // ---------------------------------------------------------- off
    //
    // The pitch, for a mouse whose wheel has never been touched. It says
    // what this does and, just as importantly, what it does not do.
    ColumnLayout {
      Layout.fillWidth: true
      visible: !root.on
      spacing: Style.space(3)

      Text {
        Layout.fillWidth: true
        text: "A multiplier for the wheel. 1.00× is untouched, above 1.00× "
            + "scrolls further per notch, below it scrolls less — for a "
            + "mouse that skips a page at a time, or one that crawls."
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
        anchors.fill: parent
        anchors.margins: Style.space(3)
        spacing: Style.space(2)

        RowLayout {
          Layout.fillWidth: true
          spacing: Style.space(2)
          Text {
            text: root.readout
            color: Color.accent
            font.family: Style.font.family
            font.pixelSize: Style.font.displayLarge
            font.weight: Font.DemiBold
          }
          Item { Layout.fillWidth: true }
          Text {
            Layout.alignment: Qt.AlignBottom
            Layout.bottomMargin: Style.space(2)
            text: root.config.factor === Scroll.DEFAULT_FACTOR ? "unchanged" : "your wheel"
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            elide: Text.ElideRight
            Layout.maximumWidth: parent.width * 0.45
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
          text: "1.00× leaves the wheel exactly as Hyprland had it"
          wrapMode: Text.WordWrap
          color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.75)
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }
      }
    }

    // ---------------------------------------------------------- slider
    RowLayout {
      Layout.fillWidth: true
      visible: root.on
      spacing: Style.space(2)

      // Nudges are for the last percent: a drag cannot land on an exact
      // value, and the wheel notch is easy to overshoot for a one-tick
      // adjustment.
      Ui.Button {
        text: "−"
        bordered: true
        enabled: root.config.factor > Scroll.MIN_FACTOR
        horizontalPadding: Style.space(3)
        tooltipText: "Slower by " + Scroll.STEP.toFixed(Scroll.DECIMALS) + "×"
        onClicked: root.panel.setScrollFactor(root.config.factor - Scroll.STEP, true)
      }
      Ui.PanelSlider {
        Layout.fillWidth: true
        fillColor: Color.accent
        knobColor: Color.accent
        minimum: Scroll.MIN_FACTOR
        maximum: Scroll.MAX_FACTOR
        step: Scroll.STEP
        integer: false
        value: root.config.factor
        onMoved: function (next) { root.panel.setScrollFactor(next, false) }
        onReleased: function (next) { root.panel.setScrollFactor(next, true) }
      }
      Ui.Button {
        text: "+"
        bordered: true
        enabled: root.config.factor < Scroll.MAX_FACTOR
        horizontalPadding: Style.space(3)
        tooltipText: "Faster by " + Scroll.STEP.toFixed(Scroll.DECIMALS) + "×"
        onClicked: root.panel.setScrollFactor(root.config.factor + Scroll.STEP, true)
      }
      Text {
        Layout.minimumWidth: Style.space(24)
        horizontalAlignment: Text.AlignRight
        text: root.readout
        color: Color.foreground
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
      }
    }

    RowLayout {
      Layout.fillWidth: true
      visible: root.on
      spacing: Style.space(2)
      Item { Layout.fillWidth: true }
      Ui.Button {
        text: "Reset to 1.00×"
        bordered: true
        enabled: root.config.factor !== Scroll.DEFAULT_FACTOR
        onClicked: root.panel.setScrollFactor(Scroll.DEFAULT_FACTOR, true)
      }
    }

    Text {
      Layout.fillWidth: true
      visible: root.on
      text: "Changes preview live. Nothing is saved until you press Apply."
      wrapMode: Text.WordWrap
      color: Color.muted
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }

    Item { Layout.fillHeight: true }

    // ---------------------------------------------------------- footer
    RowLayout {
      Layout.fillWidth: true
      spacing: Style.space(2)
      Item { Layout.fillWidth: true }
      Ui.Button {
        text: "Done"
        bordered: true
        onClicked: root.panel.scrollOpen = false
      }
    }
  }
}
