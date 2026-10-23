/**
 * /api/admin/unidades — unidades do condomínio (agrupador, unidade, andar, tipo).
 * GET lista, POST cria (texto legado ou `unidades` estruturadas), PUT edita, DELETE desativa.
 * Lógica em lib/lista-portaria-api.js.
 */
const { criarHandler } = require('../../lib/lista-portaria-api');

module.exports = criarHandler({ tabela: 'unidades', rotulo: 'unidade', comOrdem: true });
