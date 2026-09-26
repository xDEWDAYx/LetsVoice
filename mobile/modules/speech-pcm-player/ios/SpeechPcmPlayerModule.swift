import AVFoundation
import ExpoModulesCore

public final class SpeechPcmPlayerModule: Module {
  private let lock = NSLock()
  private var sessionId: String?
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayerNode?
  private var format: AVAudioFormat?

  public func definition() -> ModuleDefinition {
    Name("SpeechPcmPlayer")

    AsyncFunction("start") { (sessionId: String, sampleRate: Double, channels: Int) in
      guard sampleRate > 0, channels == 1 else {
        throw SpeechPcmPlayerError.invalidFormat
      }
      try self.start(sessionId: sessionId, sampleRate: sampleRate)
    }

    AsyncFunction("write") { (sessionId: String, samples: [Float]) in
      try self.write(sessionId: sessionId, samples: samples)
    }

    // Synchronous by design: the user-visible Stop boundary must reach the
    // AVAudioPlayerNode immediately and must not wait for synthesis cleanup.
    Function("stop") {
      self.stopAndFlush()
    }

    OnDestroy {
      self.stopAndFlush()
    }
  }

  private func start(sessionId: String, sampleRate: Double) throws {
    stopAndFlush()

    let nextEngine = AVAudioEngine()
    let nextPlayer = AVAudioPlayerNode()
    guard let nextFormat = AVAudioFormat(
      standardFormatWithSampleRate: sampleRate,
      channels: 1
    ) else {
      throw SpeechPcmPlayerError.invalidFormat
    }

    nextEngine.attach(nextPlayer)
    nextEngine.connect(nextPlayer, to: nextEngine.mainMixerNode, format: nextFormat)
    try AVAudioSession.sharedInstance().setActive(true)
    try nextEngine.start()
    nextPlayer.play()

    lock.lock()
    self.sessionId = sessionId
    engine = nextEngine
    player = nextPlayer
    format = nextFormat
    lock.unlock()
  }

  private func write(sessionId: String, samples: [Float]) throws {
    guard !samples.isEmpty else { return }

    lock.lock()
    guard
      self.sessionId == sessionId,
      let currentPlayer = player,
      let currentFormat = format
    else {
      lock.unlock()
      return
    }

    guard let buffer = AVAudioPCMBuffer(
      pcmFormat: currentFormat,
      frameCapacity: AVAudioFrameCount(samples.count)
    ) else {
      lock.unlock()
      throw SpeechPcmPlayerError.bufferAllocationFailed
    }
    buffer.frameLength = AVAudioFrameCount(samples.count)
    samples.withUnsafeBufferPointer { source in
      guard let sourceAddress = source.baseAddress,
            let destination = buffer.floatChannelData?[0] else { return }
      destination.update(from: sourceAddress, count: samples.count)
    }

    // Keep the identity check and scheduling atomic with respect to stop().
    // stop() then drops this buffer and every other scheduled buffer.
    currentPlayer.scheduleBuffer(buffer)
    lock.unlock()
  }

  private func stopAndFlush() {
    lock.lock()
    sessionId = nil
    let oldPlayer = player
    let oldEngine = engine
    player = nil
    engine = nil
    format = nil
    oldPlayer?.stop()
    oldPlayer?.reset()
    oldEngine?.stop()
    oldEngine?.reset()
    lock.unlock()
  }
}

private enum SpeechPcmPlayerError: Error {
  case invalidFormat
  case bufferAllocationFailed
}
