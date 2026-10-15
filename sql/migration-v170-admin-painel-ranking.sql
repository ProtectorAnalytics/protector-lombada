-- Migration v1.7.0 — equipe Protector no painel do cliente + ranking de velocidade
--
-- 1. audit_log sem INSERT público. A policy "audit_insert" (WITH CHECK true,
--    sem TO) deixava qualquer um, até anon, forjar linhas de auditoria. A API
--    grava com a service key, que ignora RLS: nada do sistema depende dela.
--    Sem ela, a trilha "equipe abriu o painel do condomínio X" vale como prova.
--
-- 2. veiculos_base_do_cliente(p_cliente): a base de veículos que passaram NO
--    condomínio escolhido. Para o síndico, a RLS já limitava ao condomínio
--    dele; para a equipe Protector (is_super_admin) a RLS libera a base
--    inteira, e os filtros de marca/modelo/cor misturavam condomínios.
--    SECURITY INVOKER: a RLS de veiculos_base e capturas continua valendo
--    (síndico pedindo outro condomínio recebe zero linhas).
--
-- 3. maiores_velocidades(p_cliente, p_desde, p_limite): as N maiores
--    velocidades desde p_desde, uma linha por veículo (a maior de cada placa;
--    grafia antiga e Mercosul contam como o mesmo carro). Fora: "SEM PLACA",
--    velocidade_invalida (sanity-cap do radar) e leitura suspeita na base.
--    Percorre as passagens da maior velocidade para a menor pelo índice novo
--    e para ao juntar N veículos: não agrega meses de passagens.

-- ---------- 1. audit_log
DROP POLICY IF EXISTS "audit_insert" ON public.audit_log;

-- ---------- 2. Base de veículos do condomínio
CREATE OR REPLACE FUNCTION public.veiculos_base_do_cliente(p_cliente uuid)
RETURNS TABLE (
  placa text, placa_antiga text, marca text, modelo text, versao text,
  cor_normalizada text, ano_modelo integer, status text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT vb.placa, vb.placa_antiga, vb.marca, vb.modelo, vb.versao,
         vb.cor_normalizada, vb.ano_modelo, vb.status
  FROM public.veiculos_base vb
  WHERE EXISTS (
    SELECT 1 FROM public.capturas c
    WHERE c.cliente_id = p_cliente
      AND c.placa IN (vb.placa, vb.placa_antiga)
  );
$$;

-- ---------- 3. Ranking das maiores velocidades
CREATE INDEX IF NOT EXISTS idx_capturas_ranking_velocidade
  ON public.capturas (cliente_id, velocidade DESC, "timestamp" DESC)
  WHERE NOT velocidade_invalida;

CREATE OR REPLACE FUNCTION public.maiores_velocidades(
  p_cliente uuid,
  p_desde timestamptz,
  p_limite integer DEFAULT 10
)
RETURNS TABLE (placa text, velocidade integer, passou_em timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  r record;
  carro text;
  vistos text[] := '{}';
  limite integer := CASE WHEN p_limite BETWEEN 1 AND 50 THEN p_limite ELSE 10 END;
BEGIN
  FOR r IN
    SELECT c.placa, c.velocidade, c."timestamp"
    FROM public.capturas c
    WHERE c.cliente_id = p_cliente
      AND NOT c.velocidade_invalida
      AND c."timestamp" >= p_desde
      AND c.velocidade > 0
      AND c.placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'
      AND NOT EXISTS (
        SELECT 1 FROM public.veiculos_base vb
        WHERE vb.status = 'suspeita' AND c.placa IN (vb.placa, vb.placa_antiga)
      )
    ORDER BY c.velocidade DESC, c."timestamp" DESC
  LOOP
    -- Mesmo carro nas duas grafias: a 5ª posição dígito 0–9 vira letra A–J
    carro := CASE WHEN substr(r.placa, 5, 1) ~ '[0-9]'
      THEN substr(r.placa, 1, 4) || chr(65 + substr(r.placa, 5, 1)::int) || substr(r.placa, 6)
      ELSE r.placa END;
    CONTINUE WHEN carro = ANY (vistos);
    vistos := vistos || carro;
    placa := r.placa;
    velocidade := r.velocidade;
    passou_em := r."timestamp";
    RETURN NEXT;
    EXIT WHEN cardinality(vistos) >= limite;
  END LOOP;
END;
$$;

-- Só quem está logado chama (a RLS decide o que cada um enxerga)
REVOKE ALL ON FUNCTION public.veiculos_base_do_cliente(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.maiores_velocidades(uuid, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.veiculos_base_do_cliente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maiores_velocidades(uuid, timestamptz, integer) TO authenticated;
