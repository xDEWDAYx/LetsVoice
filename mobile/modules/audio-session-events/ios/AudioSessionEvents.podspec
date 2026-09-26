Pod::Spec.new do |s|
  s.name           = 'AudioSessionEvents'
  s.version        = '1.0.0'
  s.summary        = 'Expose iPhone audio-session interruptions to React Native'
  s.description    = 'Observes AVAudioSession interruptions for safe local recording pauses.'
  s.author         = 'LetsVoice Local Mobile contributors'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
