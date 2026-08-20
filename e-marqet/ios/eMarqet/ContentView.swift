import SwiftUI

struct ContentView: View {
    @StateObject private var store = EMarqetStore()
    @State private var query = ""
    @State private var selectedVertical = ""
    @State private var selectedBrand = ""
    @State private var selectedModel = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                filters
                if store.isLoading {
                    ProgressView("Se incarca...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(store.listings) { listing in
                        NavigationLink(value: listing) {
                            ListingRow(listing: listing)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("e-Marqet")
            .navigationDestination(for: Listing.self) { listing in
                ListingDetail(listing: listing, store: store)
            }
            .task {
                await store.loadConfig()
                await store.loadListings()
            }
        }
    }

    private var filters: some View {
        VStack(spacing: 8) {
            TextField("Cauta anunt, oras, marca sau serviciu", text: $query)
                .textFieldStyle(.roundedBorder)
                .submitLabel(.search)
                .onSubmit { Task { await refresh() } }

            Picker("Categorie", selection: $selectedVertical) {
                Text("Toate categoriile").tag("")
                ForEach(store.verticals) { vertical in
                    Text(vertical.name).tag(vertical.code)
                }
            }
            .pickerStyle(.menu)

            if selectedVertical == "auto" {
                Picker("Marca", selection: $selectedBrand) {
                    Text("Toate marcile").tag("")
                    ForEach(store.brandModels.keys.sorted(), id: \.self) { brand in
                        Text(brand).tag(brand)
                    }
                }
                .pickerStyle(.menu)

                Picker("Model", selection: $selectedModel) {
                    Text("Toate modelele").tag("")
                    ForEach(store.brandModels[selectedBrand] ?? [], id: \.self) { model in
                        Text(model).tag(model)
                    }
                }
                .pickerStyle(.menu)
            }

            Button("Cauta") {
                Task { await refresh() }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .background(Color(red: 0.94, green: 0.98, blue: 1))
    }

    private func refresh() async {
        if selectedVertical != "auto" {
            selectedBrand = ""
            selectedModel = ""
        }
        await store.loadListings(query: query, vertical: selectedVertical, brand: selectedBrand, model: selectedModel)
    }
}

struct ListingRow: View {
    let listing: Listing

    var body: some View {
        HStack(spacing: 12) {
            AsyncImage(url: listing.primaryImageUrl) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Color(red: 0.88, green: 0.96, blue: 1)
            }
            .frame(width: 96, height: 76)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 4) {
                Text(listing.title).font(.headline).lineLimit(2)
                Text(listing.priceText).font(.subheadline).bold().foregroundStyle(.blue)
                Text(listing.location ?? "").font(.caption).foregroundStyle(.secondary)
                Text(listing.vertical?.name ?? "").font(.caption).foregroundStyle(.blue)
            }
        }
    }
}

struct ListingDetail: View {
    let listing: Listing
    @ObservedObject var store: EMarqetStore
    @State private var showContact = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                TabView {
                    ForEach(listing.imageUrls, id: \.self) { url in
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Color(red: 0.88, green: 0.96, blue: 1)
                        }
                    }
                }
                .frame(height: 300)
                .tabViewStyle(.page)

                Text(listing.title).font(.title2).bold()
                Text(listing.priceText).font(.title3).bold().foregroundStyle(.blue)
                Text(listing.location ?? "").foregroundStyle(.secondary)

                if let description = listing.description, !description.isEmpty {
                    Text("Descriere").font(.headline)
                    Text(description)
                }

                Text("Detalii").font(.headline)
                ForEach(listing.metadata.keys.sorted(), id: \.self) { key in
                    if let value = listing.metadata[key]?.description, !value.isEmpty {
                        Text("\(key.replacingOccurrences(of: "_", with: " ").capitalized): \(value)")
                            .font(.subheadline)
                    }
                }

                Button("Trimite mesaj") {
                    showContact = true
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
        }
        .navigationTitle(listing.vertical?.name ?? "Anunt")
        .sheet(isPresented: $showContact) {
            ContactSheet(listing: listing, store: store)
        }
    }
}

struct ContactSheet: View {
    let listing: Listing
    @ObservedObject var store: EMarqetStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var message = "Vreau detalii despre acest anunt."

    var body: some View {
        NavigationStack {
            Form {
                TextField("Nume", text: $name)
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                TextField("Telefon", text: $phone)
                    .keyboardType(.phonePad)
                TextEditor(text: $message).frame(minHeight: 120)
            }
            .navigationTitle("Contact")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Renunta") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Trimite") {
                        Task {
                            try? await store.sendLead(listing: listing, name: name, email: email, phone: phone, message: message)
                            dismiss()
                        }
                    }
                }
            }
        }
    }
}
