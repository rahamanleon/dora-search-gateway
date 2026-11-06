# SearXNG Container for Google Cloud Run
FROM searxng/searxng:2025.2.22-3715d0ec3

USER root

# Copy Cloud Run optimized settings
COPY settings-cloudrun.yml /etc/searxng/settings.yml

# Ensure SearXNG directory permissions
RUN chown -R searxng:searxng /etc/searxng

USER searxng

# Cloud Run defaults to 8080
EXPOSE 8080

CMD ["/usr/local/searxng/docker-entrypoint.sh"]

