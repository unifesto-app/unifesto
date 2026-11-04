import AppIntents
import UIKit

// iOS App Shortcuts: Spotlight, Siri and the Shortcuts app list these, so
// searching "tickets", "events" or "scan" on the phone finds Unifesto. Each one
// opens the app, then its own unifesto:// link, so expo-router routes it like
// any tapped link. A cold start works too: expo-linking keeps the URL natively
// until JS asks for its initial URL.
// Copied into the app target by plugins/withAppShortcuts.js (ios/ is generated).

@MainActor
private func openRoute(_ path: String) async {
  await UIApplication.shared.open(URL(string: "unifesto://\(path)")!)
}

struct OpenTicketsIntent: AppIntent {
  static let title: LocalizedStringResource = "My tickets"
  static let description = IntentDescription(
    "Opens my tickets and their entry QR codes.",
    searchKeywords: ["ticket", "tickets", "pass", "QR code", "entry"]
  )
  static let openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    await openRoute("tickets")
    return .result()
  }
}

struct FindEventsIntent: AppIntent {
  static let title: LocalizedStringResource = "Find events"
  static let description = IntentDescription(
    "Browses events, fests and hackathons.",
    searchKeywords: ["event", "events", "fest", "hackathon", "college", "workshop"]
  )
  static let openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    await openRoute("events")
    return .result()
  }
}

// The Space tab lists the events I can check in to; anyone without an
// operator role is sent back to Home by the screen itself.
struct ScanTicketsIntent: AppIntent {
  static let title: LocalizedStringResource = "Scan tickets"
  static let description = IntentDescription(
    "Opens check-in for the events I run.",
    searchKeywords: ["scan", "scanner", "check-in", "check in", "QR code", "ticket"]
  )
  static let openAppWhenRun = true

  @MainActor
  func perform() async throws -> some IntentResult {
    await openRoute("space")
    return .result()
  }
}

struct UnifestoShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: OpenTicketsIntent(),
      phrases: [
        "Show my tickets in \(.applicationName)",
        "Open my \(.applicationName) tickets",
        "Show my \(.applicationName) ticket",
        "Show my \(.applicationName) pass",
        "My \(.applicationName) tickets",
      ],
      shortTitle: "My tickets",
      systemImageName: "ticket"
    )
    AppShortcut(
      intent: FindEventsIntent(),
      phrases: [
        "Find events in \(.applicationName)",
        "Find events on \(.applicationName)",
        "Browse \(.applicationName) events",
        "Show events in \(.applicationName)",
        "Find fests on \(.applicationName)",
        "Find hackathons on \(.applicationName)",
      ],
      shortTitle: "Find events",
      systemImageName: "calendar"
    )
    AppShortcut(
      intent: ScanTicketsIntent(),
      phrases: [
        "Scan tickets in \(.applicationName)",
        "Scan a ticket with \(.applicationName)",
        "Check in attendees with \(.applicationName)",
        "Start check-in in \(.applicationName)",
        "Open the \(.applicationName) scanner",
      ],
      shortTitle: "Scan tickets",
      systemImageName: "qrcode.viewfinder"
    )
  }
}
