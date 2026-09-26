import Foundation

/// The slice of `GET /events/:slug` the clip needs. Everything else in that
/// (large) payload is ignored by the decoder.
struct ClipEvent: Decodable {
  let title: String
  let slug: String
  let coverImageUrl: String?
  let type: String?
  let status: String?
  let startDateTime: Date
  let endDateTime: Date?
  let timezone: String?
  let venueName: String?
  let city: String?
  let space: Space?
  let ticketTypes: [TicketType]?

  struct Space: Decodable {
    let name: String
    let logoUrl: String?
    let bannerUrl: String?
  }

  struct TicketType: Decodable {
    let price: Double?

    enum CodingKeys: String, CodingKey { case price }

    // Prisma Decimal arrives as a string ("450"); tolerate a number too.
    init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      if let s = try? c.decode(String.self, forKey: .price) {
        price = Double(s)
      } else {
        price = try? c.decode(Double.self, forKey: .price)
      }
    }
  }

  /// Event cover first, space banner as the fallback (both are 4:3).
  var bannerURL: URL? {
    (coverImageUrl ?? space?.bannerUrl).flatMap(URL.init(string:))
  }

  var isCancelled: Bool { status == "CANCELLED" }

  /// Same rule as the apps: derive from ticket types, never `isFree`.
  /// "Free" when nothing costs money, else "Starting from ₹<cheapest paid>".
  var priceLabel: String {
    let paid = (ticketTypes ?? []).compactMap(\.price).filter { $0 > 0 }
    guard let minPaid = paid.min() else { return "Free" }
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.maximumFractionDigits = minPaid.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 2
    f.locale = Locale(identifier: "en_IN")
    return "Starting from ₹\(f.string(from: NSNumber(value: minPaid)) ?? "\(minPaid)")"
  }

  /// "Sun, 5 Oct · 10:00 AM" in the event's own timezone.
  var whenLabel: String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_IN")
    f.timeZone = timezone.flatMap(TimeZone.init(identifier:)) ?? .current
    f.dateFormat = "EEE, d MMM · h:mm a"
    return f.string(from: startDateTime)
  }

  var whereLabel: String? {
    if type == "ONLINE" { return "Online" }
    let parts = [venueName, city].compactMap { $0?.isEmpty == false ? $0 : nil }
    return parts.isEmpty ? nil : parts.joined(separator: ", ")
  }
}

enum ClipAPI {
  static let baseURL = URL(string: "https://api.unifesto.app")!

  static func event(slug: String) async throws -> ClipEvent {
    let url = baseURL.appendingPathComponent("events").appendingPathComponent(slug)
    var request = URLRequest(url: url)
    request.timeoutInterval = 15
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw URLError(.badServerResponse)
    }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom { d in
      let raw = try d.singleValueContainer().decode(String.self)
      let withFraction = ISO8601DateFormatter()
      withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      if let date = withFraction.date(from: raw) ?? ISO8601DateFormatter().date(from: raw) {
        return date
      }
      throw DecodingError.dataCorruptedError(in: try d.singleValueContainer(), debugDescription: "Bad date \(raw)")
    }
    return try decoder.decode(ClipEvent.self, from: data)
  }
}
