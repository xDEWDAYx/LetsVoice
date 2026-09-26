import Foundation

@main
enum AudioPreparerSmoke {
  static func main() throws {
    guard CommandLine.arguments.count == 3 else {
      throw SmokeTestError.usage
    }

    let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
    let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
    try AudioPreparer.prepare(inputURL: inputURL, outputURL: outputURL)
  }
}

private enum SmokeTestError: LocalizedError {
  case usage

  var errorDescription: String? {
    "Usage: AudioPreparerSmoke <input-audio> <output-wav>"
  }
}
