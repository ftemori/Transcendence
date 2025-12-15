#!/bin/bash
# Generate self-signed SSL certificates for local development

CERT_DIR="$(dirname "$0")"
cd "$CERT_DIR"

# Auto-detect local IP address
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
  # Fallback for systems without hostname -I
  LOCAL_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}')
fi
if [ -z "$LOCAL_IP" ]; then
  # Final fallback
  LOCAL_IP="127.0.0.1"
fi

echo "🔍 Detected local IP: $LOCAL_IP"

# Generate private key and self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout server.key \
  -out server.crt \
  -subj "/C=DE/ST=Berlin/L=Berlin/O=42Berlin/OU=Transcendence/CN=$LOCAL_IP" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$LOCAL_IP"

echo "✅ SSL certificates generated:"
echo "   - server.key (private key)"
echo "   - server.crt (certificate)"
echo "   - Valid for: localhost, 127.0.0.1, $LOCAL_IP"
