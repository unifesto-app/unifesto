import Foundation

@MainActor
final class ClipModel: ObservableObject {
  enum State {
    /// Launched without an event link (e.g. the default App Store clip URL).
    case landing
    case loading
    case loaded(ClipEvent)
    case unavailable
  }

  @Published private(set) var state: State = .landing
  private var currentSlug: String?

  /// Handles every invocation, including a second link tapped while the clip
  /// is still in memory.
  func open(_ url: URL?) {
    guard let slug = Self.eventSlug(from: url) else {
      state = .landing
      return
    }
    guard slug != currentSlug || !isLoaded else { return }
    currentSlug = slug
    ClipHandoff.save(path: "/event/\(slug)")
    Task { await load(slug) }
  }

  func retry() {
    guard let slug = currentSlug else { return }
    Task { await load(slug) }
  }

  private var isLoaded: Bool {
    if case .loaded = state { return true }
    return false
  }

  private func load(_ slug: String) async {
    state = .loading
    do {
      let event = try await ClipAPI.event(slug: slug)
      guard slug == currentSlug else { return }
      state = .loaded(event)
    } catch {
      guard slug == currentSlug else { return }
      state = .unavailable
    }
  }

  /// `/event/<slug>` on unifesto.app or www. Anything else is the landing card.
  static func eventSlug(from url: URL?) -> String? {
    guard let url else { return nil }
    let parts = url.pathComponents.filter { $0 != "/" }
    guard parts.count >= 2, parts[0] == "event", !parts[1].isEmpty else { return nil }
    return parts[1]
  }
}

/// Leaves the last event for the full app in the shared app group
/// (`group.com.unifesto.app`). Read + cleared by mobile/modules/clip-handoff.
enum ClipHandoff {
  static let suite = "group.com.unifesto.app"
  static let key = "clipHandoff"

  static func save(path: String) {
    UserDefaults(suiteName: suite)?.set(
      ["path": path, "savedAt": Date().timeIntervalSince1970 * 1000],
      forKey: key
    )
  }
}
