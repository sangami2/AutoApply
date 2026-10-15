#!/bin/bash

###############################################################################
# Docker Setup & Management Script
# Sets up PostgreSQL, Redis, and pgAdmin containers
# Includes health checks, logging, and troubleshooting
###############################################################################

set -e

BOLD='\033[1m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
RESET='\033[0m'

function print_header() {
  echo -e "${BOLD}${BLUE}$1${RESET}"
}

function print_success() {
  echo -e "${GREEN}✓ $1${RESET}"
}

function print_error() {
  echo -e "${RED}✗ $1${RESET}"
}

function print_warning() {
  echo -e "${YELLOW}⚠ $1${RESET}"
}

# ============================================================================
# MAIN COMMANDS
# ============================================================================

case "${1:-help}" in

  up)
    print_header "Starting Docker Services..."
    echo ""

    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
      print_error "Docker is not installed"
      echo "Visit: https://www.docker.com/products/docker-desktop"
      exit 1
    fi
    print_success "Docker found: $(docker --version)"

    if ! command -v docker-compose &> /dev/null; then
      print_error "Docker Compose is not installed"
      exit 1
    fi
    print_success "Docker Compose found: $(docker-compose --version)"

    # Check if services are already running
    if docker-compose ps | grep -q "Up"; then
      print_warning "Services already running. Skipping startup."
      docker-compose ps
      exit 0
    fi

    # Start services
    echo ""
    print_header "Starting containers..."
    docker-compose up -d

    # Wait for services
    echo ""
    print_header "Waiting for services to be ready..."
    sleep 10

    # Check health
    echo ""
    bash "$0" health

    print_success "Services started successfully!"
    echo ""
    print_header "Service URLs:"
    echo "  PostgreSQL:   postgresql://localhost:5432"
    echo "  Redis:        redis://localhost:6379"
    echo "  pgAdmin:      http://localhost:5050"
    echo ""
    echo "Credentials are in .env file"
    ;;

  down)
    print_header "Stopping Docker Services..."
    echo ""

    docker-compose down
    print_success "Services stopped"
    ;;

  restart)
    print_header "Restarting Docker Services..."
    echo ""

    bash "$0" down
    sleep 5
    bash "$0" up
    ;;

  reset)
    print_header "Resetting Docker Services (removing all data)..."
    echo ""
    print_warning "This will DELETE all databases and data!"
    read -p "Are you sure? (type 'yes' to confirm): " confirm

    if [ "$confirm" != "yes" ]; then
      echo "Cancelled"
      exit 0
    fi

    docker-compose down -v
    print_success "Services reset - all data removed"
    ;;

  health)
    print_header "Docker Health Check"
    echo ""

    echo "Containers:"
    docker-compose ps

    echo ""
    echo "Service Status:"

    # PostgreSQL check
    if docker-compose exec -T postgres pg_isready -U job_copilot > /dev/null 2>&1; then
      print_success "PostgreSQL is healthy"
    else
      print_error "PostgreSQL is not responding"
    fi

    # Redis check
    if docker-compose exec -T redis redis-cli -a redis_password_change_me ping > /dev/null 2>&1; then
      print_success "Redis is healthy"
    else
      print_error "Redis is not responding"
    fi

    # pgAdmin check
    if docker-compose exec -T pgadmin curl -s http://localhost/misc/ping > /dev/null 2>&1; then
      print_success "pgAdmin is healthy"
    else
      print_warning "pgAdmin not yet ready (may be starting)"
    fi
    ;;

  logs)
    service="${2:-all}"

    if [ "$service" = "all" ]; then
      print_header "All Container Logs"
      docker-compose logs -f
    else
      print_header "Logs for: $service"
      docker-compose logs -f "$service"
    fi
    ;;

  shell)
    service="${2:-postgres}"

    case "$service" in
      postgres)
        print_header "Connecting to PostgreSQL..."
        docker-compose exec postgres psql -U job_copilot job_copilot
        ;;
      redis)
        print_header "Connecting to Redis..."
        docker-compose exec redis redis-cli -a redis_password_change_me
        ;;
      *)
        print_error "Unknown service: $service"
        echo "Available: postgres, redis"
        exit 1
        ;;
    esac
    ;;

  backup)
    timestamp=$(date +%Y%m%d_%H%M%S)
    backup_file="backup-${timestamp}.sql"

    print_header "Backing up PostgreSQL database..."

    docker-compose exec -T postgres pg_dump \
      -U job_copilot \
      job_copilot > "$backup_file"

    print_success "Backup created: $backup_file"
    ls -lh "$backup_file"
    ;;

  restore)
    backup_file="${2:-.}"

    if [ ! -f "$backup_file" ]; then
      print_error "Backup file not found: $backup_file"
      exit 1
    fi

    print_header "Restoring PostgreSQL database from: $backup_file"
    print_warning "This will overwrite existing data!"
    read -p "Are you sure? (type 'yes' to confirm): " confirm

    if [ "$confirm" != "yes" ]; then
      echo "Cancelled"
      exit 0
    fi

    cat "$backup_file" | docker-compose exec -T postgres psql -U job_copilot job_copilot

    print_success "Database restored"
    ;;

  stats)
    print_header "Docker Resource Usage"
    docker stats job-copilot-postgres job-copilot-redis --no-stream
    ;;

  clean)
    print_header "Cleaning up Docker resources..."

    # Remove dangling volumes
    docker volume prune -f

    # Remove dangling images
    docker image prune -f

    print_success "Cleanup complete"
    ;;

  version)
    echo "Docker CLI: $(docker --version)"
    echo "Docker Compose: $(docker-compose --version)"
    echo "Docker Daemon: $(docker version -f '{{.Server.Version}}')"
    ;;

  help|--help|-h)
    echo ""
    print_header "Docker Management Script - Usage"
    echo ""
    echo "Commands:"
    echo "  ${BOLD}up${RESET}                 Start all services (PostgreSQL, Redis, pgAdmin)"
    echo "  ${BOLD}down${RESET}               Stop all services"
    echo "  ${BOLD}restart${RESET}            Restart all services"
    echo "  ${BOLD}reset${RESET}              Reset services (DELETE all data)"
    echo "  ${BOLD}health${RESET}             Check service health"
    echo "  ${BOLD}logs${RESET} [service]     View container logs (all|postgres|redis|pgadmin)"
    echo "  ${BOLD}shell${RESET}} [service]    Open interactive shell (postgres|redis)"
    echo "  ${BOLD}backup${RESET}             Backup PostgreSQL database"
    echo "  ${BOLD}restore${RESET} <file>     Restore PostgreSQL database"
    echo "  ${BOLD}stats${RESET}              Show resource usage"
    echo "  ${BOLD}clean${RESET}              Clean up Docker resources"
    echo "  ${BOLD}version${RESET}            Show Docker version"
    echo "  ${BOLD}help${RESET}               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 up"
    echo "  $0 logs postgres"
    echo "  $0 shell redis"
    echo "  $0 backup"
    echo ""
    ;;

  *)
    print_error "Unknown command: $1"
    echo "Run '$0 help' for usage information"
    exit 1
    ;;

esac
