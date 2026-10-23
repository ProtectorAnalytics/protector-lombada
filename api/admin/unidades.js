/**
 * /api/admin/unidades — lista de unidades (casa/bloco/apto) do condomínio.
 * Lógica em lib/lista-portaria-api.js.
 */
const { criarHandler } = require('../../lib/lista-portaria-api');

module.exports = criarHandler({ tabela: 'unidades', rotulo: 'unidade', comOrdem: true });
