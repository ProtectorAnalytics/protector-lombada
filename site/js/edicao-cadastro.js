/**
 * edicao-cadastro.js — regras do "Editar cadastro" do painel (detalhes da
 * passagem e lista de veículos): qual vínculo editar e o corpo do PUT
 * /api/admin/veiculos?id=<id>.
 *
 * Nada aqui toca no DOM. Carregado no browser (window.edicaoCadastroLib) e no
 * Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.edicaoCadastroLib = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ERRO_TIPO = 'Escolha o tipo: morador, proprietário, visitante ou prestador.';
  const ERRO_NOME = 'Informe o nome.';

  const aparar = (v) => (v === undefined || v === null ? '' : String(v).trim());

  /**
   * A edição vale sempre para o vínculo VIGENTE da placa. Se o quadro mostrado
   * é outro (vínculo antigo, já encerrado), o título avisa que muda o atual.
   * @param {{id?: string}|null} mostrado vínculo exibido no quadro
   * @param {{id?: string, encerrado_em?: string|null}|null} vigente vínculo atual da placa
   * @returns {{ vinculo: object, titulo: string } | null}
   */
  function alvoEdicao(mostrado, vigente) {
    if (!vigente || !vigente.id || vigente.encerrado_em) return null;
    const mesmo = Boolean(mostrado && mostrado.id === vigente.id);
    return { vinculo: vigente, titulo: mesmo ? 'Editar cadastro' : 'Editar cadastro atual' };
  }

  /**
   * Unidade no formato do PUT. Lista vazia ("— Sem unidade —") só limpa se o
   * vínculo tinha unidade da lista; rótulo antigo em texto livre fica como está.
   * @param {{unidade_id?: string|null, unidade?: string|null}} original
   * @param {{ lista: boolean, valor: string, rotulo?: string|null }} campo
   */
  function unidadeDaEdicao(original, campo) {
    const o = original || {};
    const valor = aparar(campo && campo.valor);
    if (campo && campo.lista) {
      if (valor) return { unidade_id: valor, unidade: campo.rotulo || null };
      return o.unidade_id ? { unidade_id: null, unidade: null } : {};
    }
    if (valor === aparar(o.unidade)) return {};
    return { unidade: valor || null, unidade_id: null };
  }

  /**
   * Valida e monta o corpo do PUT (tipo e nome obrigatórios, como no cadastro).
   * @returns {{ erro: string, campo: string } | { corpo: object }}
   */
  function montarEdicao(original, valores) {
    const v = valores || {};
    const tipo = aparar(v.tipo_pessoa);
    const nome = aparar(v.nome_morador);
    if (!tipo) return { erro: ERRO_TIPO, campo: 'tipo_pessoa' };
    if (!nome) return { erro: ERRO_NOME, campo: 'nome_morador' };
    return {
      corpo: {
        tipo_pessoa: tipo,
        nome_morador: nome,
        ...unidadeDaEdicao(original, v.unidade),
        marca: aparar(v.marca) || null,
        cor: aparar(v.cor) || null,
      },
    };
  }

  /** URL do PUT: o id vai na query, sempre codificado. */
  function urlEdicao(id) {
    return `/api/admin/veiculos?id=${encodeURIComponent(String(id || ''))}`;
  }

  return { ERRO_TIPO, ERRO_NOME, alvoEdicao, unidadeDaEdicao, montarEdicao, urlEdicao };
});
