use std::{path::Path, time::Duration};

#[cfg(not(windows))]
use std::sync::OnceLock;

#[cfg(not(windows))]
use arti_ureq::{
    arti_client::{config::TorClientConfig, TorClient},
    Connector,
};

#[cfg(windows)]
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{BufRead, BufReader, Cursor},
    net::TcpListener,
    process::{Child, Command, Stdio},
    sync::Mutex as StdMutex,
    thread,
};

#[cfg(windows)]
use flate2::read::GzDecoder;
#[cfg(windows)]
use sha2::{Digest, Sha256};
#[cfg(windows)]
use tar::Archive;
#[cfg(windows)]
use tokio::sync::{mpsc, Mutex};

const TOR_BOOTSTRAP_TIMEOUT: Duration = Duration::from_secs(180);

#[cfg(windows)]
const TOR_EXPERT_BUNDLE: &[u8] =
    include_bytes!("../resources/tor/tor-expert-bundle-windows-x86_64-15.0.26.tar.gz");

#[cfg(windows)]
const TOR_EXPERT_BUNDLE_SHA256: &str =
    "c1988c701de2f24f7d098d1d6d7f507b58f27740d097f29c246e0524d639b252";

#[cfg(windows)]
const TOR_FILES: [&str; 9] = [
    "tor/tor.exe",
    "data/geoip",
    "data/geoip6",
    "docs/conjure.txt",
    "docs/libevent.txt",
    "docs/lyrebird.txt",
    "docs/openssl.txt",
    "docs/tor.txt",
    "docs/zlib.txt",
];

#[cfg(windows)]
pub struct TorService {
    startup: Mutex<()>,
    process: StdMutex<Option<TorProcess>>,
    browser_socks_port: u16,
}

#[cfg(not(windows))]
#[derive(Default)]
pub struct TorService;

#[cfg(windows)]
struct TorProcess {
    child: Child,
    socks_port: u16,
}

#[cfg(windows)]
enum BootstrapEvent {
    Progress(u8),
    Failed,
    Stopped,
}

impl TorService {
    pub async fn agent(&self, data_dir: &Path) -> Result<ureq::Agent, String> {
        #[cfg(windows)]
        {
            let port = self.ensure_tor(data_dir).await?;
            socks_agent(port)
        }

        #[cfg(not(windows))]
        {
            let _ = data_dir;
            arti_agent().await
        }
    }

    pub fn shutdown(&self) {
        #[cfg(windows)]
        if let Ok(mut process) = self.process.lock() {
            if let Some(mut process) = process.take() {
                let _ = process.child.kill();
                let _ = process.child.wait();
            }
        }
    }

    #[cfg(windows)]
    pub fn browser_proxy_port(&self) -> u16 {
        self.browser_socks_port
    }
}

#[cfg(windows)]
impl Default for TorService {
    fn default() -> Self {
        let browser_socks_port = TcpListener::bind(("127.0.0.1", 0))
            .and_then(|listener| listener.local_addr())
            .map(|address| address.port())
            .unwrap_or(0);
        Self {
            startup: Mutex::default(),
            process: StdMutex::default(),
            browser_socks_port,
        }
    }
}

#[cfg(windows)]
impl Drop for TorService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(windows)]
impl TorService {
    async fn ensure_tor(&self, data_dir: &Path) -> Result<u16, String> {
        if let Some(port) = self.running_port() {
            return Ok(port);
        }

        let _startup = self.startup.lock().await;
        if let Some(port) = self.running_port() {
            return Ok(port);
        }

        let port = self.browser_socks_port;
        if port == 0 {
            return Err("A local Tor browser connection could not be prepared.".to_string());
        }
        let (child, mut events) = start_tor(data_dir, port)?;
        {
            let mut process = self
                .process
                .lock()
                .map_err(|_| "Tor process state is unavailable.".to_string())?;
            *process = Some(TorProcess {
                child,
                socks_port: port,
            });
        }

        let bootstrap = tokio::time::timeout(TOR_BOOTSTRAP_TIMEOUT, async {
            loop {
                match events.recv().await {
                    Some(BootstrapEvent::Progress(100)) => return Ok(()),
                    Some(BootstrapEvent::Progress(_)) => {}
                    Some(BootstrapEvent::Failed | BootstrapEvent::Stopped) | None => {
                        return Err("The Tor service stopped before it connected.".to_string());
                    }
                }
            }
        })
        .await;

        match bootstrap {
            Ok(Ok(())) => Ok(port),
            Ok(Err(error)) => {
                self.shutdown();
                Err(error)
            }
            Err(_) => {
                self.shutdown();
                Err("Tor could not finish connecting to its network within three minutes. The request was not sent.".to_string())
            }
        }
    }

    fn running_port(&self) -> Option<u16> {
        let mut process = self.process.lock().ok()?;
        let running = process.as_mut()?;
        match running.child.try_wait() {
            Ok(None) => Some(running.socks_port),
            Ok(Some(_)) | Err(_) => {
                if let Some(mut stopped) = process.take() {
                    let _ = stopped.child.wait();
                }
                None
            }
        }
    }
}

#[cfg(windows)]
fn socks_agent(port: u16) -> Result<ureq::Agent, String> {
    let username = format!("varch-{}", uuid::Uuid::new_v4().simple());
    let password = uuid::Uuid::new_v4().simple().to_string();
    let proxy = ureq::Proxy::builder(ureq::ProxyProtocol::Socks5)
        .host("127.0.0.1")
        .port(port)
        .username(&username)
        .password(&password)
        .resolve_target(false)
        .build()
        .map_err(|_| "The local Tor connection could not be configured.".to_string())?;

    Ok(ureq::Agent::config_builder()
        .https_only(true)
        .proxy(Some(proxy))
        .max_redirects(4)
        .timeout_global(Some(Duration::from_secs(60)))
        .build()
        .into())
}

#[cfg(not(windows))]
async fn arti_agent() -> Result<ureq::Agent, String> {
    static AGENT: OnceLock<tokio::sync::Mutex<Option<ureq::Agent>>> = OnceLock::new();
    let slot = AGENT.get_or_init(|| tokio::sync::Mutex::new(None));
    let mut cached = slot.lock().await;
    if let Some(agent) = cached.as_ref() {
        return Ok(agent.clone());
    }

    let client = tokio::time::timeout(
        TOR_BOOTSTRAP_TIMEOUT,
        TorClient::create_bootstrapped(TorClientConfig::default()),
    )
    .await
    .map_err(|_| {
        "Tor could not finish connecting to its network within three minutes. The request was not sent."
            .to_string()
    })?
    .map_err(|error| format!("Tor could not connect: {error}"))?;
    let connector = Connector::with_tor_client(client);
    let config = ureq::Agent::config_builder()
        .https_only(true)
        .max_redirects(4)
        .timeout_global(Some(Duration::from_secs(60)))
        .build();
    let agent = connector
        .agent_with_ureq_config(config)
        .map_err(|error| format!("Tor HTTPS transport could not start: {error}"))?;
    *cached = Some(agent.clone());
    Ok(agent)
}

#[cfg(windows)]
fn start_tor(
    data_dir: &Path,
    port: u16,
) -> Result<(Child, mpsc::UnboundedReceiver<BootstrapEvent>), String> {
    let runtime_dir = data_dir.join("tor-runtime").join("0.4.9.14");
    let files = extract_tor_bundle(&runtime_dir)?;
    let state_dir = data_dir.join("tor-state");
    fs::create_dir_all(&state_dir)
        .map_err(|_| "Tor could not prepare its local state directory.".to_string())?;

    let defaults = runtime_dir.join("varch-torrc-defaults");
    let config = state_dir.join("varch-torrc");
    fs::write(&defaults, "AvoidDiskWrites 1\nSafeLogging 1\n")
        .map_err(|_| "Tor configuration could not be prepared.".to_string())?;
    let config_text = format!(
        "DataDirectory \"{}\"\nGeoIPFile \"{}\"\nGeoIPv6File \"{}\"\nSocksPort 127.0.0.1:{port} IsolateSOCKSAuth\nControlPort 0\nLog notice stdout\nSafeLogging 1\nAvoidDiskWrites 1\n",
        torrc_path(&state_dir),
        torrc_path(&files.geoip),
        torrc_path(&files.geoip6),
    );
    fs::write(&config, config_text)
        .map_err(|_| "Tor configuration could not be prepared.".to_string())?;

    let mut command = Command::new(&files.executable);
    command
        .arg("--defaults-torrc")
        .arg(&defaults)
        .arg("--torrc-file")
        .arg(&config)
        .current_dir(&runtime_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    use std::os::windows::process::CommandExt;
    command.creation_flags(0x08000000);

    let mut child = command
        .spawn()
        .map_err(|_| "The integrated Tor service could not be started.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "The integrated Tor service could not be monitored.".to_string())?;
    let (sender, receiver) = mpsc::unbounded_channel();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            if let Some(progress) = tor_progress(&line) {
                let _ = sender.send(BootstrapEvent::Progress(progress));
            } else if line.contains("[err]") {
                let _ = sender.send(BootstrapEvent::Failed);
                break;
            }
        }
        let _ = sender.send(BootstrapEvent::Stopped);
    });

    Ok((child, receiver))
}

#[cfg(windows)]
struct TorFiles {
    executable: std::path::PathBuf,
    geoip: std::path::PathBuf,
    geoip6: std::path::PathBuf,
}

#[cfg(windows)]
fn extract_tor_bundle(runtime_dir: &Path) -> Result<TorFiles, String> {
    let digest = Sha256::digest(TOR_EXPERT_BUNDLE);
    if format!("{digest:x}") != TOR_EXPERT_BUNDLE_SHA256 {
        return Err("The integrated Tor package failed its integrity check.".to_string());
    }

    let tor_dir = runtime_dir.join("tor");
    let data_dir = runtime_dir.join("data");
    let docs_dir = runtime_dir.join("licenses");
    fs::create_dir_all(&tor_dir)
        .and_then(|_| fs::create_dir_all(&data_dir))
        .and_then(|_| fs::create_dir_all(&docs_dir))
        .map_err(|_| "Tor runtime files could not be prepared.".to_string())?;

    let mut archive = Archive::new(GzDecoder::new(Cursor::new(TOR_EXPERT_BUNDLE)));
    let entries = archive
        .entries()
        .map_err(|_| "The integrated Tor package could not be opened.".to_string())?;
    let mut extracted = HashSet::new();

    for entry in entries {
        let mut entry = entry.map_err(|_| "The integrated Tor package is invalid.".to_string())?;
        let source = entry
            .path()
            .map_err(|_| "The integrated Tor package is invalid.".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if !TOR_FILES.contains(&source.as_str()) {
            continue;
        }

        let destination = match source.as_str() {
            "tor/tor.exe" => tor_dir.join("tor.exe"),
            "data/geoip" => data_dir.join("geoip"),
            "data/geoip6" => data_dir.join("geoip6"),
            _ => docs_dir.join(source.trim_start_matches("docs/")),
        };
        let mut output = File::create(&destination)
            .map_err(|_| "Tor runtime files could not be installed.".to_string())?;
        std::io::copy(&mut entry, &mut output)
            .map_err(|_| "Tor runtime files could not be installed.".to_string())?;
        extracted.insert(source);
    }

    if extracted.len() != TOR_FILES.len() {
        return Err("The integrated Tor package is incomplete.".to_string());
    }

    Ok(TorFiles {
        executable: tor_dir.join("tor.exe"),
        geoip: data_dir.join("geoip"),
        geoip6: data_dir.join("geoip6"),
    })
}

#[cfg(windows)]
fn torrc_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace('"', "\\\"")
}

#[cfg(windows)]
fn tor_progress(line: &str) -> Option<u8> {
    let progress = line.split_once("Bootstrapped ")?.1;
    let percentage = progress.split_once('%')?.0;
    percentage.parse().ok()
}
