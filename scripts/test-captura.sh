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

# Teste 5: Retransmissão da câmera (mesmo vehicleId) deve ser deduplicada
#
# A câmera ALPHADIGI reenvia o evento inteiro quando não recebe resposta dentro
# do seu timeout de 10s, e todo reenvio carrega o mesmo vehicleId. O segundo
# POST tem de responder 200 (senão a câmera segue retransmitindo) e marcar
# duplicado:true, sem gravar uma segunda captura.
echo "📋 Teste 5: Retransmissão do mesmo evento (dedupe por vehicleId)..."
VEHICLE_ID=$(( RANDOM * 32768 + RANDOM ))
PAYLOAD='{
  "AlarmInfoPlate": {
    "channel": 0,
    "serialno": "TESTE",
    "result": {
      "PlateResult": {
        "license": "DEDUP01",
        "confidence": 99,
        "vehicleId": '"${VEHICLE_ID}"',
        "type": 1,
        "carColor": 6,
        "radarSpeed": { "Speed": { "PerHour": 20, "Direction": 1 } }
      }
    }
  }
}'

RESP1=$(curl -s -X POST "${URL_BASE}/api/captura?token=${TOKEN}" \
  -H "Content-Type: application/json" -d "${PAYLOAD}")
echo "   1º envio:  $RESP1"

RESP2=$(curl -s -X POST "${URL_BASE}/api/captura?token=${TOKEN}" \
  -H "Content-Type: application/json" -d "${PAYLOAD}")
echo "   2º envio:  $RESP2"

if echo "$RESP2" | grep -q '"duplicado":true'; then
  ID1=$(echo "$RESP1" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  ID2=$(echo "$RESP2" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  if [ -n "$ID1" ] && [ "$ID1" = "$ID2" ]; then
    echo "   ✅ PASSOU (reenvio devolveu a captura original, sem duplicar)"
  else
    echo "   ⚠️  PARCIAL (marcou duplicado, mas o id não bateu)"
  fi
else
  echo "   ❌ FALHOU (2º envio deveria trazer duplicado:true)"
fi

echo ""
echo "========================================="
echo "✅ Testes concluídos!"
echo ""
