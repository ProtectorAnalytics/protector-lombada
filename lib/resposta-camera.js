/**
 * Corpo da resposta ao push de placa (AlarmInfoPlate) da câmera ALPHADIGI.
 *
 * O protocolo pede HTTP 200 E o objeto Response_AlarmInfoPlate com
 * content "retransfer_stop" (wiki ALPHADIGI, API via HTTP POST, 1.2–1.3).
 * A TCAM3130N aceitava só o 200; a TCAM5130N-SP sem esse objeto marca o envio
 * como falho, tenta o endereço secundário, guarda offline e reenvia a mesma
 * leitura sem parar.
 *
 * info fica "no" de propósito: "ok" manda a câmera acionar o relé (cancela).
 */
function respostaPlaca(campos = {}) {
  return {
    ok: true,
    ...campos,
    Response_AlarmInfoPlate: {
      info: 'no',
      content: 'retransfer_stop',
      is_pay: 'false',
      serialData: [],
    },
  };
}

module.exports = { respostaPlaca };
