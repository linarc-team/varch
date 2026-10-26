use scraper::{Html, Selector};
use std::{path::PathBuf, time::Duration};
use varch::tor::TorService;

const SEARCH_URL: &str = "https://html.duckduckgo.com/html/?q=varch+tor+connectivity+test";

fn result_count(agent: &ureq::Agent) -> Result<usize, String> {
    let mut response = agent
        .get(SEARCH_URL)
        .header("user-agent", "Mozilla/5.0")
        .call()
        .map_err(|error| match error {
            ureq::Error::StatusCode(status) => {
                format!("Search provider returned HTTP {status} through Tor.")
            }
            _ => format!("Search request failed through Tor: {error}"),
        })?;
    let html = response
        .body_mut()
        .with_config()
        .limit(2_000_000)
        .read_to_string()
        .map_err(|_| "Search response was too large or invalid.".to_string())?;
    let selector = Selector::parse("a.result__a")
        .map_err(|_| "Search result parser could not be initialized.".to_string())?;
    Ok(Html::parse_document(&html).select(&selector).count())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tauri::async_runtime::block_on(async {
        let data_dir = std::env::var_os("VARCH_TOR_SMOKE_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::temp_dir().join("varch-tor-smoke"));
        let service = TorService::default();
        let check_agent = service
            .agent(&data_dir)
            .await
            .map_err(std::io::Error::other)?;
        let mut check = check_agent
            .get("https://check.torproject.org/api/ip")
            .call()
            .map_err(|error| format!("Tor verification request failed: {error}"))?;
        let check_body = check
            .body_mut()
            .with_config()
            .limit(16_384)
            .read_to_string()?;
        let check: serde_json::Value = serde_json::from_str(&check_body)?;
        if check.get("IsTor").and_then(serde_json::Value::as_bool) != Some(true) {
            return Err("The Tor verification service did not confirm a Tor exit.".into());
        }
        println!("Tor exit verified by check.torproject.org.");

        let mut last_error = None;
        for _ in 0..3 {
            let search_agent = service
                .agent(&data_dir)
                .await
                .map_err(std::io::Error::other)?;
            match result_count(&search_agent) {
                Ok(count) if count > 0 => {
                    println!("DuckDuckGo returned {count} results through Tor.");
                    return Ok(());
                }
                Ok(_) => last_error = Some("No search results were returned.".to_string()),
                Err(error) if error.contains("HTTP 403") => last_error = Some(error),
                Err(error) => return Err(std::io::Error::other(error).into()),
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }

        Err(std::io::Error::other(
            last_error.unwrap_or_else(|| "Tor search did not return results.".to_string()),
        )
        .into())
    })
}
