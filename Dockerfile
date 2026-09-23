# ===================================================================
# Dockerfile - Production Django Server for Constitution Website
# Uses Python 3.10-slim + Gunicorn + WhiteNoise
# ===================================================================

FROM python:3.10-slim

# Prevent Python from writing .pyc and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV APP_ENV=production

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . /app/

# Collect static files into STATIC_ROOT
RUN python manage.py collectstatic --noinput

# Run migrations on startup or build
RUN python manage.py migrate --noinput

# Expose Django port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health/ || exit 1

# Start Gunicorn WSGI server
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120"]
