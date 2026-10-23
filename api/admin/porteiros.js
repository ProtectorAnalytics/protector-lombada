/**
 * /api/admin/porteiros — lista de porteiros do condomínio.
 * Lógica compartilhada com as unidades em lib/lista-portaria-api.js.
 */
const { criarHandler } = require('../../lib/lista-portaria-api');

module.exports = criarHandler({ tabela: 'porteiros', rotulo: 'porteiro', comOrdem: false });
