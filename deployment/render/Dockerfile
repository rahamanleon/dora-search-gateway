# SearXNG Container for Render Free Tier (Memory-Optimized)
FROM searxng/searxng:2025.2.22-3715d0ec3

USER root

# Copy Render-optimized settings (512MB RAM budget)
COPY ./deployment/render/settings-render.yml /etc/searxng/settings.yml

RUN chown -R searxng:searxng /etc/searxng

USER searxng

EXPOSE 8080

CMD ["/usr/local/searxng/docker-entrypoint.sh"]

