#!/bin/bash
# Generates self-signed TLS certs for local HTTPS dev (not for production)
set -e

CERTS_DIR="$(dirname "$0")/../nginx/certs"
mkdir -p "$CERTS_DIR"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERTS_DIR/key.pem" \
  -out "$CERTS_DIR/cert.pem" \
  -subj "/C=TR/ST=Istanbul/L=Istanbul/O=DentalCRM/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Dev certs written to $CERTS_DIR"
