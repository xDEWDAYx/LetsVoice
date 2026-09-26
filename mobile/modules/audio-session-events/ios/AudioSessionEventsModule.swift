import AVFoundation
import ExpoModulesCore

private let onInterruption = "onInterruption"

public final class AudioSessionEventsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioSessionEvents")

    Events(onInterruption)

    OnStartObserving(onInterruption) {
      NotificationCenter.default.removeObserver(
        self,
        name: AVAudioSession.interruptionNotification,
        object: nil
      )
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.handleInterruption),
        name: AVAudioSession.interruptionNotification,
        object: nil
      )
    }

    OnStopObserving(onInterruption) {
      NotificationCenter.default.removeObserver(
        self,
        name: AVAudioSession.interruptionNotification,
        object: nil
      )
    }
  }

  @objc private func handleInterruption(_ notification: Notification) {
    guard
      let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey]
        as? NSNumber,
      let type = AVAudioSession.InterruptionType(rawValue: typeValue.uintValue)
    else {
      return
    }

    let optionsValue = (
      notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? NSNumber
    )?.uintValue ?? 0
    let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)

    sendEvent(onInterruption, [
      "type": type == .began ? "began" : "ended",
      "shouldResume": options.contains(.shouldResume),
    ])
  }
}
