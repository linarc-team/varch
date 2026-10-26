#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use scraper::{Html, Selector};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
#[cfg(all(windows, not(debug_assertions)))]
use tauri::{LogicalPosition, LogicalSize};
use url::Url;
use varch::tor;

const MAX_QUERY_LENGTH: usize = 300;
const MAX_RESULTS: usize = 10;
const MAX_RESPONSE_BYTES: u64 = 2_000_000;
const SEARCH_ENDPOINT: &str = "https://html.duckduckgo.com/html/";
const WEATHER_HOSTS: [&str; 2] = ["geocoding-api.open-meteo.com", "api.open-meteo.com"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchResponse {
    provider: String,
    via_tor: bool,
    results: Vec<SearchResult>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PageResponse {
    url: String,
    title: String,
    content: String,
}

fn selector(value: &str) -> Result<Selector, String> {
    Selector::parse(value).map_err(|_| "Search response could not be parsed.".to_string())
}

fn extract_results(html: &str) -> Result<Vec<SearchResult>, String> {
    let document = Html::parse_document(html);
    let title_selector = selector("a.result__a")?;
    let snippet_selector = selector("a.result__snippet")?;
    let snippets: Vec<String> = document
        .select(&snippet_selector)
        .map(|element| {
            element
                .text()
                .collect::<Vec<_>>()
                .join("")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect();
    let mut results = Vec::new();
    for (index, element) in document
        .select(&title_selector)
        .take(MAX_RESULTS)
        .enumerate()
    {
        let Some(raw_url) = element.value().attr("href") else {
            continue;
        };
        let Ok(base_url) = Url::parse(SEARCH_ENDPOINT) else {
            continue;
        };
        let Ok(mut parsed) = base_url.join(raw_url) else {
            continue;
        };
        if parsed.path() == "/l/" {
            let destination = parsed
                .query_pairs()
                .find(|(key, _)| key == "uddg")
                .map(|(_, value)| value.into_owned());
            let Some(destination) = destination else {
                continue;
            };
            let Ok(unwrapped) = Url::parse(&destination) else {
                continue;
            };
            parsed = unwrapped;
        }
        if parsed.scheme() != "https" || parsed.host_str().is_none() {
            continue;
        }
        let title = element
            .text()
            .collect::<Vec<_>>()
            .join("")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if title.is_empty() {
            continue;
        }
        results.push(SearchResult {
            title,
            url: parsed.to_string(),
            snippet: snippets.get(index).cloned().unwrap_or_default(),
        });
    }
    Ok(results)
}

fn query_url(query: &str) -> Result<String, String> {
    let mut url =
        Url::parse(SEARCH_ENDPOINT).map_err(|_| "Invalid search endpoint.".to_string())?;
    url.query_pairs_mut().append_pair("q", query);
    Ok(url.to_string())
}

async fn tor_agent(app: &AppHandle, service: &tor::TorService) -> Result<ureq::Agent, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Varch could not prepare Tor's local data directory.".to_string())?;
    service.agent(&data_dir).await
}

fn fetch_search(agent: &ureq::Agent, query: &str) -> Result<Vec<SearchResult>, String> {
    let url = query_url(query)?;
    let mut response = agent
        .get(&url)
        .header("user-agent", "Mozilla/5.0")
        .call()
        .map_err(|error| match error {
            ureq::Error::StatusCode(status) => {
                format!("DuckDuckGo returned HTTP {status} through Tor.")
            }
            ureq::Error::Timeout(_) => {
                "The Tor circuit timed out before DuckDuckGo responded.".to_string()
            }
            ureq::Error::ConnectionFailed => {
                "Tor could not establish a circuit to DuckDuckGo.".to_string()
            }
            ureq::Error::HostNotFound => {
                "The Tor circuit could not resolve DuckDuckGo's hostname.".to_string()
            }
            _ => format!("The Tor HTTPS request failed: {error}"),
        })?;
    let html = response
        .body_mut()
        .with_config()
        .limit(MAX_RESPONSE_BYTES)
        .read_to_string()
        .map_err(|_| "The search response was too large or invalid.".to_string())?;
    extract_results(&html)
}

fn validate_page_url(value: &str) -> Result<Url, String> {
    let mut url = Url::parse(value).map_err(|_| "Enter a valid HTTPS address.".to_string())?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only public HTTPS pages can be opened in Varch reader mode.".to_string());
    }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || host.parse::<std::net::IpAddr>().is_ok()
    {
        return Err("Local and direct-IP addresses are blocked.".to_string());
    }
    let tracking = [
        "fbclid", "gclid", "dclid", "msclkid", "igshid", "mc_cid", "mc_eid", "ref", "source",
    ];
    let kept: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(key, _)| {
            let key = key.to_ascii_lowercase();
            !key.starts_with("utm_") && !tracking.contains(&key.as_str())
        })
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    url.set_query(None);
    if !kept.is_empty() {
        url.query_pairs_mut().extend_pairs(kept);
    }
    Ok(url)
}

fn fetch_page(agent: &ureq::Agent, value: &str) -> Result<PageResponse, String> {
    let url = validate_page_url(value)?;
    let mut response = agent
        .get(url.as_str())
        .header("user-agent", "Mozilla/5.0")
        .call()
        .map_err(|_| "The page could not be loaded through Tor.".to_string())?;
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if !content_type.to_ascii_lowercase().contains("text/html") {
        return Err("Varch reader mode only displays HTML text pages.".to_string());
    }
    let html = response
        .body_mut()
        .with_config()
        .limit(MAX_RESPONSE_BYTES)
        .read_to_string()
        .map_err(|_| "The page is too large or invalid.".to_string())?;
    let cleaned = ammonia::clean(&html);
    let document = Html::parse_document(&cleaned);
    let title_selector = selector("title")?;
    let body_selector = selector("body")?;
    let title = document
        .select(&title_selector)
        .next()
        .map(|node| node.text().collect::<Vec<_>>().join(""))
        .unwrap_or_default()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let content = document
        .select(&body_selector)
        .next()
        .map(|node| node.text().collect::<Vec<_>>().join(" "))
        .unwrap_or_default()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if content.is_empty() {
        return Err("The page has no readable text.".to_string());
    }
    Ok(PageResponse {
        url: url.to_string(),
        title,
        content,
    })
}

#[tauri::command]
async fn tor_search(
    app: AppHandle,
    service: State<'_, tor::TorService>,
    query: String,
) -> Result<SearchResponse, String> {
    let query = query
        .trim()
        .chars()
        .take(MAX_QUERY_LENGTH)
        .collect::<String>();
    if query.is_empty() {
        return Err("Enter a search query.".to_string());
    }
    let mut last_block = None;
    for attempt in 0..3 {
        let agent = tor_agent(&app, &service).await?;
        let query = query.clone();
        let result = tauri::async_runtime::spawn_blocking(move || fetch_search(&agent, &query))
            .await
            .map_err(|_| "Tor search stopped unexpectedly.".to_string())?;
        match result {
            Ok(results) => {
                return Ok(SearchResponse {
                    provider: "DuckDuckGo over Tor".to_string(),
                    via_tor: true,
                    results,
                });
            }
            Err(error) if error.contains("HTTP 403") && attempt < 2 => last_block = Some(error),
            Err(error) => return Err(error),
        }
    }
    Err(last_block.unwrap_or_else(|| "DuckDuckGo rejected the Tor request.".to_string()))
}

#[tauri::command]
async fn tor_open_page(
    app: AppHandle,
    service: State<'_, tor::TorService>,
    url: String,
) -> Result<PageResponse, String> {
    let url = validate_page_url(&url)?;
    let agent = tor_agent(&app, &service).await?;
    tauri::async_runtime::spawn_blocking(move || fetch_page(&agent, url.as_str()))
        .await
        .map_err(|_| "Tor page request stopped unexpectedly.".to_string())?
}

#[tauri::command]
fn tor_browser_javascript_enabled() -> bool {
    cfg!(all(windows, not(debug_assertions)))
}

#[tauri::command]
async fn tor_open_interactive_page(
    app: AppHandle,
    service: State<'_, tor::TorService>,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<String, String> {
    #[cfg(all(windows, not(debug_assertions)))]
    {
        let url = validate_page_url(&url)?;
        let _agent = tor_agent(&app, &service).await?;
        let x = finite_bound(x, 0.0, 4000.0);
        let y = finite_bound(y, 0.0, 4000.0);
        let width = finite_bound(width, 100.0, 6000.0);
        let height = finite_bound(height, 100.0, 6000.0);
        if let Some(browser) = app.get_webview("browser-page") {
            browser
                .set_position(LogicalPosition::new(x, y))
                .map_err(|_| "The browser page could not be positioned.".to_string())?;
            browser
                .set_size(LogicalSize::new(width, height))
                .map_err(|_| "The browser page could not be resized.".to_string())?;
            if browser.url().ok().as_ref() != Some(&url) {
                browser
                    .navigate(url.clone())
                    .map_err(|_| "The browser page could not be opened.".to_string())?;
            }
            browser
                .show()
                .map_err(|_| "The browser page could not be shown.".to_string())?;
        } else {
            let window = app
                .get_window("main")
                .ok_or_else(|| "The Varch window is unavailable.".to_string())?;
            let page = tauri::webview::WebviewBuilder::new(
                "browser-page",
                tauri::WebviewUrl::External(url.clone()),
            )
            .on_navigation(|url| validate_page_url(url.as_str()).is_ok())
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
            .on_permission_request(|_, permission| match permission {
                tauri::webview::PermissionKind::Camera
                | tauri::webview::PermissionKind::Microphone
                | tauri::webview::PermissionKind::Geolocation => {
                    tauri::webview::PermissionResponse::Deny
                }
                _ => tauri::webview::PermissionResponse::Default,
            });
            window
                .add_child(
                    page,
                    LogicalPosition::new(x, y),
                    LogicalSize::new(width, height),
                )
                .map_err(|_| "The interactive browser page could not be created.".to_string())?;
        }
        Ok(url.to_string())
    }
    #[cfg(not(all(windows, not(debug_assertions))))]
    {
        let _ = (app, service, url, x, y, width, height);
        Err("Interactive pages are available in the packaged Windows app.".to_string())
    }
}

#[cfg(all(windows, not(debug_assertions)))]
fn finite_bound(value: f64, min: f64, max: f64) -> f64 {
    if value.is_finite() {
        value.clamp(min, max)
    } else {
        min
    }
}

#[tauri::command]
fn tor_browser_set_bounds(app: AppHandle, x: f64, y: f64, width: f64, height: f64) {
    #[cfg(all(windows, not(debug_assertions)))]
    if let Some(browser) = app.get_webview("browser-page") {
        let _ = browser.set_position(LogicalPosition::new(
            finite_bound(x, 0.0, 4000.0),
            finite_bound(y, 0.0, 4000.0),
        ));
        let _ = browser.set_size(LogicalSize::new(
            finite_bound(width, 100.0, 6000.0),
            finite_bound(height, 100.0, 6000.0),
        ));
    }
    #[cfg(not(all(windows, not(debug_assertions))))]
    let _ = (app, x, y, width, height);
}

#[tauri::command]
fn tor_browser_hide(app: AppHandle) {
    #[cfg(all(windows, not(debug_assertions)))]
    if let Some(browser) = app.get_webview("browser-page") {
        let _ = browser.hide();
    }
    #[cfg(not(all(windows, not(debug_assertions))))]
    let _ = app;
}

#[tauri::command]
fn tor_browser_control(app: AppHandle, action: String) -> Result<(), String> {
    #[cfg(all(windows, not(debug_assertions)))]
    {
        let script = match action.as_str() {
            "back" => "history.back()",
            "forward" => "history.forward()",
            "reload" => "location.reload()",
            _ => return Err("Unsupported browser action.".to_string()),
        };
        if let Some(browser) = app.get_webview("browser-page") {
            browser
                .eval(script)
                .map_err(|_| "The browser action could not be completed.".to_string())?;
        }
        Ok(())
    }
    #[cfg(not(all(windows, not(debug_assertions))))]
    {
        let _ = (app, action);
        Err("Interactive pages are available in the packaged Windows app.".to_string())
    }
}

#[tauri::command]
async fn tor_fetch_json(
    app: AppHandle,
    service: State<'_, tor::TorService>,
    url: String,
) -> Result<serde_json::Value, String> {
    let parsed = Url::parse(&url).map_err(|_| "Invalid weather URL.".to_string())?;
    if parsed.scheme() != "https" || !WEATHER_HOSTS.contains(&parsed.host_str().unwrap_or_default())
    {
        return Err("Only the approved weather services are available.".to_string());
    }
    let agent = tor_agent(&app, &service).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut response = agent
            .get(parsed.as_str())
            .call()
            .map_err(|_| "Tor weather request failed.".to_string())?;
        let body = response
            .body_mut()
            .with_config()
            .limit(1_000_000)
            .read_to_string()
            .map_err(|_| "Weather response was invalid.".to_string())?;
        serde_json::from_str(&body).map_err(|_| "Weather response was not valid JSON.".to_string())
    })
    .await
    .map_err(|_| "Weather request stopped unexpectedly.".to_string())?
}

fn main() {
    let tor_service = tor::TorService::default();
    #[cfg(all(windows, not(debug_assertions)))]
    {
        let proxy_port = tor_service.browser_proxy_port();
        let proxy_args = format!(
            "--proxy-server=socks5://127.0.0.1:{proxy_port} --proxy-bypass-list=<-loopback>;tauri.localhost;ipc.localhost --force-webrtc-ip-handling-policy=disable_non_proxied_udp --disable-quic"
        );
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", proxy_args);
    }
    let app = tauri::Builder::default()
        .manage(tor_service)
        .on_permission_request(|_, permission| match permission {
            tauri::webview::PermissionKind::Camera
            | tauri::webview::PermissionKind::Microphone
            | tauri::webview::PermissionKind::Geolocation => {
                tauri::webview::PermissionResponse::Deny
            }
            _ => tauri::webview::PermissionResponse::Default,
        })
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let Ok(data_dir) = handle.path().app_local_data_dir() else {
                    return;
                };
                let service = handle.state::<tor::TorService>();
                let _ = service.agent(&data_dir).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tor_search,
            tor_open_page,
            tor_browser_javascript_enabled,
            tor_open_interactive_page,
            tor_browser_set_bounds,
            tor_browser_hide,
            tor_browser_control,
            tor_fetch_json
        ])
        .build(tauri::generate_context!())
        .expect("Varch could not start");
    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            handle.state::<tor::TorService>().shutdown();
        }
    });
}
