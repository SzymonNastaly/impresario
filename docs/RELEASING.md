# Releasing (CI multi-platform builds)

`.github/workflows/release.yml` builds Windows, Linux and macOS artifacts on
their native runners and attaches them to a GitHub Release.

## Cutting a release

```bash
git tag v1.0.1
git push origin v1.0.1
```

The workflow runs three jobs in parallel (one per OS) and uploads:

- macOS: `*.dmg` (signed + notarized)
- Windows: `*-setup.exe` (NSIS installer, currently **unsigned**)
- Linux: `*.AppImage`, `*.deb` (snap is skipped in CI — it needs snapcraft+lxd)

## Required GitHub secrets

Add these under **Settings → Secrets and variables → Actions**.

### macOS notarization (App Store Connect API key)

| Secret | Value |
| --- | --- |
| `APPLE_API_KEY_BASE64` | The `.p8` key file, base64-encoded |
| `APPLE_API_KEY_ID` | The Key ID (the `XXXXXXXXXX` in the filename) |
| `APPLE_API_ISSUER` | The Issuer ID (UUID on the Keys page) |

Generate the base64 of the `.p8`:

```bash
base64 -i ~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8 | pbcopy
```

### macOS code signing (Developer ID certificate)

Locally electron-builder reads your "Developer ID Application" cert from the
macOS keychain. CI has no keychain, so export it once as a `.p12`:

1. Open **Keychain Access** → find **Developer ID Application: Your Name (TEAMID)**.
2. Right-click → **Export** → save as `cert.p12`, set a password.
3. Base64 it and copy to a secret:

   ```bash
   base64 -i cert.p12 | pbcopy
   ```

| Secret | Value |
| --- | --- |
| `MAC_CSC_LINK` | The `.p12`, base64-encoded |
| `MAC_CSC_KEY_PASSWORD` | The password you set when exporting |

> Tip: the export must include the **private key** (expand the cert in Keychain
> Access — there should be a key item nested under it before you export).

### Windows (optional, not yet configured)

The Windows installer is currently unsigned, so SmartScreen will warn until the
app builds reputation. To sign, buy a code-signing certificate, then add
`WIN_CSC_LINK` (base64 `.pfx`) + `WIN_CSC_KEY_PASSWORD` secrets and wire them
into the workflow's `Build and package` env as `CSC_LINK` / `CSC_KEY_PASSWORD`
on the Windows job.
