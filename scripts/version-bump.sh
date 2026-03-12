#!/bin/bash
# =============================================================================
# version-bump.sh - Script de versionamento automático do Protector Lombada
#
# Uso:
#   ./scripts/version-bump.sh build      # Melhorias, ajustes, correções
#   ./scripts/version-bump.sh minor      # Novas funcionalidades
#   ./scripts/version-bump.sh major      # Mudanças radicais / breaking changes
#
# Formato: MAJOR.MINOR.BUILD
#   - major: mudança radical (breaking change, redesign completo)
#   - minor: nova funcionalidade
#   - build: melhoria, ajuste de estilo, correção de bug
# =============================================================================

set -e

BUMP_TYPE="${1:-build}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT_DIR/package.json"
DASH="$ROOT_DIR/dashboard/index.html"
MANUAL="$ROOT_DIR/dashboard/manual.html"

# Lê versão atual do package.json
CURRENT=$(grep '"version"' "$PKG" | head -1 | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\).*/\1/')
MAJOR=$(echo "$CURRENT" | cut -d. -f1)
MINOR=$(echo "$CURRENT" | cut -d. -f2)
BUILD=$(echo "$CURRENT" | cut -d. -f3)

echo "Versão atual: $CURRENT"

case "$BUMP_TYPE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    BUILD=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    BUILD=0
    ;;
  build)
    BUILD=$((BUILD + 1))
    ;;
  *)
    echo "Uso: $0 [major|minor|build]"
    echo "  major  - mudança radical (breaking changes)"
    echo "  minor  - nova funcionalidade"
    echo "  build  - melhoria, ajuste, correção"
    exit 1
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$BUILD"
COMMIT_HASH=$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo "0000000")
TODAY=$(date +%Y-%m-%d)
MONTH_YEAR=$(date +"%B %Y" | sed 's/January/Janeiro/;s/February/Fevereiro/;s/March/Março/;s/April/Abril/;s/May/Maio/;s/June/Junho/;s/July/Julho/;s/August/Agosto/;s/September/Setembro/;s/October/Outubro/;s/November/Novembro/;s/December/Dezembro/')

echo "Nova versão: $NEW_VERSION ($BUMP_TYPE)"
echo "Build hash:  $COMMIT_HASH"
echo "Data:        $TODAY"
echo ""

# 1. Atualiza package.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$PKG"
echo "[OK] package.json → $NEW_VERSION"

# 2. Atualiza dashboard/index.html - versão na tela de login
sed -i "s/v[0-9]*\.[0-9]*\.[0-9]* \&middot; Build [a-f0-9]* \&middot; [0-9\-]*/v$NEW_VERSION \&middot; Build $COMMIT_HASH \&middot; $TODAY/" "$DASH"
echo "[OK] dashboard/index.html (login)"

# 3. Atualiza dashboard/index.html - rodapé
sed -i "s/Protector Traffic Control \&middot; v[0-9]*\.[0-9]*\.[0-9]* \&middot; Build [a-f0-9]*/Protector Traffic Control \&middot; v$NEW_VERSION \&middot; Build $COMMIT_HASH/" "$DASH"
echo "[OK] dashboard/index.html (footer)"

# 4. Atualiza manual.html - versão no topo
sed -i "s/Versão [0-9]*\.[0-9]*\.[0-9]* | .*/Versão $NEW_VERSION | $MONTH_YEAR<\/p>/" "$MANUAL"
echo "[OK] manual.html (header)"

# 5. Atualiza manual.html - versão no rodapé
sed -i "s/v[0-9]*\.[0-9]*\.[0-9]* | [A-ZÇa-zçã]* [0-9]*/v$NEW_VERSION | $MONTH_YEAR/" "$MANUAL"
echo "[OK] manual.html (footer)"

echo ""
echo "Versão atualizada: v$NEW_VERSION (Build $COMMIT_HASH) - $TODAY"
echo "Arquivos modificados: package.json, dashboard/index.html, dashboard/manual.html"
