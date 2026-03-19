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

# Run Django with Gunicorn
CMD ["gunicorn", "spatialhub_backend.wsgi:application", "--bind", "0.0.0.0:8080"]
