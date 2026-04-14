use regex::Regex;
use rss::Channel;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TorrentItem {
    pub title: String,
    pub view_url: String,
    pub download_url: String,
    pub magnet: String,
    pub size: String,
    pub date: String,
    pub seeders: u32,
    pub leechers: u32,
    pub downloads: u32,
    pub fansub: String,
    pub resolution: String,
    pub is_hevc: bool,
    pub category: String,
    pub info_hash: String,
}

fn fansub_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\[([^\]]+)\]").unwrap())
}

fn resolution_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\b(2160p|1080p|720p|480p|360p)\b").unwrap())
}

fn extract_fansub(title: &str) -> String {
    fansub_re()
        .captures(title)
        .and_then(|captures| captures.get(1))
        .map(|match_group| match_group.as_str().to_string())
        .unwrap_or_else(|| "Unknown".to_string())
}

fn extract_resolution(title: &str) -> String {
    resolution_re()
        .find(title)
        .map(|match_group| match_group.as_str().to_string())
        .unwrap_or_else(|| "Unknown".to_string())
}

fn check_hevc(title: &str) -> bool {
    let lower = title.to_lowercase();
    lower.contains("hevc") || lower.contains("x265")
}

fn get_extension_value(item: &rss::Item, namespace: &str, field: &str) -> String {
    item.extensions()
        .get(namespace)
        .and_then(|extension| extension.get(field))
        .and_then(|values| values.first())
        .and_then(|value| value.value())
        .unwrap_or("")
        .to_string()
}

fn build_magnet(info_hash: &str, title: &str) -> String {
    if info_hash.is_empty() {
        return String::new();
    }

    format!(
        "magnet:?xt=urn:btih:{}&dn={}",
        info_hash,
        urlencoding::encode(title)
    )
}

async fn fetch_nyaa_inner(
    query: String,
    fansub: String,
    category: String,
) -> Result<Vec<TorrentItem>, String> {
    let mut params = vec![
        "page=rss".to_string(),
        format!("c={}", category),
        "f=0".to_string(),
    ];

    let full_query = if !fansub.is_empty() {
        if query.is_empty() {
            format!("[{}]", fansub)
        } else {
            format!("[{}] {}", fansub, query)
        }
    } else {
        query.clone()
    };

    if !full_query.is_empty() {
        params.push(format!("q={}", urlencoding::encode(&full_query)));
    }

    let url = format!("https://nyaa.si/?{}", params.join("&"));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|error| format!("Error building client: {error}"))?;

    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("Error de conexion con Nyaa: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Nyaa devolvio un estado invalido: {error}"))?
        .bytes()
        .await
        .map_err(|error| format!("Error leyendo respuesta de Nyaa: {error}"))?;

    let channel = match Channel::read_from(&bytes[..]) {
        Ok(channel) => channel,
        Err(_) => return Ok(vec![]),
    };

    let items: Vec<TorrentItem> = channel
        .items()
        .iter()
        .map(|item| {
            let title = item.title().unwrap_or("").to_string();
            let download_url = item.link().unwrap_or("").to_string();
            let view_url = item
                .guid()
                .map(|guid| guid.value().to_string())
                .unwrap_or_else(|| download_url.clone());
            let date = item.pub_date().unwrap_or("").to_string();

            let namespace = "nyaa";
            let info_hash = get_extension_value(item, namespace, "infoHash");
            let size = get_extension_value(item, namespace, "size");
            let seeders = get_extension_value(item, namespace, "seeders")
                .parse::<u32>()
                .unwrap_or(0);
            let leechers = get_extension_value(item, namespace, "leechers")
                .parse::<u32>()
                .unwrap_or(0);
            let downloads = get_extension_value(item, namespace, "downloads")
                .parse::<u32>()
                .unwrap_or(0);
            let category = get_extension_value(item, namespace, "category");

            let magnet = build_magnet(&info_hash, &title);
            let fansub = extract_fansub(&title);
            let resolution = extract_resolution(&title);
            let is_hevc = check_hevc(&title);

            TorrentItem {
                title,
                view_url,
                download_url,
                magnet,
                size,
                date,
                seeders,
                leechers,
                downloads,
                fansub,
                resolution,
                is_hevc,
                category,
                info_hash,
            }
        })
        .collect();

    Ok(items)
}

#[tauri::command]
pub async fn fetch_nyaa(
    query: String,
    fansub: String,
    category: Option<String>,
) -> Result<Vec<TorrentItem>, String> {
    // Default: English-translated (1_2) — mantiene compatibilidad
    let cat = category.unwrap_or_else(|| "1_2".to_string());
    fetch_nyaa_inner(query, fansub, cat).await
}

#[tauri::command]
pub async fn query_anilist(
    query: String,
    variables: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .post("https://graphql.anilist.co/")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "query": query,
            "variables": variables
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;

    if !status.is_success() {
        return Err(format!("AniList HTTP {}: {}", status.as_u16(), body));
    }

    let json: serde_json::Value = serde_json::from_str(&body).map_err(|error| error.to_string())?;

    if let Some(errors) = json.get("errors") {
        let message = errors
            .as_array()
            .and_then(|entries| entries.first())
            .and_then(|entry| entry.get("message"))
            .and_then(|message| message.as_str())
            .unwrap_or("AniList devolvio un error GraphQL.");
        return Err(message.to_string());
    }

    Ok(json)
}
