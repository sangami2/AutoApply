# Docker Setup Guide - Complete Integration

## Quick Start (5 minutes)

### Prerequisites
```bash
# Check if Docker is installed
docker --version     # Should be Docker 20+
docker-compose --version  # Should be 1.29+

# If not installed:
# Visit https://www.docker.com/products/docker-desktop
```

### Start All Services
```bash
cd /Users/akashsangami/AutoApply

# Start PostgreSQL, Redis, and pgAdmin
./scripts/docker-setup.sh up

# Wait for healthy status
./scripts/docker-setup.sh health
```

That's it! Services are now running.

---

## What Gets Started

### 1. **PostgreSQL 16** (Database)
- Port: 5432
- Database: `job_copilot`
- Username: `job_copilot`
- Password: (in `.env`)
- Volume: `postgres_data` (persists between restarts)

### 2. **Redis 7** (Cache & Queue)
- Port: 6379
- Password: (in `.env`)
- Volume: `redis_data` (persists between restarts)

### 3. **pgAdmin 4** (Database GUI - Optional)
- Port: 5050
- URL: http://localhost:5050
- Email: `admin@example.com` (in `.env`)
- Password: `admin` (in `.env`)

---

## Docker Commands

### Service Management
```bash
# Start services
./scripts/docker-setup.sh up

# Stop services
./scripts/docker-setup.sh down

# Restart services
./scripts/docker-setup.sh restart

# Reset services (DELETE all data)
./scripts/docker-setup.sh reset
```

### Monitoring
```bash
# Check service health
./scripts/docker-setup.sh health

# View logs (all services)
./scripts/docker-setup.sh logs

# View logs (specific service)
./scripts/docker-setup.sh logs postgres
./scripts/docker-setup.sh logs redis

# Monitor resource usage
./scripts/docker-setup.sh stats
```

### Database Access
```bash
# Connect to PostgreSQL shell
./scripts/docker-setup.sh shell postgres

# Connect to Redis shell
./scripts/docker-setup.sh shell redis
```

### Backup & Restore
```bash
# Create backup
./scripts/docker-setup.sh backup
# Creates: backup-20260713_120000.sql

# Restore from backup
./scripts/docker-setup.sh restore backup-20260713_120000.sql
```

### Cleanup
```bash
# Clean up unused Docker resources
./scripts/docker-setup.sh clean

# Show Docker version info
./scripts/docker-setup.sh version
```

---

## Docker Directory Structure

```
docker-compose.yml          ← Main Docker configuration
scripts/
├── docker-setup.sh         ← Docker management script
├── init-postgres.sql       ← Database initialization
├── test-db.mjs             ← Database connectivity test
└── ...
```

---

## Configuration Files

### `.env` File
```bash
# PostgreSQL
POSTGRES_DB=job_copilot
POSTGRES_USER=job_copilot
POSTGRES_PASSWORD=secure_password_change_me
POSTGRES_PORT=5432

# Redis
REDIS_PASSWORD=redis_password_change_me
REDIS_PORT=6379

# pgAdmin
PGADMIN_EMAIL=admin@example.com
PGADMIN_PASSWORD=admin
PGADMIN_PORT=5050

# Connection strings (auto-generated from above)
DATABASE_URL=postgresql://job_copilot:secure_password_change_me@localhost:5432/job_copilot
REDIS_URL=redis://:redis_password_change_me@localhost:6379/0
```

### `docker-compose.yml` Features
- ✓ Health checks (auto-restart if unhealthy)
- ✓ Persistent volumes (data survives restart)
- ✓ Network isolation (services can communicate)
- ✓ Logging configuration (limited log size)
- ✓ Environment variables (configurable)
- ✓ pgAdmin included (optional database GUI)

---

## Common Issues & Solutions

### Docker Daemon Not Running
```bash
# Error: Cannot connect to Docker daemon

# Solution: Start Docker Desktop app (macOS/Windows)
# Or on Linux:
sudo systemctl start docker
```

### Port Already in Use
```bash
# Error: bind: address already in use

# Find what's using the port:
lsof -i :5432   # PostgreSQL
lsof -i :6379   # Redis
lsof -i :5050   # pgAdmin

# Kill the process:
kill -9 <PID>

# Or use different ports in .env:
POSTGRES_PORT=5433
REDIS_PORT=6380
PGADMIN_PORT=5051
```

### Services Not Starting
```bash
# Check logs:
./scripts/docker-setup.sh logs

# Check specific service:
./scripts/docker-setup.sh logs postgres

# Reset and try again:
./scripts/docker-setup.sh reset
./scripts/docker-setup.sh up
```

### Database Connection Failed
```bash
# Check if PostgreSQL is healthy:
./scripts/docker-setup.sh health

# Try connecting directly:
./scripts/docker-setup.sh shell postgres

# Check connection string in .env:
cat .env | grep DATABASE_URL

# Verify database exists:
./scripts/docker-setup.sh shell postgres -c "\\l"
```

### Out of Disk Space
```bash
# Docker containers can use a lot of space

# Check usage:
docker system df

# Clean up unused resources:
./scripts/docker-setup.sh clean

# Remove all containers and start fresh:
./scripts/docker-setup.sh reset
```

### High Memory Usage
```bash
# Check resource usage:
./scripts/docker-setup.sh stats

# Limit memory in docker-compose.yml:
# Add under service:
# deploy:
#   resources:
#     limits:
#       memory: 2G
```

---

## Integration with Application

### Database Migrations
```bash
# After services start, run migrations:
npm run db:migrate
```

### Run Tests
```bash
# Test database connectivity:
npm run test:db

# Test health of all services:
./scripts/docker-setup.sh health
```

### Full Pipeline
```bash
# Services must be running first:
./scripts/docker-setup.sh health

# Then execute pipeline:
npm run pipeline
```

---

## Production Considerations

### Security
```bash
# IMPORTANT: Change default passwords in .env
POSTGRES_PASSWORD=your_secure_random_password_here
REDIS_PASSWORD=your_secure_random_password_here
PGADMIN_PASSWORD=your_secure_random_password_here

# Use strong passwords (min 32 characters, mix of types)
```

### Backups
```bash
# Automated daily backup script
./scripts/docker-setup.sh backup

# Schedule with cron (Linux/macOS):
# 0 2 * * * /path/to/scripts/docker-setup.sh backup
```

### Monitoring
```bash
# Monitor services continuously:
./scripts/docker-setup.sh stats

# Alert on unhealthy services:
./scripts/docker-setup.sh health

# View logs for errors:
./scripts/docker-setup.sh logs | grep ERROR
```

### Scaling
```bash
# Increase database connections in .env:
# max_connections = 200

# Increase Redis memory limit:
# Add to docker-compose.yml:
# command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru
```

---

## Network & Connectivity

### Service-to-Service Communication
Services can communicate via Docker network:
- PostgreSQL: `postgres:5432` (from other containers)
- Redis: `redis:6379` (from other containers)

### External Access
Services accessible from host machine:
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- pgAdmin: `http://localhost:5050`

### Custom Network
All services on `job-copilot-network` (defined in docker-compose.yml)

---

## Debugging

### View Container Logs
```bash
# Real-time logs:
docker-compose logs -f

# Last 100 lines:
docker-compose logs --tail=100

# Specific service:
docker-compose logs postgres
```

### Check Container Status
```bash
docker-compose ps

# Shows: Container name, status, ports, volumes
```

### Inspect Container
```bash
docker-compose exec postgres bash
# Now inside container - can run any command

# Exit:
exit
```

### Database Inspection
```bash
# Connect to psql:
./scripts/docker-setup.sh shell postgres

# List databases:
\l

# List tables:
\dt

# Describe table:
\d table_name

# Run query:
SELECT * FROM table_name LIMIT 10;

# Exit:
\q
```

---

## Performance Tips

### Optimize PostgreSQL
```bash
# In docker-compose.yml under postgres environment:
POSTGRES_INIT_ARGS: >
  --shared_buffers=256MB
  --effective_cache_size=1GB
  --work_mem=64MB
  --random_page_cost=1.1
```

### Optimize Redis
```bash
# Increase max memory:
command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru

# Enable persistence:
command: redis-server --appendonly yes --appendfsync everysec
```

### Volume Performance
```bash
# Use named volumes (faster than bind mounts):
volumes:
  postgres_data:
    driver: local
    driver_opts:
      type: tmpfs
      device: tmpfs
```

---

## Troubleshooting Checklist

- [ ] Docker Desktop is running
- [ ] `docker ps` shows containers
- [ ] `./scripts/docker-setup.sh health` all green
- [ ] `.env` file configured correctly
- [ ] Database migrations run: `npm run db:migrate`
- [ ] Can connect to PostgreSQL: `./scripts/docker-setup.sh shell postgres`
- [ ] Can connect to Redis: `./scripts/docker-setup.sh shell redis`
- [ ] Logs show no errors: `./scripts/docker-setup.sh logs`
- [ ] Sufficient disk space: `docker system df`
- [ ] Sufficient memory: `./scripts/docker-setup.sh stats`

---

## Advanced: Manual Docker Commands

If you prefer raw Docker commands:

```bash
# Build images
docker-compose build

# Start in foreground (see logs)
docker-compose up

# Start in background
docker-compose up -d

# Stop all services
docker-compose stop

# Stop and remove containers
docker-compose down

# View running containers
docker ps

# View all containers
docker ps -a

# View logs
docker logs <container-id>

# Execute command in container
docker exec <container-id> <command>

# Inspect container
docker inspect <container-id>

# Remove all unused resources
docker system prune -a
```

---

## Support

For issues:
1. Check logs: `./scripts/docker-setup.sh logs`
2. Check health: `./scripts/docker-setup.sh health`
3. Check Docker is running: `docker ps`
4. Review `.env` configuration
5. Try reset: `./scripts/docker-setup.sh reset`

---

## Next Steps

```bash
# 1. Start services
./scripts/docker-setup.sh up

# 2. Check health
./scripts/docker-setup.sh health

# 3. Run migrations
npm run db:migrate

# 4. Run tests
npm run test:all

# 5. Execute pipeline
npm run pipeline
```

You're all set! Docker is fully integrated and ready to go.
