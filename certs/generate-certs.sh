#!/bin/bash
# Generate self-signed SSL certificates for local development

CERT_DIR="$(dirname "$0")"
cd "$CERT_DIR"

# Generate private key and self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout server.key \
  -out server.crt \
  -subj "/C=DE/ST=Berlin/L=Berlin/O=42Berlin/OU=Transcendence/CN=10.15.4.8" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:10.15.4.8"

echo "✅ SSL certificates generated:"
echo "   - server.key (private key)"
echo "   - server.crt (certificate)"
