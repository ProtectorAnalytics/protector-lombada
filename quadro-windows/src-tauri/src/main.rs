//! Quadro da portaria — casca Windows (Tauri v2).
//!
//! Uma janela pequena, sem moldura e sempre por cima, que carrega a página
//! remota https://lombada.appps.com.br/quadro (o conteúdo se atualiza sozinho
//! por ser do site). A barra, o Fixar e o menu vivem na própria página; aqui
//! só ficam: janela, posição/tamanho lembrados, abrir com o Windows (ligado na
//! primeira vez), instância única e a página local de espera (sem internet
//! no boot, ela tenta de novo até o site responder).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod navegacao;

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

const ROTULO: &str = "quadro";
const TITULO: &str = "Quadro da portaria";
const LARGURA: f64 = 400.0;
const ALTURA: f64 = 280.0;
const LARGURA_MIN: f64 = 320.0;
const ALTURA_MIN: f64 = 220.0;
const MARCA_AUTOSTART: &str = "autostart-configurado";
const SALVAR_A_CADA_MS: u64 = 750;

/// Só posição e tamanho: moldura e "sempre por cima" são fixos do programa.
fn flags_estado() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION
}

/// Endereço de teste (só em build de desenvolvimento, com QUADRO_URL http/https).
fn url_de_teste(valor: Option<&str>) -> Option<url::Url> {
    let bruto = valor?.trim();
    let u = url::Url::parse(bruto).ok()?;
    matches!(u.scheme(), "http" | "https").then_some(u)
}

/// QUADRO_URL só vale em build de desenvolvimento.
fn url_de_teste_ativa() -> Option<url::Url> {
    if !cfg!(debug_assertions) {
        return None;
    }
    url_de_teste(std::env::var("QUADRO_URL").ok().as_deref())
}

/// Página que a janela abre: a de espera (local), que segue para o site.
fn destino() -> WebviewUrl {
    match url_de_teste_ativa() {
        Some(u) => WebviewUrl::External(u),
        None => WebviewUrl::App("index.html".into()),
    }
}

/// A capability de produção com outra lista de páginas (teste local).
fn capability_com_urls(urls: &[String]) -> serde_json::Result<String> {
    let mut cap: serde_json::Value =
        serde_json::from_str(include_str!("../capabilities/quadro-remoto.json"))?;
    cap["identifier"] = serde_json::json!("quadro-teste-local");
    cap["remote"]["urls"] = serde_json::json!(urls);
    serde_json::to_string(&cap)
}

/// Em desenvolvimento, a página de teste (ex.: http://localhost:8787) ganha a
/// mesma permissão mínima que o site tem em produção.
fn capability_de_teste(app: &AppHandle) -> tauri::Result<()> {
    let Some(u) = url_de_teste_ativa() else {
        return Ok(());
    };
    let origem = u.origin().ascii_serialization();
    // Mesma forma da produção: a origem (o IPC é conferido pelo Origin).
    let urls = [format!("{origem}/*")];
    let cap = capability_com_urls(&urls).map_err(|e| tauri::Error::Anyhow(e.into()))?;
    app.add_capability(cap)
}

/// "Abrir com o Windows" vem ligado: só na primeira execução (depois vale a
/// escolha do menu da página).
fn ligar_autostart_na_primeira_vez(app: &AppHandle) {
    // Build de desenvolvimento nunca mexe no início automático da máquina.
    if cfg!(debug_assertions) {
        return;
    }
    let Ok(pasta) = app.path().app_config_dir() else {
        return;
    };
    let marca = pasta.join(MARCA_AUTOSTART);
    if marca.exists() {
        return;
    }
    if app.autolaunch().enable().is_ok() {
        let _ = std::fs::create_dir_all(&pasta);
        let _ = std::fs::write(&marca, b"1");
    }
}

/// Endereço recusado: não abre na janela; https vai ao navegador padrão.
fn desviar_para_o_navegador(app: &AppHandle, u: &url::Url) {
    if navegacao::abrir_no_navegador(u) {
        let _ = app.opener().open_url(u.as_str(), None::<&str>);
    }
}

fn criar_janela(app: &AppHandle) -> tauri::Result<()> {
    let teste = url_de_teste_ativa();
    let app_nav = app.clone();
    let app_janela = app.clone();
    WebviewWindowBuilder::new(app, ROTULO, destino())
        .on_navigation(move |u| {
            let ok = navegacao::permitida(u, teste.as_ref());
            if !ok {
                desviar_para_o_navegador(&app_nav, u);
            }
            ok
        })
        .on_new_window(move |u, _recursos| {
            if navegacao::janela_nova_vai_ao_navegador(&u) {
                let _ = app_janela.opener().open_url(u.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        })
        .title(TITULO)
        .inner_size(LARGURA, ALTURA)
        .min_inner_size(LARGURA_MIN, ALTURA_MIN)
        .decorations(false)
        .always_on_top(true)
        .resizable(true)
        .maximizable(false)
        .shadow(true)
        .build()?;
    relatorio_de_teste(app);
    Ok(())
}

/// Só em desenvolvimento: confirma no terminal como a janela abriu.
fn relatorio_de_teste(app: &AppHandle) {
    if !cfg!(debug_assertions) {
        return;
    }
    if let Some(j) = app.get_webview_window(ROTULO) {
        eprintln!(
            "[quadro] por cima={:?} moldura={:?} redimensiona={:?} maximiza={:?} tamanho={:?} url={:?}",
            j.is_always_on_top(),
            j.is_decorated(),
            j.is_resizable(),
            j.is_maximizable(),
            j.inner_size().map(|t| t.to_logical::<f64>(j.scale_factor().unwrap_or(1.0))),
            j.url().map(|u| u.to_string()),
        );
        // Depois que a página carregou (Fixar lembrado aplica setResizable(false))
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(8));
            eprintln!(
                "[quadro] 8 s depois: redimensiona={:?} url={:?}",
                j.is_resizable(),
                j.url().map(|u| u.to_string())
            );
        });
    }
}

fn agora_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Grava posição/tamanho ao mover/redimensionar (no máximo a cada 750 ms) e
/// ao perder o foco: desligar o PC sem fechar o quadro não perde o lugar.
fn ao_evento_da_janela(janela: &tauri::Window, evento: &WindowEvent) {
    static ULTIMA: AtomicU64 = AtomicU64::new(0);
    let salvar = match evento {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            let agora = agora_ms();
            agora.saturating_sub(ULTIMA.load(Ordering::Relaxed)) >= SALVAR_A_CADA_MS
        }
        WindowEvent::Focused(false) | WindowEvent::CloseRequested { .. } => true,
        _ => false,
    };
    if salvar {
        ULTIMA.store(agora_ms(), Ordering::Relaxed);
        let _ = janela.app_handle().save_window_state(flags_estado());
    }
}

fn main() {
    tauri::Builder::default()
        // Segunda execução (atalho clicado de novo): traz o quadro para a frente.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(j) = app.get_webview_window(ROTULO) {
                let _ = j.unminimize();
                let _ = j.show();
                let _ = j.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(flags_estado())
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle();
            capability_de_teste(handle)?;
            criar_janela(handle)?;
            ligar_autostart_na_primeira_vez(handle);
            Ok(())
        })
        .on_window_event(ao_evento_da_janela)
        .run(tauri::generate_context!())
        .expect("erro ao abrir o Quadro da portaria");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_de_teste_aceita_http_e_https() {
        assert!(url_de_teste(Some("http://localhost:8787/quadro")).is_some());
        assert!(url_de_teste(Some(" https://exemplo.invalid/quadro ")).is_some());
    }

    #[test]
    fn url_de_teste_recusa_outros_esquemas_e_vazio() {
        assert!(url_de_teste(Some("file:///C:/Windows")).is_none());
        assert!(url_de_teste(Some("javascript:alert(1)")).is_none());
        assert!(url_de_teste(Some("")).is_none());
        assert!(url_de_teste(None).is_none());
    }

    #[test]
    fn capability_de_teste_troca_so_a_lista_de_paginas() {
        let urls = ["http://localhost:8787/quadro".to_string()];
        let cap: serde_json::Value =
            serde_json::from_str(&capability_com_urls(&urls).unwrap()).unwrap();
        assert_eq!(cap["identifier"], "quadro-teste-local");
        assert_eq!(cap["remote"]["urls"], serde_json::json!(urls));
        let prod: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/quadro-remoto.json")).unwrap();
        assert_eq!(cap["permissions"], prod["permissions"]);
    }

    #[test]
    fn estado_guarda_so_posicao_e_tamanho() {
        let f = flags_estado();
        assert!(f.contains(StateFlags::SIZE) && f.contains(StateFlags::POSITION));
        assert!(!f.contains(StateFlags::DECORATIONS) && !f.contains(StateFlags::VISIBLE));
    }

    #[test]
    fn capability_de_producao_so_libera_o_site_e_o_minimo() {
        let cap: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/quadro-remoto.json")).unwrap();
        assert_eq!(
            cap["remote"]["urls"],
            serde_json::json!(["https://lombada.appps.com.br/*"])
        );
        assert_eq!(cap["local"], serde_json::json!(false));
        let ids: Vec<String> = cap["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| {
                p.as_str()
                    .map(String::from)
                    .unwrap_or_else(|| p["identifier"].as_str().unwrap().to_string())
            })
            .collect();
        assert_eq!(
            ids,
            vec![
                "core:window:allow-start-dragging",
                "core:window:allow-minimize",
                "core:window:allow-set-resizable",
                "autostart:allow-enable",
                "autostart:allow-disable",
                "autostart:allow-is-enabled",
                "opener:allow-open-url",
            ]
        );
        let escopo = cap["permissions"].as_array().unwrap().last().unwrap();
        assert_eq!(
            escopo["allow"],
            serde_json::json!([{ "url": "https://lombada.appps.com.br/*" }])
        );
    }
}
