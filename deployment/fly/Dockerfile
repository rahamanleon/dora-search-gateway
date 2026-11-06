# SearXNG Container for Fly.io Free Tier (Memory-Optimized)
FROM searxng/searxng:2025.2.22-3715d0ec3

USER root

# Copy Fly.io-optimized settings (256MB RAM budget)
COPY ./settings-fly.yml /etc/searxng/settings.yml

RUN chown -R searxng:searxng /etc/searxng

USER searxng

EXPOSE 8080

CMD ["/usr/local/searxng/docker-entrypoint.sh"]
