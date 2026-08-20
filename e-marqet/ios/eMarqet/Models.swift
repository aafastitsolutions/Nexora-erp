import Foundation

struct ConfigResponse: Decodable {
    let ok: Bool
    let verticals: [Vertical]
    let autoBrandModels: [String: [String]]

    enum CodingKeys: String, CodingKey {
        case ok
        case verticals
        case autoBrandModels = "auto_brand_models"
    }
}

struct ListingsResponse: Decodable {
    let ok: Bool
    let listings: [Listing]
}

struct Vertical: Identifiable, Decodable, Hashable {
    let id: Int?
    let code: String
    let name: String
}

struct Listing: Identifiable, Decodable, Hashable {
    let id: Int
    let code: String?
    let title: String
    let description: String?
    let location: String?
    let priceAmount: Double?
    let priceCurrency: String?
    let primaryImageUrl: URL?
    let imageUrls: [URL]
    let vertical: ListingVertical?
    let partner: Partner?
    let metadata: [String: StringValue]

    enum CodingKeys: String, CodingKey {
        case id
        case code
        case title
        case description
        case location
        case priceAmount = "price_amount"
        case priceCurrency = "price_currency"
        case primaryImageUrl = "primary_image_url"
        case imageUrls = "image_urls"
        case vertical
        case partner
        case metadata
    }

    var priceText: String {
        guard let priceAmount, priceAmount > 0 else { return "Pret la cerere" }
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "ro_RO")
        formatter.maximumFractionDigits = 0
        return "\(formatter.string(from: NSNumber(value: priceAmount)) ?? "\(Int(priceAmount))") \(priceCurrency ?? "EUR")"
    }
}

struct ListingVertical: Decodable, Hashable {
    let code: String?
    let name: String?
}

struct Partner: Decodable, Hashable {
    let name: String?
    let email: String?
    let phone: String?
    let website: String?
}

enum StringValue: Decodable, Hashable, CustomStringConvertible {
    case string(String)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Int.self) {
            self = .string(String(value))
        } else if let value = try? container.decode(Double.self) {
            self = .string(String(value))
        } else if let value = try? container.decode(Bool.self) {
            self = .string(value ? "Da" : "Nu")
        } else {
            self = .string("")
        }
    }

    var description: String {
        switch self {
        case .string(let value): return value
        }
    }
}
