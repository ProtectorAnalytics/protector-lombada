#!/bin/bash
# ============================================
# PROTECTOR LOMBADA - Teste de Captura
# ============================================
# Uso: ./scripts/test-captura.sh <URL_BASE> <TOKEN>
# Exemplo: ./scripts/test-captura.sh https://protector.vercel.app abc123def456
#
# Envia um POST simulando a câmera ALPHADIGI

URL_BASE=${1:-"http://localhost:3000"}
TOKEN=${2:-"TOKEN_AQUI"}

echo ""
echo "🧪 PROTECTOR LOMBADA - Teste de Captura"
echo "========================================="
echo "URL: ${URL_BASE}/api/captura?token=${TOKEN}"
echo ""

# Teste 1: Velocidade normal (abaixo do limite)
echo "📋 Teste 1: Velocidade normal (20 km/h)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${URL_BASE}/api/captura?token=${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "plate": "ABC1D23",
    "speed": "20",
    "time": "'"$(date '+%Y-%m-%d %H:%M:%S')"'",
    "pixels": "194",
    "vehicleType": "car",
    "vehicleColor": "silver"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "   HTTP: $HTTP_CODE"
echo "   Body: $BODY"

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ PASSOU"
else
  echo "   ❌ FALHOU"
fi

echo ""

# Teste 2: Velocidade acima do limite (gera notificação)
echo "📋 Teste 2: Velocidade acima do limite (55 km/h)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${URL_BASE}/api/captura?token=${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "plate": "RPK5F09",
    "speed": "55",
    "time": "'"$(date '+%Y-%m-%d %H:%M:%S')"'",
    "pixels": "210",
    "vehicleType": "car",
    "vehicleColor": "prata"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "   HTTP: $HTTP_CODE"
echo "   Body: $BODY"

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ PASSOU (verifique o e-mail para notificação)"
else
  echo "   ❌ FALHOU"
fi

echo ""

# Teste 3: Token inválido
echo "📋 Teste 3: Token inválido..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${URL_BASE}/api/captura?token=INVALIDO" \
  -H "Content-Type: application/json" \
  -d '{"plate": "XXX0000", "speed": "30"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "   HTTP: $HTTP_CODE"
echo "   Body: $BODY"

if [ "$HTTP_CODE" = "401" ]; then
  echo "   ✅ PASSOU (rejeitou corretamente)"
else
  echo "   ❌ FALHOU (deveria retornar 401)"
fi

echo ""

# Teste 4: Sem placa
echo "📋 Teste 4: Request sem placa..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${URL_BASE}/api/captura?token=${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"speed": "30"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "   HTTP: $HTTP_CODE"
echo "   Body: $BODY"

if [ "$HTTP_CODE" = "400" ]; then
  echo "   ✅ PASSOU (rejeitou corretamente)"
else
  echo "   ❌ FALHOU (deveria retornar 400)"
fi

echo ""
echo "========================================="
echo "✅ Testes concluídos!"
echo ""
