import AVFoundation

enum AudioPreparationError: LocalizedError {
  case invalidURL
  case unreadableInput
  case unsupportedAudio
  case durationLimitExceeded
  case converterUnavailable
  case bufferAllocationFailed
  case conversionFailed(String)
  case emptyAudio

  var errorDescription: String? {
    switch self {
    case .invalidURL:
      return "The selected audio file location is invalid."
    case .unreadableInput:
      return "The selected audio file cannot be read."
    case .unsupportedAudio:
      return "No readable audio track was found in this file."
    case .durationLimitExceeded:
      return "Audio files must be no longer than two hours."
    case .converterUnavailable:
      return "This audio format cannot be converted on this iPhone."
    case .bufferAllocationFailed:
      return "The audio converter could not allocate a processing buffer."
    case .conversionFailed(let message):
      return "The audio file could not be converted: \(message)"
    case .emptyAudio:
      return "The selected file contains no decodable audio."
    }
  }
}

enum AudioPreparer {
  static func localFileURL(from value: String) throws -> URL {
    if let parsed = URL(string: value), parsed.isFileURL {
      return parsed
    }

    if URL(string: value)?.scheme != nil {
      throw AudioPreparationError.invalidURL
    }

    return URL(fileURLWithPath: value)
  }

  static func prepare(inputURL: URL, outputURL: URL) throws {
    guard FileManager.default.isReadableFile(atPath: inputURL.path) else {
      throw AudioPreparationError.unreadableInput
    }

    let inputFile: AVAudioFile
    do {
      inputFile = try AVAudioFile(forReading: inputURL)
    } catch {
      throw AudioPreparationError.unsupportedAudio
    }

    let inputFormat = inputFile.processingFormat
    guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
      throw AudioPreparationError.unsupportedAudio
    }

    let durationSeconds = Double(inputFile.length) / inputFormat.sampleRate
    guard durationSeconds <= maximumDurationSeconds else {
      throw AudioPreparationError.durationLimitExceeded
    }

    guard let outputFormat = AVAudioFormat(
      commonFormat: .pcmFormatInt16,
      sampleRate: targetSampleRate,
      channels: 1,
      interleaved: true
    ) else {
      throw AudioPreparationError.converterUnavailable
    }
    guard let converter = AVAudioConverter(from: inputFormat, to: outputFormat) else {
      throw AudioPreparationError.converterUnavailable
    }

    let outputDirectory = outputURL.deletingLastPathComponent()
    try FileManager.default.createDirectory(
      at: outputDirectory,
      withIntermediateDirectories: true
    )
    if FileManager.default.fileExists(atPath: outputURL.path) {
      try FileManager.default.removeItem(at: outputURL)
    }

    do {
      let outputFile = try AVAudioFile(
        forWriting: outputURL,
        settings: outputFormat.settings,
        commonFormat: .pcmFormatInt16,
        interleaved: true
      )
      try convert(
        inputFile: inputFile,
        inputFormat: inputFormat,
        outputFile: outputFile,
        outputFormat: outputFormat,
        converter: converter
      )

      guard outputFile.length > 0 else {
        throw AudioPreparationError.emptyAudio
      }
    } catch {
      try? FileManager.default.removeItem(at: outputURL)
      throw error
    }
  }

  private static func convert(
    inputFile: AVAudioFile,
    inputFormat: AVAudioFormat,
    outputFile: AVAudioFile,
    outputFormat: AVAudioFormat,
    converter: AVAudioConverter
  ) throws {
    let inputCapacity: AVAudioFrameCount = 8_192
    let outputCapacity = AVAudioFrameCount(
      ceil(Double(inputCapacity) * outputFormat.sampleRate / inputFormat.sampleRate)
    ) + 64

    guard
      let inputBuffer = AVAudioPCMBuffer(
        pcmFormat: inputFormat,
        frameCapacity: inputCapacity
      ),
      let outputBuffer = AVAudioPCMBuffer(
        pcmFormat: outputFormat,
        frameCapacity: outputCapacity
      )
    else {
      throw AudioPreparationError.bufferAllocationFailed
    }

    while inputFile.framePosition < inputFile.length {
      inputBuffer.frameLength = 0
      do {
        let remainingFrames = AVAudioFrameCount(
          min(Int64(inputCapacity), inputFile.length - inputFile.framePosition)
        )
        try inputFile.read(into: inputBuffer, frameCount: remainingFrames)
      } catch {
        throw AudioPreparationError.conversionFailed(
          "reading input failed: \(error.localizedDescription)"
        )
      }

      guard inputBuffer.frameLength > 0 else {
        break
      }
      outputBuffer.frameLength = 0
      var suppliedInput = false
      var conversionError: NSError?
      let status = converter.convert(
        to: outputBuffer,
        error: &conversionError
      ) { _, inputStatus in
        if suppliedInput {
          inputStatus.pointee = .noDataNow
          return nil
        }

        suppliedInput = true
        inputStatus.pointee = .haveData
        return inputBuffer
      }

      if status == .error {
        throw AudioPreparationError.conversionFailed(
          conversionError?.localizedDescription ?? "unknown conversion error"
        )
      }
      if outputBuffer.frameLength > 0 {
        do {
          try outputFile.write(from: outputBuffer)
        } catch {
          throw AudioPreparationError.conversionFailed(
            "writing output failed: \(error.localizedDescription)"
          )
        }
      }
      if status == .endOfStream {
        break
      }
    }

    outputBuffer.frameLength = 0
    var drainError: NSError?
    let drainStatus = converter.convert(
      to: outputBuffer,
      error: &drainError
    ) { _, inputStatus in
      inputStatus.pointee = .endOfStream
      return nil
    }
    if drainStatus == .error {
      throw AudioPreparationError.conversionFailed(
        drainError?.localizedDescription ?? "could not finish the conversion"
      )
    }
    if outputBuffer.frameLength > 0 {
      do {
        try outputFile.write(from: outputBuffer)
      } catch {
        throw AudioPreparationError.conversionFailed(
          "writing output failed: \(error.localizedDescription)"
        )
      }
    }
  }

  private static let targetSampleRate = 16_000.0
  private static let maximumDurationSeconds = 2.0 * 60.0 * 60.0
}
