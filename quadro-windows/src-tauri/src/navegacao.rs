//! Trava de navegação da janela do quadro.
//!
//! É ela que limita o IPC à página do quadro: o Tauri 2.12 confere a
//! capability remota pelo cabeçalho Origin (só esquema + host, sem caminho),
//! então `remote.urls` não consegue separar /quadro do resto do site (medido:
//! com "/quadro" na lista, o IPC da própria página é recusado). Como a janela
//! nunca exibe outra página da Lombada, só /quadro chega a chamar o IPC.
//!
//! A janela só mostra: a página local de espera, a página do quadro
//! (https://lombada.appps.com.br/quadro e /quadro/...) e o que o "não sou um
//! robô" (Turnstile) carrega em iframe. No macOS o WKWebView passa também as
//! navegações de iframe pelo mesmo filtro, por isso challenges.cloudflare.com
//! e about:blank/about:srcdoc ficam liberados (sem IPC: a capability é só da
//! página do quadro). Qualquer outro endereço não abre na janela; se for
//! https, vai para o navegador padrão.
use url::Url;

pub const HOST_LOMBADA: &str = "lombada.appps.com.br";
const HOST_TURNSTILE: &str = "challenges.cloudflare.com";
const CAMINHO_QUADRO: &str = "/quadro";

fn eh_local(u: &Url) -> bool {
    match u.scheme() {
        "tauri" => u.host_str() == Some("localhost"),
        "http" | "https" => u.host_str() == Some("tauri.localhost"),
        _ => false,
    }
}

fn eh_quadro(u: &Url) -> bool {
    u.scheme() == "https"
        && u.host_str() == Some(HOST_LOMBADA)
        && u.port().is_none()
        && (u.path() == CAMINHO_QUADRO || u.path().starts_with("/quadro/"))
}

fn eh_iframe_do_captcha(u: &Url) -> bool {
    let em_branco = u.scheme() == "about" && matches!(u.path(), "blank" | "srcdoc");
    em_branco || (u.scheme() == "https" && u.host_str() == Some(HOST_TURNSTILE))
}

fn mesma_origem(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme()
        && a.host_str() == b.host_str()
        && a.port_or_known_default() == b.port_or_known_default()
}

/// A janela pode navegar para `u`? `teste` = origem local de desenvolvimento.
pub fn permitida(u: &Url, teste: Option<&Url>) -> bool {
    eh_local(u)
        || eh_quadro(u)
        || eh_iframe_do_captcha(u)
        || teste.is_some_and(|t| mesma_origem(u, t))
}

/// Endereço recusado na janela que vale abrir no navegador padrão.
pub fn abrir_no_navegador(u: &Url) -> bool {
    u.scheme() == "https"
}

/// Janela nova (window.open/target=_blank) nunca abre no programa; só links
/// da própria Lombada seguem para o navegador padrão.
pub fn janela_nova_vai_ao_navegador(u: &Url) -> bool {
    u.scheme() == "https" && u.host_str() == Some(HOST_LOMBADA) && u.port().is_none()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn libera_o_quadro_a_espera_local_e_o_captcha() {
        for ok in [
            "https://lombada.appps.com.br/quadro",
            "https://lombada.appps.com.br/quadro/",
            "https://lombada.appps.com.br/quadro?x=1",
            "https://lombada.appps.com.br/quadro/app.js",
            "tauri://localhost/index.html",
            "http://tauri.localhost/index.html",
            "https://tauri.localhost/index.html",
            "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv0/0/x",
            "about:blank",
            "about:srcdoc",
        ] {
            assert!(permitida(&u(ok), None), "{ok}");
        }
    }

    #[test]
    fn bloqueia_o_resto_do_site_e_outros_enderecos() {
        for nao in [
            "https://lombada.appps.com.br/",
            "https://lombada.appps.com.br/dashboard",
            "https://lombada.appps.com.br/quadrox",
            "https://lombada.appps.com.br:8443/quadro",
            "http://lombada.appps.com.br/quadro",
            "https://lombada.appps.com.br.evil.example/quadro",
            "https://example.com/quadro",
            "file:///C:/Windows/system32",
            "javascript:alert(1)",
            "data:text/html,oi",
            "about:config",
        ] {
            assert!(!permitida(&u(nao), None), "{nao}");
        }
    }

    #[test]
    fn origem_de_teste_vale_so_ela() {
        let t = u("http://localhost:8787/quadro");
        assert!(permitida(&u("http://localhost:8787/diag"), Some(&t)));
        assert!(!permitida(&u("http://127.0.0.1:8787/x"), Some(&t)));
        assert!(!permitida(&u("http://localhost:9999/x"), Some(&t)));
    }

    #[test]
    fn so_https_vai_ao_navegador() {
        assert!(abrir_no_navegador(&u(
            "https://lombada.appps.com.br/dashboard"
        )));
        assert!(!abrir_no_navegador(&u("file:///C:/x")));
        assert!(!abrir_no_navegador(&u("http://example.com/")));
    }

    #[test]
    fn janela_nova_so_da_lombada_vai_ao_navegador() {
        assert!(janela_nova_vai_ao_navegador(&u(
            "https://lombada.appps.com.br/dashboard/manual.html"
        )));
        assert!(!janela_nova_vai_ao_navegador(&u("https://example.com/")));
        assert!(!janela_nova_vai_ao_navegador(&u(
            "http://lombada.appps.com.br/"
        )));
    }
}
