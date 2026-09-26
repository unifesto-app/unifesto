import StoreKit
import SwiftUI

struct ClipRootView: View {
  @ObservedObject var model: ClipModel
  /// The system "Get the full app" banner. Shown automatically once the event
  /// is on screen, and again from the button if the user dismissed it.
  @State private var showAppOverlay = false

  var body: some View {
    ZStack {
      Color("clipBackground").ignoresSafeArea()

      switch model.state {
      case .landing:
        MessageView(
          symbol: "sparkles",
          title: "Discover events on Unifesto",
          message: "Get the app to find events near you, register in a tap and keep your tickets in one place."
        )
      case .loading:
        ProgressView().tint(.secondary)
      case .loaded(let event):
        EventPreview(event: event)
      case .unavailable:
        MessageView(
          symbol: "calendar.badge.exclamationmark",
          title: "This event isn't available",
          message: "It may be private, unpublished or removed. Check your connection, or open it in the Unifesto app.",
          retry: model.retry
        )
      }
    }
    .safeAreaInset(edge: .bottom) {
      Button {
        showAppOverlay = true
      } label: {
        Text(ctaTitle)
          .font(.headline)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 14)
      }
      .buttonStyle(.borderedProminent)
      .tint(.accentColor)
      .buttonBorderShape(.roundedRectangle(radius: 14))
      .padding(.horizontal, 20)
      .padding(.bottom, 8)
    }
    .appStoreOverlay(isPresented: $showAppOverlay) {
      SKOverlay.AppClipConfiguration(position: .bottom)
    }
    .onChange(of: isLoaded) { _, loaded in
      if loaded { showAppOverlay = true }
    }
  }

  private var isLoaded: Bool {
    if case .loaded = model.state { return true }
    return false
  }

  private var ctaTitle: String {
    if case .loaded(let event) = model.state, !event.isCancelled {
      return "Get Unifesto to register"
    }
    return "Get Unifesto"
  }
}

private struct EventPreview: View {
  let event: ClipEvent

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        // 4:3 like every banner in the apps; text stays below, never over it.
        Color("clipElevated")
          .aspectRatio(4 / 3, contentMode: .fit)
          .overlay {
            AsyncImage(url: event.bannerURL) { image in
              image.resizable().scaledToFill()
            } placeholder: {
              Image(systemName: "photo").font(.largeTitle).foregroundStyle(Color("clipTextSecondary"))
            }
          }
          .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

        if let space = event.space {
          HStack(spacing: 10) {
            AsyncImage(url: space.logoUrl.flatMap(URL.init(string:))) { image in
              image.resizable().scaledToFill()
            } placeholder: {
              Color("clipElevated")
            }
            .frame(width: 28, height: 28)
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))

            Text(space.name)
              .font(.subheadline.weight(.medium))
              .foregroundStyle(Color("clipTextSecondary"))
              .lineLimit(1)
          }
        }

        Text(event.title)
          .font(.title2.weight(.semibold))
          .foregroundStyle(.white)
          .fixedSize(horizontal: false, vertical: true)

        if event.isCancelled {
          Text("This event was cancelled")
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.red)
        }

        VStack(alignment: .leading, spacing: 14) {
          Fact(symbol: "calendar", text: event.whenLabel)
          if let place = event.whereLabel {
            Fact(symbol: event.type == "ONLINE" ? "video" : "mappin.and.ellipse", text: place)
          }
          Fact(symbol: "ticket", text: event.priceLabel)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color("clipElevated"), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
      .padding(.horizontal, 20)
      .padding(.top, 12)
      .padding(.bottom, 24)
    }
  }
}

/// Bare SF Symbol + text; icons are never put on a tile or circle.
private struct Fact: View {
  let symbol: String
  let text: String

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 12) {
      Image(systemName: symbol)
        .font(.body.weight(.medium))
        .foregroundStyle(Color.accentColor)
        .frame(width: 22)
      Text(text)
        .font(.body)
        .foregroundStyle(.white)
    }
  }
}

private struct MessageView: View {
  let symbol: String
  let title: String
  let message: String
  var retry: (() -> Void)? = nil

  var body: some View {
    VStack(spacing: 14) {
      Image(systemName: symbol)
        .font(.system(size: 44, weight: .regular))
        .foregroundStyle(Color.accentColor)
      Text(title)
        .font(.title3.weight(.semibold))
        .foregroundStyle(.white)
        .multilineTextAlignment(.center)
      Text(message)
        .font(.subheadline)
        .foregroundStyle(Color("clipTextSecondary"))
        .multilineTextAlignment(.center)
      if let retry {
        Button("Try again", action: retry)
          .font(.subheadline.weight(.medium))
          .padding(.top, 4)
      }
    }
    .padding(.horizontal, 32)
  }
}
