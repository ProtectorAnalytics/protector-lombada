-- veiculos_base é global (um veículo, várias portarias). A coluna suspeita_de
-- guarda a placa frequente de UM condomínio; o painel (role authenticated) não
-- pode ler as colunas de controle nem de suspeita. A API (service role) lê tudo.
-- A policy RLS de linha continua valendo.
revoke select on public.veiculos_base from authenticated, anon;
grant select (placa, placa_antiga, status, marca, modelo, versao, cor, cor_normalizada,
              ano_fabricacao, ano_modelo, municipio, uf, tipo_veiculo, situacao, consultado_em)
  on public.veiculos_base to authenticated;
