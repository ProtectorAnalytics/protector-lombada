-- v1.14.0 — "Veículos por dia" no painel do síndico
--
-- Primeira passagem de cada veículo em cada dia (fuso America/Sao_Paulo), para
-- o gráfico "Por dia" (últimos 8 dias) sem trazer ao navegador todas as
-- passagens do período (~600 por dia num condomínio movimentado).
--
-- Veículo = placa normalizada (só A-Z0-9, Mercosul; a grafia antiga vira
-- Mercosul: 5º caractere 0-9 → A-J). Leitura que não é placa ("SEM PLACA",
-- parcial) fica de fora. O TIPO de cada veículo (morador, visitante…) NÃO é
-- calculado aqui: o painel aplica a regra única do vínculo na hora da primeira
-- passagem (site/js/vinculo-placa.js) sobre `primeira`.
--
-- Segurança: SECURITY INVOKER — a RLS de `capturas` vale para quem chama
-- (síndico só lê o próprio condomínio); `p_cliente` restringe explicitamente
-- ao condomínio aberto no painel. Só `authenticated` executa. Janela limitada
-- a 32 dias. O painel funciona sem esta função (calcula no navegador).
--
-- Rollback: DROP FUNCTION IF EXISTS public.primeiras_passagens_por_dia(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.primeiras_passagens_por_dia(
  p_cliente uuid,
  p_desde timestamptz,
  p_ate timestamptz
)
RETURNS TABLE(dia date, placa text, primeira timestamptz, passagens integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH lidas AS (
    SELECT (c."timestamp" AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           upper(regexp_replace(coalesce(c.placa, ''), '[^A-Za-z0-9]', '', 'g')) AS limpa,
           c."timestamp" AS ts
    FROM public.capturas c
    WHERE c.cliente_id = p_cliente
      AND c."timestamp" >= p_desde
      AND c."timestamp" < p_ate
      AND p_ate > p_desde
      AND p_ate - p_desde <= interval '32 days'
  ), veiculos AS (
    SELECT dia,
           CASE
             WHEN limpa ~ '^[A-Z]{3}[0-9][A-Z][0-9]{2}$' THEN limpa
             WHEN limpa ~ '^[A-Z]{3}[0-9]{4}$'
               THEN substr(limpa, 1, 4) || chr(65 + substr(limpa, 5, 1)::int) || substr(limpa, 6)
           END AS chave,
           ts
    FROM lidas
  )
  SELECT v.dia, v.chave, min(v.ts), count(*)::int
  FROM veiculos v
  WHERE v.chave IS NOT NULL
  GROUP BY v.dia, v.chave
  ORDER BY v.dia, v.chave;
$function$;

REVOKE ALL ON FUNCTION public.primeiras_passagens_por_dia(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.primeiras_passagens_por_dia(uuid, timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.primeiras_passagens_por_dia(uuid, timestamptz, timestamptz) IS
  'v1.14.0: primeira passagem de cada veículo (placa normalizada) por dia em America/Sao_Paulo, para "Veículos por dia". SECURITY INVOKER (RLS de capturas) + filtro explícito por cliente; janela de até 32 dias.';
