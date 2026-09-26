import ExpoModulesCore

public final class AudioConverterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioConverter")

    AsyncFunction("prepareAudioAsync") { (inputURI: String, outputURI: String) -> [String: Any] in
      let inputURL = try AudioPreparer.localFileURL(from: inputURI)
      let outputURL = try AudioPreparer.localFileURL(from: outputURI)

      try AudioPreparer.prepare(inputURL: inputURL, outputURL: outputURL)

      return [
        "uri": outputURL.absoluteString,
        "temporary": true,
      ]
    }
  }
}
