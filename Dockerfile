# Use official Python slim image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set working directory
WORKDIR /app

# Copy only django_backend (NOT everything)
COPY django_backend/ .

# Install dependencies
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# collectstatic needs no DB -- USE_SQLITE=1 prevents Django from checking PostgreSQL during build
ENV USE_SQLITE=1
RUN python manage.py collectstatic --noinput
ENV USE_SQLITE=0

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Run Django with Gunicorn.
# Threaded workers (gthread) + no request timeout are required for the survival
# SSE endpoint: a sync worker would buffer/block and the default 30s timeout
# would kill a long-running stream mid-run.
#
# SINGLE worker (--workers 1) is REQUIRED, not just a single Cloud Run instance:
# the survival relay (sensor_data/survival/relay.py) keeps the live SSE snapshot,
# the decision-log buffer, the web->pilot command slot, and the habitat-plan slot
# in PROCESS memory. With >1 worker those land on different processes, so /ingest
# writes and /live reads (and poll_command vs new_session) split across workers and
# silently lose state. The --threads pool must comfortably exceed the number of
# concurrent /live SSE viewers: each open browser pins one thread for the life of
# the connection. At only 8 threads, >8 tabs/reconnects exhaust the pool, requests
# pile up against Cloud Run's concurrency cap, and the instance 429s EVERYTHING
# (ingest + reads), freezing the dashboard. 64 leaves ample headroom; idle SSE
# threads block on a Condition and cost almost nothing.
# The durable decision archive (Postgres) stays correct regardless.
CMD ["gunicorn", "spatialhub_backend.wsgi:application", \
     "--bind", "0.0.0.0:8080", \
     "--worker-class", "gthread", \
     "--workers", "1", \
     "--threads", "64", \
     "--timeout", "0"]
