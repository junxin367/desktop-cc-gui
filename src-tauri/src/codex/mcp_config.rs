use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::path::PathBuf;

use crate::app_paths;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GlobalMcpServerEntry {
    name: String,
    enabled: bool,
    transport: Option<String>,
    command: Option<String>,
    url: Option<String>,
    args_count: usize,
    source: String,
}

fn parse_disabled_mcp_set(root: &Map<String, Value>) -> HashSet<String> {
    root.get("disabledMcpServers")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect::<HashSet<_>>()
        })
        .unwrap_or_default()
}

fn parse_mcp_entries_from_object(
    mcp_servers: &Map<String, Value>,
    disabled_servers: &HashSet<String>,
    source: &str,
) -> Vec<GlobalMcpServerEntry> {
    let mut entries = Vec::new();
    for (name, raw_spec) in mcp_servers {
        let server_name = name.trim();
        if server_name.is_empty() {
            continue;
        }
        let spec = match raw_spec.as_object() {
            Some(value) => value,
            None => continue,
        };
        let transport = spec
            .get("type")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let command = spec
            .get("command")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let url = spec
            .get("url")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let args_count = spec
            .get("args")
            .and_then(|value| value.as_array())
            .map(|items| items.len())
            .unwrap_or(0);
        entries.push(GlobalMcpServerEntry {
            name: server_name.to_string(),
            enabled: !disabled_servers.contains(server_name),
            transport,
            command,
            url,
            args_count,
            source: source.to_string(),
        });
    }
    entries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    entries
}

fn parse_mcp_entries_from_array(mcp_servers: &[Value], source: &str) -> Vec<GlobalMcpServerEntry> {
    let mut entries = Vec::new();
    for raw_item in mcp_servers {
        let item = match raw_item.as_object() {
            Some(value) => value,
            None => continue,
        };
        let name = item
            .get("id")
            .or_else(|| item.get("name"))
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let Some(name) = name else {
            continue;
        };
        let enabled = item
            .get("enabled")
            .and_then(|value| value.as_bool())
            .unwrap_or(true);
        let spec = item
            .get("server")
            .and_then(|value| value.as_object())
            .unwrap_or(item);
        let transport = spec
            .get("type")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let command = spec
            .get("command")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let url = spec
            .get("url")
            .and_then(|value| value.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let args_count = spec
            .get("args")
            .and_then(|value| value.as_array())
            .map(|items| items.len())
            .unwrap_or(0);
        entries.push(GlobalMcpServerEntry {
            name,
            enabled,
            transport,
            command,
            url,
            args_count,
            source: source.to_string(),
        });
    }
    entries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    entries
}

fn parse_mcp_entries_from_json_value(
    root: &Value,
    source: &str,
) -> Result<Vec<GlobalMcpServerEntry>, String> {
    let object = root
        .as_object()
        .ok_or_else(|| "MCP config root is not a JSON object".to_string())?;
    let disabled_servers = parse_disabled_mcp_set(object);
    match object.get("mcpServers") {
        Some(Value::Object(mcp_servers)) => Ok(parse_mcp_entries_from_object(
            mcp_servers,
            &disabled_servers,
            source,
        )),
        Some(Value::Array(mcp_servers)) => Ok(parse_mcp_entries_from_array(mcp_servers, source)),
        Some(_) => Ok(Vec::new()),
        None => Ok(Vec::new()),
    }
}

fn read_json_file(path: &PathBuf) -> Result<Value, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|error| format!("Failed to read {}: {}", path.display(), error))?;
    serde_json::from_str::<Value>(&raw)
        .map_err(|error| format!("Failed to parse {}: {}", path.display(), error))
}

pub(crate) async fn list_global_mcp_servers() -> Result<Vec<GlobalMcpServerEntry>, String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    let claude_json_path = home.join(".claude.json");
    if claude_json_path.exists() {
        match read_json_file(&claude_json_path)
            .and_then(|root| parse_mcp_entries_from_json_value(&root, "claude_json"))
        {
            Ok(entries) if !entries.is_empty() => return Ok(entries),
            Ok(_) => {}
            Err(error) => {
                log::warn!(
                    "[list_global_mcp_servers] Failed to parse {}: {}",
                    claude_json_path.display(),
                    error
                );
            }
        }
    }

    let ccgui_config_path = app_paths::config_file_path()?;
    if ccgui_config_path.exists() {
        match read_json_file(&ccgui_config_path)
            .and_then(|root| parse_mcp_entries_from_json_value(&root, "ccgui_config"))
        {
            Ok(entries) => return Ok(entries),
            Err(error) => {
                log::warn!(
                    "[list_global_mcp_servers] Failed to parse {}: {}",
                    ccgui_config_path.display(),
                    error
                );
            }
        }
    }

    Ok(Vec::new())
}
