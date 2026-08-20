import Foundation

@MainActor
final class EMarqetStore: ObservableObject {
    @Published var verticals: [Vertical] = []
    @Published var brandModels: [String: [String]] = [:]
    @Published var listings: [Listing] = []
    @Published var isLoading = false
    @Published var errorMessage = ""

    private let baseURL = URL(string: "https://e-marqet.com")!

    func loadConfig() async {
        do {
            let response: ConfigResponse = try await get("/api/e-marqet/config")
            verticals = response.verticals
            brandModels = response.autoBrandModels
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadListings(query: String = "", vertical: String = "", brand: String = "", model: String = "") async {
        isLoading = true
        defer { isLoading = false }
        do {
            var items: [URLQueryItem] = [URLQueryItem(name: "mobile", value: "1")]
            if !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
            if !vertical.isEmpty { items.append(URLQueryItem(name: "vertical", value: vertical)) }
            if vertical == "auto", !brand.isEmpty { items.append(URLQueryItem(name: "brand", value: brand)) }
            if vertical == "auto", !model.isEmpty { items.append(URLQueryItem(name: "model", value: model)) }
            let response: ListingsResponse = try await get("/api/e-marqet/listings", queryItems: items)
            listings = response.listings
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func sendLead(listing: Listing, name: String, email: String, phone: String, message: String) async throws {
        let payload: [String: Any] = [
            "listing_id": listing.id,
            "requester_name": name,
            "requester_email": email,
            "requester_phone": phone,
            "message": message
        ]
        _ = try await post("/api/e-marqet/leads", payload: payload)
    }

    private func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem] = []) async throws -> T {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        let (data, response) = try await URLSession.shared.data(from: components.url!)
        try validate(response)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func post(_ path: String, payload: [String: Any]) async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        return data
    }

    private func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
}
