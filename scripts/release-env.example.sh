# Notarization credentials for signing the macOS release.
#
# These are SECRET. Copy this file to scripts/release-env.sh (git-ignored),
# fill in your real values, then `source` it before building:
#
#   cp scripts/release-env.example.sh scripts/release-env.sh
#   # edit scripts/release-env.sh
#   source scripts/release-env.sh
#   npm run build:mac
#
# Get an App Store Connect API key at:
#   https://appstoreconnect.apple.com/access/integrations/api
# Download the .p8 key file ONCE and store it OUTSIDE this repo
# (e.g. ~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8).
# Code signing itself needs no secrets here: electron-builder auto-discovers
# the "Developer ID Application" certificate from your macOS keychain.

# Absolute path to your App Store Connect API key (.p8 file).
export APPLE_API_KEY="$HOME/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8"

# The Key ID (the XXXXXXXXXX part of the filename / shown in App Store Connect).
export APPLE_API_KEY_ID="XXXXXXXXXX"

# The Issuer ID (UUID shown at the top of the Keys page in App Store Connect).
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
