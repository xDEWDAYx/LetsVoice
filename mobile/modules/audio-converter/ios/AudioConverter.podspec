Pod::Spec.new do |s|
  s.name           = 'AudioConverter'
  s.version        = '1.0.0'
  s.summary        = 'Prepare local audio for on-device speech recognition'
  s.description    = 'Converts local audio to 16 kHz mono PCM WAV with AVFoundation.'
  s.author         = 'LetsVoice Local Mobile contributors'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
