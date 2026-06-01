-- Migration: teto de velocidade plausível por cliente (sanity-cap do radar)
--
-- Motivação: o radar das câmeras ALPHADIGI ocasionalmente reporta velocidades
-- fisicamente impossíveis em via interna de condomínio (observado em produção:
-- placa SJM3F49 com 180 e 351 km/h em rajada, provável reflexo / veículo grande
-- manobrando). Essas leituras dispararam ~40 alertas de multa falsos em 7 dias.
--
-- Acima deste teto, api/captura.js trata a leitura como inválida: zera a
-- velocidade (vira "SEM RADAR") e NÃO notifica. Default 80 km/h para vias
-- internas de condomínio (máximo real legítimo observado: 52 km/h).

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS velocidade_maxima_plausivel integer NOT NULL DEFAULT 80;

COMMENT ON COLUMN public.clientes.velocidade_maxima_plausivel IS
  'Teto de sanidade do radar: leituras acima deste valor (km/h) são tratadas como inválidas (SEM RADAR) e não geram alerta de multa. Default 80 para vias internas de condomínio.';
