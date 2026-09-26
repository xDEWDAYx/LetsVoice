Pod::Spec.new do |s|
  s.name           = 'SpeechPcmPlayer'
  s.version        = '1.0.0'
  s.summary        = 'Immediate, session-safe PCM speech playback'
  s.description    = 'Owns the native PCM player so speech can be flushed independently of TTS synthesis.'
  s.author         = 'LetsVoice Mobile contributors'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
