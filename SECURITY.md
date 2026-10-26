# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's private vulnerability reporting feature when it is enabled for the repository. If it is unavailable, contact the repository owner through GitHub before publishing details.

Do not include search terms, private browsing data, access tokens, or other personal information in a report unless it is necessary to reproduce the issue.

## Scope

Varch routes native search, text reader, and weather requests through Tor. The packaged Windows app also routes its interactive WebView through the embedded Tor SOCKS service; external navigation is limited to public HTTPS pages. Camera and microphone requests are denied. Other native targets use Arti for native requests, and development sessions use the text reader. The local development server only serves the interface and does not provide Tor transport. A successful build is not a security audit; review the implementation and dependencies before relying on it for sensitive activity.
