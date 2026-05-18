#!/bin/bash
# ============================================
# DemandPlanner - Linux Production Deploy Script
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN} DemandPlanner Production Deployment ${NC}"
echo -e "${GREEN}=====================================${NC}"

# --- Pre-flight checks ---
echo -e "\n${YELLOW}[1/5] Pre-flight checks...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}ERROR: Docker is not installed.${NC}"
    echo "  Install with: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo -e "${RED}ERROR: Docker Compose V2 is not available.${NC}"
    echo "  Install with: sudo apt install docker-compose-plugin"
    exit 1
fi

if [ ! -f .env ]; then
    echo -e "${RED}ERROR: .env file not found.${NC}"
    echo "  Copy the example and edit it:"
    echo "    cp .env.production.example .env"
    echo "    nano .env"
    exit 1
fi

# Validate required env vars
source .env
if [[ "$POSTGRES_PASSWORD" == *"CHANGE_ME"* ]] || [[ -z "$POSTGRES_PASSWORD" ]]; then
    echo -e "${RED}ERROR: Please set POSTGRES_PASSWORD in .env${NC}"
    exit 1
fi
if [[ "$SECRET_KEY" == *"CHANGE_ME"* ]] || [[ -z "$SECRET_KEY" ]]; then
    echo -e "${RED}ERROR: Please set SECRET_KEY in .env${NC}"
    echo "  Generate one with: openssl rand -hex 64"
    exit 1
fi

echo -e "${GREEN}  ✓ Docker & Compose found${NC}"
echo -e "${GREEN}  ✓ .env file validated${NC}"

# --- Create SSL directory ---
echo -e "\n${YELLOW}[2/5] Preparing directories...${NC}"
mkdir -p nginx/ssl
echo -e "${GREEN}  ✓ nginx/ssl directory ready${NC}"

# --- Build images ---
echo -e "\n${YELLOW}[3/5] Building Docker images (this may take several minutes)...${NC}"
docker compose -f docker-compose.prod.yml build --no-cache

echo -e "${GREEN}  ✓ Images built successfully${NC}"

# --- Start services ---
echo -e "\n${YELLOW}[4/5] Starting services...${NC}"
docker compose -f docker-compose.prod.yml up -d

echo -e "${GREEN}  ✓ Services started${NC}"

# --- Wait and verify ---
echo -e "\n${YELLOW}[5/5] Verifying deployment...${NC}"
echo "  Waiting for services to become healthy..."
sleep 10

# Check each service
SERVICES=("dp-postgres" "dp-redis" "dp-backend" "dp-celery" "dp-frontend" "dp-nginx")
ALL_OK=true

for SERVICE in "${SERVICES[@]}"; do
    STATUS=$(docker inspect --format='{{.State.Status}}' "$SERVICE" 2>/dev/null || echo "not found")
    if [ "$STATUS" == "running" ]; then
        echo -e "  ${GREEN}✓ $SERVICE: running${NC}"
    else
        echo -e "  ${RED}✗ $SERVICE: $STATUS${NC}"
        ALL_OK=false
    fi
done

echo ""
if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN} ✓ Deployment successful!            ${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo ""
    echo "  Application:  http://$(hostname -I | awk '{print $1}')"
    echo "  API Health:   http://$(hostname -I | awk '{print $1}')/api/health"
    echo ""
    echo "  Useful commands:"
    echo "    View logs:     docker compose -f docker-compose.prod.yml logs -f"
    echo "    Stop:          docker compose -f docker-compose.prod.yml down"
    echo "    Restart:       docker compose -f docker-compose.prod.yml restart"
    echo "    DB backup:     docker exec dp-postgres pg_dump -U dpuser demandplanner > backup.sql"
else
    echo -e "${RED}=====================================${NC}"
    echo -e "${RED} ✗ Some services failed to start     ${NC}"
    echo -e "${RED}=====================================${NC}"
    echo "  Check logs with: docker compose -f docker-compose.prod.yml logs"
    exit 1
fi
