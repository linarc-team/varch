# Varch

Varch is an open-source desktop and Android application built with Tauri 2. Its interface is packaged locally; the installed app does not depend on a hosted website.

## Privacy model

- The Windows app bundles the official Tor Expert Bundle and starts the Tor client locally when a network feature is first used. Its SOCKS listener is bound only to loopback; each request uses Tor with a separate SOCKS authentication identity and remote DNS resolution.
- Other native targets use Arti's Tor transport.
- Search results come from DuckDuckGo HTML over that Tor connection.
- On first use, Tor downloads the current network directory before a request can complete. The app gives bootstrap up to three minutes and reports a connection error if the directory cannot be obtained.
- If Tor fails, search, page reading, and weather requests stop. Varch has no direct HTTPS fallback for these requests.
- Search history, open tabs, language selection, and weather results remain in memory for the current session only. Tor keeps its network state on disk so it can reconnect safely; this state does not contain Varch browsing history.
- Varch does not request location permission or persist browsing history. On the packaged Windows app, interactive web pages use a separate WebView only after the embedded Tor service is ready; WebView2 is configured to use Tor's local SOCKS proxy for network requests. Navigation is limited to public HTTPS pages, pop-ups are blocked, and camera and microphone permission requests are denied. Other targets and development sessions continue to use the sanitized text reader.
- The local development server only serves the interface. Network features are disabled there because it has no embedded Tor transport.

This design routes Varch's own requests through Tor. It does not make other applications anonymous, hide information a user submits to a website, or provide a full browser engine with anti-fingerprinting guarantees.

## Development

Install Node.js, Rust, and the platform prerequisites documented by Tauri 2. Then run:

```sh
npm install
npm run app:dev
```

To build the Windows installer:

```sh
npm run app:build
```

To initialize Android packaging once and build an APK:

```sh
npm run android:init
npm run android:build
```

Android builds also need Android Studio, the Android SDK, and a supported JDK. Tauri's current platform setup steps are documented at <https://v2.tauri.app/start/prerequisites/>.

The simple local UI server can be run without installing the Tauri CLI:

```sh
npm run dev
```

That server is for visual development only; it cannot provide Tor transport. The packaged Windows application starts its bundled Tor client on the first request, then routes search, interactive page traffic, and weather through its loopback SOCKS port. If bootstrap fails, page navigation stops before the remote page is loaded. The embedded browser blocks pop-ups and denies camera and microphone permissions.

To check Tor transport and the configured search endpoint from a terminal, run:

```sh
cargo run --release --locked --manifest-path src-tauri/Cargo.toml --example tor-smoke
```

## License

MIT. See [LICENSE](LICENSE).
