#!/bin/bash
# ============================================
# DemandPlanner — Linux Production Deploy Script
# ============================================
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh              # Full deploy (build + start)
#   ./deploy.sh --no-build   # Start without rebuilding
#   ./deploy.sh --restart    # Restart all services
#   ./deploy.sh --stop       # Stop all services
#   ./deploy.sh --logs       # Tail logs
#   ./deploy.sh --status     # Show service status
# ============================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}  ✓ $1${NC}"; }
log_warn()  { echo -e "${YELLOW}  ⚠ $1${NC}"; }
log_error() { echo -e "${RED}  ✗ $1${NC}"; }
log_step()  { echo -e "\n${CYAN}[$1] $2${NC}"; }

# ──────────────────────────────────────────
# Handle command-line flags
# ──────────────────────────────────────────
case "${1:-}" in
  --stop)
    echo -e "${YELLOW}Stopping all services...${NC}"
    docker compose -f "$COMPOSE_FILE" down
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
    ;;
  --restart)
    echo -e "${YELLOW}Restarting all services...${NC}"
    docker compose -f "$COMPOSE_FILE" restart
    echo -e "${GREEN}All services restarted.${NC}"
    exit 0
    ;;
  --logs)
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100
    exit 0
    ;;
  --status)
    docker compose -f "$COMPOSE_FILE" ps
    exit 0
    ;;
esac

NO_BUILD=false
if [ "${1:-}" = "--no-build" ]; then
  NO_BUILD=true
fi

echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}  DemandPlanner Production Deployment        ${NC}"
echo -e "${GREEN}=============================================${NC}"

# ──────────────────────────────────────────
# Step 1: Pre-flight checks
# ──────────────────────────────────────────
log_step "1/6" "Pre-flight checks..."

if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed."
    echo "  Install with: curl -fsSL https://get.docker.com | sh"
    echo "  Then:         sudo usermod -aG docker \$USER && newgrp docker"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    log_error "Docker Compose V2 is not available."
    echo "  Install with: sudo apt install docker-compose-plugin"
    exit 1
fi

if [ ! -f .env ]; then
    log_error ".env file not found."
    echo "  Create it from the example:"
    echo "    cp .env.production.example .env"
    echo "    nano .env"
    exit 1
fi

# Validate required env vars
source .env
if [[ -z "${MYSQL_PASSWORD:-}" ]] || [[ "${MYSQL_PASSWORD}" == *"CHANGE_ME"* ]]; then
    log_error "MYSQL_PASSWORD is not set in .env"
    exit 1
fi
if [[ -z "${SECRET_KEY:-}" ]] || [[ "${SECRET_KEY}" == *"CHANGE_ME"* ]]; then
    log_error "SECRET_KEY is not set in .env"
    echo "  Generate one with: openssl rand -hex 64"
    exit 1
fi
if [[ -z "${NEXT_PUBLIC_API_URL:-}" ]] || [[ "${NEXT_PUBLIC_API_URL}" == *"YOUR_SERVER"* ]]; then
    log_error "NEXT_PUBLIC_API_URL is not set in .env"
    echo "  Set it to: http://YOUR_SERVER_IP/api"
    exit 1
fi

log_info "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"
log_info "Compose $(docker compose version --short)"
log_info ".env validated"

# ──────────────────────────────────────────
# Step 2: Check MySQL connectivity
# ──────────────────────────────────────────
log_step "2/6" "Testing MySQL connection..."

MYSQL_HOST_VAL="${MYSQL_HOST:-192.168.30.91}"
MYSQL_PORT_VAL="${MYSQL_PORT:-3386}"

if timeout 5 bash -c "echo > /dev/tcp/$MYSQL_HOST_VAL/$MYSQL_PORT_VAL" 2>/dev/null; then
    log_info "MySQL reachable at $MYSQL_HOST_VAL:$MYSQL_PORT_VAL"
else
    log_warn "Cannot reach MySQL at $MYSQL_HOST_VAL:$MYSQL_PORT_VAL — continuing anyway"
fi

# ──────────────────────────────────────────
# Step 3: Prepare directories
# ──────────────────────────────────────────
log_step "3/6" "Preparing directories..."

mkdir -p nginx/ssl
log_info "nginx/ssl directory ready"

# ──────────────────────────────────────────
# Step 4: Build images
# ──────────────────────────────────────────
if [ "$NO_BUILD" = true ]; then
    log_step "4/6" "Skipping build (--no-build)..."
else
    log_step "4/6" "Building Docker images (this may take several minutes)..."
    docker compose -f "$COMPOSE_FILE" build --parallel
    log_info "All images built successfully"
fi

# ──────────────────────────────────────────
# Step 5: Start services
# ──────────────────────────────────────────
log_step "5/6" "Starting services..."

# Stop existing containers gracefully
docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true

# Start fresh
docker compose -f "$COMPOSE_FILE" up -d

log_info "Services started"

# ──────────────────────────────────────────
# Step 6: Verify deployment
# ──────────────────────────────────────────
log_step "6/6" "Verifying deployment..."

echo "  Waiting for services to become healthy..."
sleep 15

SERVICES=("dp-redis" "dp-backend" "dp-celery" "dp-frontend" "dp-nginx")
ALL_OK=true

for SERVICE in "${SERVICES[@]}"; do
    STATUS=$(docker inspect --format='{{.State.Status}}' "$SERVICE" 2>/dev/null || echo "not found")
    HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$SERVICE" 2>/dev/null || echo "n/a")

    if [ "$STATUS" == "running" ]; then
        if [ "$HEALTH" == "healthy" ] || [ "$HEALTH" == "n/a" ]; then
            log_info "$SERVICE: running ($HEALTH)"
        else
            log_warn "$SERVICE: running but $HEALTH"
        fi
    else
        log_error "$SERVICE: $STATUS"
        ALL_OK=false
    fi
done

# Test API health endpoint
echo ""
echo "  Testing API health endpoint..."
sleep 2
if curl -sf http://localhost/api/health > /dev/null 2>&1; then
    log_info "API health check passed"
else
    log_warn "API health check via Nginx not reachable yet (may need more time)"
fi

echo ""
if [ "$ALL_OK" = true ]; then
    SERVER_IP=$(hostname -I | awk '{print $1}')
    echo -e "${GREEN}=============================================${NC}"
    echo -e "${GREEN}  ✓ Deployment successful!                   ${NC}"
    echo -e "${GREEN}=============================================${NC}"
    echo ""
    echo -e "  ${CYAN}Application:${NC}  http://$SERVER_IP"
    echo -e "  ${CYAN}API Health:${NC}   http://$SERVER_IP/api/health"
    echo ""
    echo -e "  ${YELLOW}Useful commands:${NC}"
    echo "    View logs:     ./deploy.sh --logs"
    echo "    Status:        ./deploy.sh --status"
    echo "    Restart:       ./deploy.sh --restart"
    echo "    Stop:          ./deploy.sh --stop"
    echo "    Rebuild:       ./deploy.sh"
    echo "    No-build:      ./deploy.sh --no-build"
    echo ""
    echo "    Backend logs:  docker compose -f $COMPOSE_FILE logs -f backend"
    echo "    DB backup:     mysqldump -h $MYSQL_HOST_VAL -P $MYSQL_PORT_VAL -u ${MYSQL_USER:-planner} -p ${MYSQL_DB:-demandplanner} > backup_\$(date +%Y%m%d).sql"
else
    echo -e "${RED}=============================================${NC}"
    echo -e "${RED}  ✗ Some services failed to start            ${NC}"
    echo -e "${RED}=============================================${NC}"
    echo ""
    echo "  Check logs:  docker compose -f $COMPOSE_FILE logs"
    echo "  Check ps:    docker compose -f $COMPOSE_FILE ps"
    exit 1
fi
