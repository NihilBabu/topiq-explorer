#!/bin/bash
# Script to generate SSL certificates for Kafka SSL testing
# Run this script before starting the SSL Kafka broker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="${SCRIPT_DIR}/../certs"
PASSWORD="topiq-explorer"

# Create certs directory
mkdir -p "$CERTS_DIR"
cd "$CERTS_DIR"

echo "Generating SSL certificates..."

# Generate CA key and certificate
echo "Creating Certificate Authority..."
openssl req -new -x509 -keyout ca-key -out ca-cert -days 365 -nodes \
    -subj "/CN=topiq-explorer-ca/OU=Testing/O=KafkaExplorer/L=Local/ST=Dev/C=US"

# Create server keystore
echo "Creating server keystore..."
keytool -genkey -keystore kafka.server.keystore.jks -validity 365 -storepass "$PASSWORD" -keypass "$PASSWORD" \
    -dname "CN=localhost, OU=Testing, O=KafkaExplorer, L=Local, ST=Dev, C=US" \
    -alias localhost -storetype PKCS12 -keyalg RSA

# Create certificate signing request
echo "Creating certificate signing request..."
keytool -keystore kafka.server.keystore.jks -alias localhost -certreq -file cert-file -storepass "$PASSWORD"

# Sign the server certificate with the CA
echo "Signing server certificate..."
openssl x509 -req -CA ca-cert -CAkey ca-key -in cert-file -out cert-signed -days 365 -CAcreateserial

# Import CA certificate into server keystore
echo "Importing CA certificate into server keystore..."
keytool -keystore kafka.server.keystore.jks -alias CARoot -import -file ca-cert -storepass "$PASSWORD" -noprompt

# Import signed certificate into server keystore
echo "Importing signed certificate into server keystore..."
keytool -keystore kafka.server.keystore.jks -alias localhost -import -file cert-signed -storepass "$PASSWORD" -noprompt

# Create server truststore
echo "Creating server truststore..."
keytool -keystore kafka.server.truststore.jks -alias CARoot -import -file ca-cert -storepass "$PASSWORD" -noprompt -storetype PKCS12

# Create client keystore (for client authentication)
echo "Creating client keystore..."
keytool -genkey -keystore kafka.client.keystore.jks -validity 365 -storepass "$PASSWORD" -keypass "$PASSWORD" \
    -dname "CN=client, OU=Testing, O=KafkaExplorer, L=Local, ST=Dev, C=US" \
    -alias client -storetype PKCS12 -keyalg RSA

# Create client certificate signing request
keytool -keystore kafka.client.keystore.jks -alias client -certreq -file client-cert-file -storepass "$PASSWORD"

# Sign the client certificate with the CA
openssl x509 -req -CA ca-cert -CAkey ca-key -in client-cert-file -out client-cert-signed -days 365 -CAcreateserial

# Import CA certificate into client keystore
keytool -keystore kafka.client.keystore.jks -alias CARoot -import -file ca-cert -storepass "$PASSWORD" -noprompt

# Import signed certificate into client keystore
keytool -keystore kafka.client.keystore.jks -alias client -import -file client-cert-signed -storepass "$PASSWORD" -noprompt

# Create client truststore
echo "Creating client truststore..."
keytool -keystore kafka.client.truststore.jks -alias CARoot -import -file ca-cert -storepass "$PASSWORD" -noprompt -storetype PKCS12

# Create credential files for Kafka broker
echo "$PASSWORD" > keystore_creds
echo "$PASSWORD" > key_creds
echo "$PASSWORD" > truststore_creds

# Create client properties file for SSL connections
cat > client-ssl.properties << EOF
security.protocol=SSL
ssl.truststore.location=/etc/kafka/secrets/kafka.client.truststore.jks
ssl.truststore.password=$PASSWORD
ssl.keystore.location=/etc/kafka/secrets/kafka.client.keystore.jks
ssl.keystore.password=$PASSWORD
ssl.key.password=$PASSWORD
EOF

# Export client certificates for use in applications
echo "Exporting client certificates..."
keytool -exportcert -alias client -keystore kafka.client.keystore.jks -rfc -file client.pem -storepass "$PASSWORD"
openssl pkcs12 -in kafka.client.keystore.jks -nodes -nocerts -out client-key.pem -passin "pass:$PASSWORD"

# Clean up intermediate files
rm -f cert-file cert-signed client-cert-file client-cert-signed ca-key.srl

echo ""
echo "SSL certificates generated successfully!"
echo ""
echo "Files created in $CERTS_DIR:"
echo "  - kafka.server.keystore.jks    (Server keystore)"
echo "  - kafka.server.truststore.jks  (Server truststore)"
echo "  - kafka.client.keystore.jks    (Client keystore)"
echo "  - kafka.client.truststore.jks  (Client truststore)"
echo "  - ca-cert                      (CA certificate)"
echo "  - client.pem                   (Client certificate)"
echo "  - client-key.pem               (Client private key)"
echo ""
echo "Password for all keystores: $PASSWORD"
