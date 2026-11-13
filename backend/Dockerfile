FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=wsgi.py \
    DATA_DIR=/app/data

RUN useradd --create-home --uid 1000 appuser
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser mealplanner ./mealplanner
COPY --chown=appuser:appuser migrations ./migrations
COPY --chown=appuser:appuser wsgi.py entrypoint.sh ./
RUN chmod +x entrypoint.sh && mkdir -p /app/data && chown appuser:appuser /app/data

USER appuser
EXPOSE 8000
VOLUME /app/data

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)"

ENTRYPOINT ["./entrypoint.sh"]
# SQLite + several writers is fine with WAL, but keep the worker count small.
# Recipe imports fetch a page and an image from other sites, which can take a while.
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "90", "wsgi:app"]
