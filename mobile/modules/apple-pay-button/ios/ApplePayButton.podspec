Pod::Spec.new do |s|
  s.name           = 'ApplePayButton'
  s.version        = '1.0.0'
  s.summary        = "Apple's own Apple Pay button (PKPaymentButton) for the pay page"
  s.description    = "Apple's own Apple Pay button (PKPaymentButton) for the pay page"
  s.author         = 'Unifesto'
  s.homepage       = 'https://unifesto.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PassKit'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
