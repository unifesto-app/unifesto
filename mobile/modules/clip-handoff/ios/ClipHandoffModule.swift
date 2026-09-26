import ExpoModulesCore

/// The App Clip (mobile/targets/clip) leaves the event it showed in the shared
/// app group. The full app takes it once on launch, so a user who installed
/// from the clip lands on that same event instead of the home screen.
public class ClipHandoffModule: Module {
  // Must match ClipHandoff in targets/clip/ClipModel.swift.
  private static let suite = "group.com.unifesto.app"
  private static let key = "clipHandoff"

  public func definition() -> ModuleDefinition {
    Name("ClipHandoff")

    // Returns { path, savedAt } and clears it, or null. Read-once so the app
    // never reopens the same event on later launches.
    Function("take") { () -> [String: Any]? in
      guard let defaults = UserDefaults(suiteName: Self.suite),
            let value = defaults.dictionary(forKey: Self.key) else { return nil }
      defaults.removeObject(forKey: Self.key)
      return value
    }
  }
}
