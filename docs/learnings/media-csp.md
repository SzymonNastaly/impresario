# `media://` video blocked by CSP

`<video src="media://…">` shows player chrome but `0:00` / won't play, while `<img>` from the same scheme works.

**Cause:** CSP `img-src` allowed `media:` but there was no `media-src`, so video fell back to `default-src 'self'` and was blocked. Images use `img-src`, video/audio use `media-src`.

**Fix:** add `media-src 'self' media:` to the CSP in `src/renderer/index.html`.

Note: stored MP4s have `moov` at the end, so the `media://` handler must support Range/206 for seeking.
