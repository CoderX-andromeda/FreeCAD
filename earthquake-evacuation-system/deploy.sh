#!/bin/bash

# Earthquake Evacuation System Deployment Script
# This script sets up and deploys the complete evacuation system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SYSTEM_NAME="Earthquake Evacuation System"
VERSION="1.0.0"

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check system requirements
check_requirements() {
    print_info "Checking system requirements..."
    
    # Check Docker
    if ! command_exists docker; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command_exists docker-compose; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check Node.js (for local development)
    if command_exists node; then
        NODE_VERSION=$(node --version)
        print_success "Node.js version: $NODE_VERSION"
    else
        print_warning "Node.js not found. Some development features may not work."
    fi
    
    # Check available ports
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null; then
        print_warning "Port 3000 is already in use. Please stop the service using this port."
    fi
    
    print_success "System requirements check completed"
}

# Function to setup environment
setup_environment() {
    print_info "Setting up environment..."
    
    # Create .env file if it doesn't exist
    if [ ! -f .env ]; then
        print_info "Creating .env file from template..."
        cp .env.example .env
        print_warning "Please update the .env file with your configuration before proceeding"
        read -p "Press Enter to continue after updating .env file..."
    fi
    
    # Create necessary directories
    mkdir -p logs uploads backups
    mkdir -p monitoring/grafana/dashboards monitoring/grafana/datasources
    mkdir -p monitoring/logstash/pipeline
    mkdir -p nginx/ssl
    
    print_success "Environment setup completed"
}

# Function to build Docker images
build_images() {
    print_info "Building Docker images..."
    
    # Build backend image
    print_info "Building backend image..."
    docker build -t evacuation-backend:latest -f Dockerfile.backend .
    
    # Build dashboard image
    print_info "Building dashboard image..."
    docker build -t evacuation-dashboard:latest -f dashboard/Dockerfile ./dashboard
    
    # Build worker image
    print_info "Building worker image..."
    docker build -t evacuation-worker:latest -f Dockerfile.worker .
    
    print_success "Docker images built successfully"
}

# Function to start services
start_services() {
    print_info "Starting evacuation system services..."
    
    # Start core services first
    print_info "Starting database and cache services..."
    docker-compose up -d postgres redis
    
    # Wait for database to be ready
    print_info "Waiting for database to be ready..."
    sleep 10
    
    # Start backend services
    print_info "Starting backend services..."
    docker-compose up -d backend worker
    
    # Wait for backend to be ready
    print_info "Waiting for backend to be ready..."
    sleep 15
    
    # Start remaining services
    print_info "Starting dashboard and monitoring services..."
    docker-compose up -d dashboard nginx prometheus grafana
    
    print_success "All services started successfully"
}

# Function to check service health
check_health() {
    print_info "Checking service health..."
    
    # Check if services are running
    if docker-compose ps | grep -q "Up"; then
        print_success "Services are running"
    else
        print_error "Some services are not running properly"
        docker-compose ps
        return 1
    fi
    
    # Check API health endpoint
    print_info "Checking API health..."
    for i in {1..30}; do
        if curl -s http://localhost:3000/health >/dev/null; then
            print_success "API is healthy"
            break
        else
            if [ $i -eq 30 ]; then
                print_error "API health check failed"
                return 1
            fi
            sleep 2
        fi
    done
    
    print_success "Health checks passed"
}

# Function to show service URLs
show_urls() {
    print_info "Service URLs:"
    echo "  🏠 Main Dashboard:     http://localhost:3001"
    echo "  🔧 API Server:        http://localhost:3000"
    echo "  📊 Grafana:           http://localhost:3002 (admin/admin123)"
    echo "  🔍 Prometheus:        http://localhost:9090"
    echo "  📝 Kibana:            http://localhost:5601"
    echo "  🐰 RabbitMQ:          http://localhost:15672 (evacuation/secure_password)"
    echo ""
    print_info "API Documentation: http://localhost:3000/api/docs"
    print_info "System Health: http://localhost:3000/health"
}

# Function to show logs
show_logs() {
    if [ "$1" = "follow" ]; then
        docker-compose logs -f
    else
        docker-compose logs --tail=50
    fi
}

# Function to stop services
stop_services() {
    print_info "Stopping evacuation system services..."
    docker-compose down
    print_success "All services stopped"
}

# Function to clean up
cleanup() {
    print_warning "This will remove all containers, images, and volumes!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Cleaning up..."
        docker-compose down -v --rmi all
        docker system prune -f
        print_success "Cleanup completed"
    else
        print_info "Cleanup cancelled"
    fi
}

# Function to update system
update_system() {
    print_info "Updating evacuation system..."
    
    # Pull latest images
    docker-compose pull
    
    # Rebuild custom images
    build_images
    
    # Restart services
    docker-compose down
    start_services
    
    print_success "System updated successfully"
}

# Function to backup data
backup_data() {
    print_info "Creating system backup..."
    
    BACKUP_FILE="evacuation-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    # Create backup directory
    mkdir -p backups
    
    # Backup database
    docker-compose exec -T postgres pg_dump -U evacuation_user evacuation_db > backups/database-backup.sql
    
    # Create archive
    tar -czf "backups/$BACKUP_FILE" \
        backups/database-backup.sql \
        .env \
        logs/ \
        uploads/ \
        --exclude='logs/*.log'
    
    print_success "Backup created: backups/$BACKUP_FILE"
}

# Function to restore data
restore_data() {
    if [ -z "$1" ]; then
        print_error "Please specify backup file"
        echo "Usage: $0 restore <backup-file>"
        exit 1
    fi
    
    if [ ! -f "$1" ]; then
        print_error "Backup file not found: $1"
        exit 1
    fi
    
    print_warning "This will restore data from backup. Current data will be lost!"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Restoring from backup: $1"
        
        # Extract backup
        tar -xzf "$1"
        
        # Restore database
        docker-compose exec -T postgres psql -U evacuation_user -d evacuation_db < backups/database-backup.sql
        
        print_success "Data restored successfully"
    else
        print_info "Restore cancelled"
    fi
}

# Function to run tests
run_tests() {
    print_info "Running system tests..."
    
    # Backend tests
    print_info "Running backend tests..."
    npm test
    
    # Integration tests
    print_info "Running integration tests..."
    npm run test:integration
    
    print_success "All tests completed"
}

# Function to show status
show_status() {
    print_info "System Status:"
    docker-compose ps
    echo ""
    
    print_info "System Resources:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
    echo ""
    
    print_info "Disk Usage:"
    df -h | grep -E "Size|/dev/"
}

# Main menu
show_help() {
    echo -e "${BLUE}$SYSTEM_NAME v$VERSION${NC}"
    echo "Deployment and Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  setup          Set up environment and requirements"
    echo "  build          Build Docker images"
    echo "  start          Start all services"
    echo "  stop           Stop all services"
    echo "  restart        Restart all services"
    echo "  status         Show system status"
    echo "  logs [follow]  Show logs (optionally follow)"
    echo "  health         Check service health"
    echo "  urls           Show service URLs"
    echo "  update         Update system to latest version"
    echo "  backup         Create system backup"
    echo "  restore FILE   Restore from backup file"
    echo "  test           Run system tests"
    echo "  cleanup        Remove all containers and images"
    echo "  help           Show this help message"
    echo ""
}

# Main script logic
case "$1" in
    setup)
        check_requirements
        setup_environment
        ;;
    build)
        build_images
        ;;
    start)
        check_requirements
        setup_environment
        build_images
        start_services
        check_health
        show_urls
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        start_services
        check_health
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$2"
        ;;
    health)
        check_health
        ;;
    urls)
        show_urls
        ;;
    update)
        update_system
        ;;
    backup)
        backup_data
        ;;
    restore)
        restore_data "$2"
        ;;
    test)
        run_tests
        ;;
    cleanup)
        cleanup
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        if [ -z "$1" ]; then
            show_help
        else
            print_error "Unknown command: $1"
            show_help
            exit 1
        fi
        ;;
esac