import SwiftUI

/// Entry point. App Clips are launched with a browsing-web user activity whose
/// URL is the invocation link (https://unifesto.app/event/<slug>), whether it
/// came from Safari, Messages, a QR code or an App Clip Code.
@main
struct UnifestoClipApp: App {
  @StateObject private var model = ClipModel()

  var body: some Scene {
    WindowGroup {
      ClipRootView(model: model)
        .preferredColorScheme(.dark)
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
          model.open(activity.webpageURL)
        }
        #if DEBUG
        // Xcode turns the scheme's _XCAppClipURL into a user activity, but a
        // plain `simctl launch` only sets the env var. Lets both test a link:
        // SIMCTL_CHILD__XCAppClipURL=https://unifesto.app/event/<slug> xcrun simctl launch booted com.unifesto.app.Clip
        .onAppear {
          if let raw = ProcessInfo.processInfo.environment["_XCAppClipURL"] {
            model.open(URL(string: raw))
          }
        }
        #endif
    }
  }
}
