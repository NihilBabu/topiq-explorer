# Topiq Explorer Testing Guide

This guide covers how to test Topiq Explorer with different authentication methods using Docker.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ for running the application
- OpenSSL and Java keytool (for SSL certificate generation)

## Quick Start

### 1. Start Kafka Brokers

```bash
cd docker
docker-compose up -d
```

This will start:
- **Zookeeper** on port 2181
- **kafka-plain** on port 9092 (no authentication)
- **kafka-sasl-plain** on port 9093 (SASL/PLAIN authentication)
- **kafka-sasl-scram** on port 9094 (SCRAM-SHA-256 authentication)
- **kafka-ssl** on port 9095 (SSL/TLS - requires certificate setup)

### 2. Verify Services Are Running

```bash
docker-compose ps
```

All services should show as "healthy" or "running".

## Connection Configurations

### No Authentication (Plain)

| Setting | Value |
|---------|-------|
| Bootstrap Servers | `localhost:9092` |
| SSL | Disabled |
| Authentication | None |

### SASL/PLAIN Authentication

| Setting | Value |
|---------|-------|
| Bootstrap Servers | `localhost:9093` |
| SSL | Disabled |
| Authentication | SASL |
| SASL Mechanism | PLAIN |
| Username | `admin` |
| Password | `admin-secret` |

Alternative user:
- Username: `client`
- Password: `client-secret`

### SCRAM-SHA-256 Authentication

| Setting | Value |
|---------|-------|
| Bootstrap Servers | `localhost:9094` |
| SSL | Disabled |
| Authentication | SASL |
| SASL Mechanism | SCRAM-SHA-256 |
| Username | `admin` |
| Password | `admin-secret` |

Alternative user:
- Username: `client`
- Password: `client-secret`

### SSL/TLS Authentication

Before using SSL, you must generate certificates:

```bash
cd docker/scripts
./generate-certs.sh
```

| Setting | Value |
|---------|-------|
| Bootstrap Servers | `localhost:9095` |
| SSL | Enabled |
| Authentication | None (or mTLS) |

Certificate files are generated in `docker/certs/`:
- `ca-cert` - CA certificate
- `kafka.client.keystore.jks` - Client keystore
- `kafka.client.truststore.jks` - Client truststore
- `client.pem` - Client certificate (PEM format)
- `client-key.pem` - Client private key (PEM format)

Keystore password: `topiq-explorer`

## Testing Procedures

### Test 1: Basic Connectivity

1. Start the application: `npm run dev`
2. Create a new connection with the "No Authentication" settings
3. Click "Test Connection" - should show success
4. Click "Connect" - should connect and list topics

### Test 2: Topic Operations

1. Connect to any broker
2. Create a new topic:
   - Name: `test-topic`
   - Partitions: 3
   - Replication Factor: 1
3. Verify topic appears in the list
4. Click on the topic to view details
5. Verify partitions tab shows 3 partitions
6. Delete the topic

### Test 3: Message Production and Consumption

1. Create a topic named `message-test`
2. Click "Produce Message"
3. Enter test message:
   ```json
   {"hello": "world", "timestamp": 1234567890}
   ```
4. Send the message
5. Refresh messages view
6. Verify message appears with correct JSON formatting

### Test 4: Consumer Groups

1. Start an external consumer (or use Kafka CLI):
   ```bash
   docker exec topiq-explorer-plain kafka-console-consumer \
     --bootstrap-server localhost:9092 \
     --topic test-topic \
     --group test-group \
     --from-beginning
   ```
2. Navigate to Consumer Groups in the app
3. Verify `test-group` appears
4. Click on the group to view details
5. Check offset information and lag

### Test 5: SASL Authentication

1. Create a new connection with SASL/PLAIN settings
2. Test with correct credentials - should succeed
3. Test with wrong password - should fail with authentication error
4. Connect and verify all operations work

### Test 6: SCRAM Authentication

1. Wait for SCRAM users to be created (check docker logs):
   ```bash
   docker logs topiq-explorer-scram-init
   ```
2. Create a new connection with SCRAM-SHA-256 settings
3. Test connection - should succeed
4. Verify topic listing works

### Test 7: SSL/TLS (Advanced)

1. Generate certificates: `./docker/scripts/generate-certs.sh`
2. Restart the SSL broker: `docker-compose restart kafka-ssl`
3. Configure connection with SSL enabled
4. Provide certificate paths (implementation depends on app SSL support)

## Troubleshooting

### Connection Refused

```bash
# Check if Kafka is running
docker-compose ps

# Check Kafka logs
docker logs topiq-explorer-plain
```

### Authentication Failed

```bash
# For SASL/PLAIN, check JAAS config
docker exec topiq-explorer-sasl-plain cat /etc/kafka/kafka_server_jaas.conf

# For SCRAM, verify users were created
docker logs topiq-explorer-scram-init
```

### SSL Handshake Failed

```bash
# Regenerate certificates
rm -rf docker/certs
./docker/scripts/generate-certs.sh
docker-compose restart kafka-ssl
```

## Cleanup

```bash
# Stop all containers
cd docker
docker-compose down

# Remove all data (including Kafka data)
docker-compose down -v

# Remove certificates
rm -rf docker/certs
```

## Test Data Generation

To generate test data for load testing:

```bash
# Produce 1000 messages to a topic
docker exec topiq-explorer-plain bash -c '
  for i in $(seq 1 1000); do
    echo "{\"id\": $i, \"message\": \"Test message $i\"}"
  done | kafka-console-producer --bootstrap-server localhost:9092 --topic load-test
'
```

## Docker Resource Requirements

Minimum recommended resources:
- CPU: 2 cores
- Memory: 4GB RAM
- Disk: 2GB free space

For all services running simultaneously, consider:
- CPU: 4 cores
- Memory: 8GB RAM
