#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
ANDROID_HOME="${ANDROID_HOME:-/home/server/android-sdk}"
BUILD_TOOLS="${BUILD_TOOLS:-$ANDROID_HOME/build-tools/35.0.0}"
ANDROID_JAR="${ANDROID_JAR:-$ANDROID_HOME/platforms/android-35/android.jar}"
BUILD_DIR="$ROOT/build"
OUT_DIR="$REPO_ROOT/public/mobile/emarqet"
VERSION_NAME="0.1.12"
VERSION_CODE="13"
APK_NAME="emarqet-native-debug-${VERSION_NAME}.apk"
KEYSTORE="$ROOT/emarqet-debug.keystore"
KEY_ALIAS="emarqet"
KEY_PASS="emarqet2026"

if [[ ! -f "$ANDROID_JAR" ]]; then
  echo "Nu gasesc Android platform jar: $ANDROID_JAR" >&2
  exit 1
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/classes" "$BUILD_DIR/generated" "$BUILD_DIR/dex" "$OUT_DIR"

"$BUILD_TOOLS/aapt2" compile --dir "$ROOT/res" -o "$BUILD_DIR/resources.zip"
"$BUILD_TOOLS/aapt2" link \
  -o "$BUILD_DIR/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$ROOT/AndroidManifest.xml" \
  --java "$BUILD_DIR/generated" \
  --min-sdk-version 23 \
  --target-sdk-version 35 \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  "$BUILD_DIR/resources.zip"

find "$ROOT/src" "$BUILD_DIR/generated" -name '*.java' > "$BUILD_DIR/sources.txt"
javac -source 8 -target 8 -encoding UTF-8 -classpath "$ANDROID_JAR" -d "$BUILD_DIR/classes" @"$BUILD_DIR/sources.txt"

find "$BUILD_DIR/classes" -name '*.class' > "$BUILD_DIR/classes.txt"
"$BUILD_TOOLS/d8" --min-api 23 --lib "$ANDROID_JAR" --output "$BUILD_DIR/dex" @"$BUILD_DIR/classes.txt"

cp "$BUILD_DIR/base.apk" "$BUILD_DIR/app-unsigned.apk"
"${JAVA_HOME:-/home/server/.local/android-build/jdk}/bin/jar" uf "$BUILD_DIR/app-unsigned.apk" -C "$BUILD_DIR/dex" classes.dex

if [[ ! -f "$KEYSTORE" ]]; then
  keytool -genkeypair \
    -keystore "$KEYSTORE" \
    -storepass "$KEY_PASS" \
    -keypass "$KEY_PASS" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=e-Marqet, OU=Mobile, O=A&A Fast IT Solutions, L=Bucuresti, ST=Bucuresti, C=RO"
fi

"$BUILD_TOOLS/zipalign" -f 4 "$BUILD_DIR/app-unsigned.apk" "$BUILD_DIR/app-aligned.apk"
"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$KEY_PASS" \
  --key-pass "pass:$KEY_PASS" \
  --v4-signing-enabled false \
  --out "$OUT_DIR/$APK_NAME" \
  "$BUILD_DIR/app-aligned.apk"

"$BUILD_TOOLS/apksigner" verify --verbose "$OUT_DIR/$APK_NAME"
cp "$OUT_DIR/$APK_NAME" "$OUT_DIR/emarqet-native-latest.apk"
cp "$OUT_DIR/$APK_NAME" "$OUT_DIR/emarqet-android-${VERSION_NAME}.apk"
cp "$OUT_DIR/$APK_NAME" "$OUT_DIR/emarqet-android-latest.apk"
cat > "$OUT_DIR/update.json" <<JSON
{
  "platform": "android",
  "package": "ro.emarqet.app",
  "version_code": $VERSION_CODE,
  "version_name": "$VERSION_NAME",
  "apk_url": "https://e-marqet.com/mobile/emarqet/emarqet-android-${VERSION_NAME}.apk",
  "notes": "e-Marqet Android: categoriile sunt ascunse implicit si pot fi afisate sau ascunse de utilizator."
}
JSON

echo "APK: $OUT_DIR/$APK_NAME"
echo "Latest: $OUT_DIR/emarqet-native-latest.apk"
echo "Android latest: $OUT_DIR/emarqet-android-latest.apk"
