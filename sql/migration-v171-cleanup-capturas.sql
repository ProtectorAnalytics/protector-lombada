-- v1.7.1 — corrige a retenção de 6 meses das passagens (auditoria C3).
--
-- cleanup_old_capturas() falhava todo dia desde 27/09 com "query returned
-- more than one row": o `RETURNING 1 INTO` só aceita uma linha, e o DELETE
-- apaga várias. Mesmo modelo de cleanup_old_capturas_historico (GET
-- DIAGNOSTICS). Antes de apagar, solta cameras.last_capture_id que aponte
-- para passagem vencida (FK sem ON DELETE), senão o DELETE inteiro falha.

CREATE OR REPLACE FUNCTION public.cleanup_old_capturas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  corte timestamptz := now() - interval '6 months';
  deleted_count integer;
BEGIN
  UPDATE public.cameras c
     SET last_capture_id = NULL
    FROM public.capturas k
   WHERE k.id = c.last_capture_id
     AND k."timestamp" < corte;

  DELETE FROM public.capturas
  WHERE "timestamp" < corte;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_old_capturas() FROM PUBLIC, anon, authenticated;
