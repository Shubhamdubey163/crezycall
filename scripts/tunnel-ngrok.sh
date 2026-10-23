#!/bin/bash
# Public URL via ngrok (stable, WebSocket/calls ke liye best)
set -e
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-3000}"

if ! curl -s -o /dev/null "http://127.0.0.1:${PORT}/"; then
  echo "❌ Server not running on port ${PORT}. Start: npm start"
  exit 1
fi

if [ -z "$NGROK_AUTHTOKEN" ]; then
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  Ngrok — ek baar free setup (2 minute)"
  echo "══════════════════════════════════════════════════════════"
  echo "  1. Open: https://dashboard.ngrok.com/signup"
  echo "  2. Copy authtoken: https://dashboard.ngrok.com/get-started/your-authtoken"
  echo "  3. Run:"
  echo "       ngrok config add-authtoken YOUR_TOKEN_HERE"
  echo "     OR add to .env file:"
  echo "       NGROK_AUTHTOKEN=YOUR_TOKEN_HERE"
  echo "  4. Run again: npm run tunnel"
  echo "══════════════════════════════════════════════════════════"
  echo ""
  exit 1
fi

ngrok config add-authtoken "$NGROK_AUTHTOKEN" 2>/dev/null || true

pkill -f "ngrok http" 2>/dev/null || true
sleep 1

echo "Starting ngrok → http://127.0.0.1:${PORT}"
ngrok http "$PORT" --log=stdout &
NGROK_PID=$!
sleep 3

URL=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for t in d.get('tunnels', []):
        u = t.get('public_url', '')
        if u.startswith('https://'):
            print(u)
            break
except: pass
" 2>/dev/null)
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "Ngrok started — open http://127.0.0.1:4040 for public URL"
  wait $NGROK_PID
  exit 0
fi

echo ""
echo "✅ Ngrok LIVE — friend ko ye links bhejo:"
echo ""
echo "   Host:     ${URL}/agent"
echo "   Customer: ${URL}/customer"
echo "   Admin:    ${URL}/admin"
echo ""
echo "   Host login:  host@crezycall.com / host123"
echo "   User login:  user@demo.com / user123"
echo ""
echo "   Dashboard: http://127.0.0.1:4040"
echo "   Stop: kill $NGROK_PID"
echo ""

wait $NGROK_PID
