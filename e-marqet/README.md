# e-Marqet Android

Aplicație Android nativă pentru e-Marqet.

Build local pe server:

```bash
bash e-marqet/android/build.sh
```

APK-ul semnat pentru test se publică în:

```text
public/mobile/emarqet/emarqet-native-latest.apk
```

Endpointuri folosite:

- `https://e-marqet.com/api/e-marqet/config`
- `https://e-marqet.com/api/e-marqet/listings`
- `https://e-marqet.com/api/e-marqet/listings/:slugOrCode`
- `https://e-marqet.com/api/e-marqet/leads`
