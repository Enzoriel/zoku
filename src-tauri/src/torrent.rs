use futures::future::join_all;
use regex::Regex;
use rss::Channel;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

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

// ─── Funciones auxiliares ─────────────────────────────────────────────────────

fn extract_fansub(title: &str) -> String {
    let re = Regex::new(r"^\[([^\]]+)\]").unwrap();
    re.captures(title)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| "Unknown".to_string())
}

fn extract_resolution(title: &str) -> String {
    let re = Regex::new(r"\b(2160p|1080p|720p|480p|360p)\b").unwrap();
    re.find(title)
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| "Unknown".to_string())
}

fn check_hevc(title: &str) -> bool {
    let lower = title.to_lowercase();
    lower.contains("hevc") || lower.contains("x265")
}

fn get_extension_value(item: &rss::Item, ns: &str, field: &str) -> String {
    item.extensions()
        .get(ns)
        .and_then(|ext| ext.get(field))
        .and_then(|vals| vals.first())
        .and_then(|v| v.value())
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

// ─── Lógica interna de fetch ──────────────────────────────────────────────────

async fn fetch_nyaa_inner(query: String, fansub: String) -> Result<Vec<TorrentItem>, String> {
    let mut params = vec!["page=rss".to_string(), "c=1_2".to_string(), "f=0".to_string()];

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
        .map_err(|e| format!("Error building client: {}", e))?;

    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Error de conexión con Nyaa: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("Error leyendo respuesta de Nyaa: {}", e))?;

    let channel = match Channel::read_from(&bytes[..]) {
        Ok(c) => c,
        Err(_) => return Ok(vec![]), // Si Nyaa devuelve algo distinto a RSS (ej. 404), retornamos vacío
    };

    let items: Vec<TorrentItem> = channel
        .items()
        .iter()
        .map(|item| {
            let title = item.title().unwrap_or("").to_string();
            let download_url = item.link().unwrap_or("").to_string();
            let view_url = item
                .guid()
                .map(|g| g.value().to_string())
                .unwrap_or_else(|| download_url.clone());
            let date = item.pub_date().unwrap_or("").to_string();

            let ns = "nyaa";
            let info_hash = get_extension_value(item, ns, "infoHash");
            let size = get_extension_value(item, ns, "size");
            let seeders = get_extension_value(item, ns, "seeders")
                .parse::<u32>()
                .unwrap_or(0);
            let leechers = get_extension_value(item, ns, "leechers")
                .parse::<u32>()
                .unwrap_or(0);
            let downloads = get_extension_value(item, ns, "downloads")
                .parse::<u32>()
                .unwrap_or(0);
            let category = get_extension_value(item, ns, "category");

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

// ─── Comandos Tauri ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn fetch_nyaa(query: String, fansub: String) -> Result<Vec<TorrentItem>, String> {
    fetch_nyaa_inner(query, fansub).await
}


#[tauri::command]
pub async fn query_anilist(query: String, variables: serde_json::Value) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;
        
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
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}
