// Espera o site responder e abre o quadro. Sem permissão nenhuma do Tauri
// (a capability só vale para https://lombada.appps.com.br).
(function () {
  'use strict';
  var QUADRO = 'https://lombada.appps.com.br/quadro';
  var TESTE = 'https://lombada.appps.com.br/api/config';
  var INTERVALO_MS = 5000;
  var texto = document.getElementById('texto');
  var tentativas = 0;

  function tentar() {
    tentativas += 1;
    fetch(TESTE, { mode: 'no-cors', cache: 'no-store' })
      .then(function () { window.location.replace(QUADRO); })
      .catch(function () {
        texto.textContent = tentativas > 1
          ? 'Sem internet. Tentando de novo a cada 5 segundos…'
          : 'Conectando…';
        setTimeout(tentar, INTERVALO_MS);
      });
  }

  tentar();
})();
