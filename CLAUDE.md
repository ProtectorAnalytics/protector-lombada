# Protector Lombada - Instruções para Claude

## Versionamento Automático (OBRIGATÓRIO)

Após TODA alteração de código, executar o script de versionamento antes do commit:

```bash
# Melhorias, ajustes de estilo, correções de bug → bump de BUILD
./scripts/version-bump.sh build

# Novas funcionalidades → bump de MINOR
./scripts/version-bump.sh minor

# Mudanças radicais / breaking changes / redesign completo → bump de MAJOR
./scripts/version-bump.sh major
```

### Formato: MAJOR.MINOR.BUILD
- **major** (ex: 1.0.0 → 2.0.0): mudança radical, redesign, breaking changes
- **minor** (ex: 1.0.0 → 1.1.0): nova funcionalidade
- **build** (ex: 1.0.0 → 1.0.1): melhoria visual, ajuste de estilo, correção de bug, refatoração

### Fluxo de commit:
1. Fazer as alterações no código
2. `git add` dos arquivos alterados
3. `git commit` das alterações
4. Rodar `./scripts/version-bump.sh <tipo>`
5. `git add` dos arquivos de versão (package.json, dashboard/index.html, dashboard/manual.html)
6. `git commit` com mensagem "bump: vX.Y.Z"
7. `git push`

## Deploy (OBRIGATÓRIO)

O deploy é feito automaticamente pela **Vercel** ao detectar push no branch `master`.

### Após finalizar alterações, SEMPRE:
1. Fazer merge do branch de feature para `master`
2. Push para `master` — a Vercel faz deploy automático
3. Se push direto no `master` estiver bloqueado (403), criar PR e fazer merge pelo GitHub

### Branch principal: `master`
