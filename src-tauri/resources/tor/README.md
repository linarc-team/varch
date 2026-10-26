# Bundled Tor runtime

Varch bundles the Windows x86_64 Tor Expert Bundle 15.0.26 from the official Tor Project distribution archive. The bundle contains Tor 0.4.9.14.

- Official archive: <https://dist.torproject.org/torbrowser/15.0.26/tor-expert-bundle-windows-x86_64-15.0.26.tar.gz>
- SHA-256: `c1988c701de2f24f7d098d1d6d7f507b58f27740d097f29c246e0524d639b252`
- Tor source: <https://gitlab.torproject.org/tpo/core/tor>
- Third-party notices from the bundle are in `licenses/` and are copied to the app's Tor runtime directory when it starts.

The archive is embedded in the Windows executable and checked against the pinned SHA-256 before the Tor files are extracted. Varch starts Tor locally with a loopback-only SOCKS listener and does not configure a direct-connection fallback.
