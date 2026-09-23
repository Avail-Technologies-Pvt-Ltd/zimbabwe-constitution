# ===================================================================
# Dockerfile - Production Web Server for Zimbabwean Constitution Website
# Optimized Alpine Nginx Image
# ===================================================================

FROM nginx:1.27-alpine

LABEL maintainer="Avail Technologies <info@availtechnologies.co.zw>"
LABEL description="Constitution of Zimbabwe (2013) Mobile-Friendly Web Application"

# Remove default nginx static assets and config
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy application assets
COPY index.html /usr/share/nginx/html/
COPY manifest.json /usr/share/nginx/html/
COPY sw.js /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY data/ /usr/share/nginx/html/data/
COPY icons/ /usr/share/nginx/html/icons/

# Ensure proper permissions
RUN chmod -R 755 /usr/share/nginx/html

# Expose standard HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/index.html || exit 1

# Start Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
