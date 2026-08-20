# e-Marqet iOS

Proiect SwiftUI pentru aplicația iOS e-Marqet.

Important:

- Un `.ipa` instalabil pe iPhone nu poate fi generat corect pe server Linux.
- Pentru teste reale pe iPhone avem nevoie de Apple Developer Program și TestFlight sau de un Mac cu Xcode și semnare Apple.
- Update automat pe iOS se face prin TestFlight/App Store. iOS nu acceptă update automat dintr-un link extern ca Android APK.

Pași când avem contul Apple:

1. Creezi App ID / Bundle ID: `ro.emarqet.app`.
2. Deschizi proiectul în Xcode sau generezi proiectul din `project.yml` cu XcodeGen.
3. Setezi Team-ul Apple Developer.
4. Archive -> Distribute App -> TestFlight.

Endpointuri folosite:

- `https://e-marqet.com/api/e-marqet/config`
- `https://e-marqet.com/api/e-marqet/listings`
- `https://e-marqet.com/api/e-marqet/leads`
