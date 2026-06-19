#!/bin/bash
set -e

# =============================================================================
# AI Engineering Room — VPS Deploy Script
# Usage: ./deploy.sh
# Prerequisites: Docker + Docker Compose installed on VPS
# =============================================================================

echo "🚀 Deploying AI Engineering Room..."

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Install it first:"
    echo "   curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# Check .env exists
if [ ! -f .env ]; then
    echo "📝 No .env file found. Creating from template..."
    cp .env.example .env
    echo "⚠️  Edit .env with your credentials before continuing:"
    echo "   nano .env"
    echo ""
    echo "Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (for Bedrock)"
    echo "Then re-run: ./deploy.sh"
    exit 1
fi

# Create certs directory (for HTTPS later)
mkdir -p certs

# Build and start
echo "🔨 Building Docker image..."
docker compose build

echo "📦 Starting services..."
docker compose up -d

# Initialize database
echo "🗄️  Initializing database..."
sleep 3
sudo DATABASE_URL="file:/var/lib/docker/volumes/movistan_app-data/_data/production.db" env "PATH=$PATH" npx prisma db push 2>/dev/null || echo "   (DB already initialized)"

echo ""
echo "✅ Deployed successfully!"
echo ""
echo "   App:    http://$(hostname -I | awk '{print $1}')"
echo "   Logs:   docker compose logs -f"
echo "   Stop:   docker compose down"
echo "   Update: git pull && docker compose up -d --build"
echo ""
echo "📌 For HTTPS:"
echo "   1. Point your domain to this server's IP"
echo "   2. Place certs in ./certs/ (fullchain.pem + privkey.pem)"
echo "   3. Uncomment HTTPS block in nginx.conf"
echo "   4. docker compose restart nginx"
