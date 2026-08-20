# e-Marqet Mobile Update Strategy

## Android

Pentru test rapid:

- APK public: `https://e-marqet.com/mobile/emarqet/emarqet-native-latest.apk`
- Manifest update: `https://e-marqet.com/mobile/emarqet/update.json`

Limitare Android: aplicația poate verifica `update.json` și poate deschide APK-ul nou, dar Android va cere confirmare utilizatorului pentru instalare. Update complet automat, fără confirmare, se face corect prin Google Play.

Recomandare:

1. Test intern rapid: APK direct + update manifest.
2. Test organizat: Google Play Console, Internal testing.
3. Producție: Google Play closed/open production track.

## iOS

iOS nu permite instalare/update automat din link extern pentru aplicații native. Testarea și update-ul se fac prin:

- TestFlight pentru testeri;
- App Store pentru producție.

Pentru iOS avem nevoie de:

- Apple Developer Program activ;
- Bundle ID: `ro.emarqet.app`;
- acces App Store Connect;
- certificate/provisioning profile sau semnare automată în Xcode.
