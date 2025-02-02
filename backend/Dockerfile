FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create app user and directory
RUN useradd -m appuser && mkdir /app && chown appuser:appuser /app
USER appuser
WORKDIR /app

# Set up PATH and ensure scripts directory exists
RUN mkdir -p /home/appuser/.local/bin && \
    touch /home/appuser/.local/bin/entrypoint.sh && \
    chmod +x /home/appuser/.local/bin/entrypoint.sh
ENV PATH="/home/appuser/.local/bin:${PATH}"

# Copy requirements first for caching
COPY --chown=appuser:appuser requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Copy application files and entrypoint
COPY --chown=appuser:appuser . .
COPY --chown=appuser:appuser entrypoint.sh /home/appuser/.local/bin/

# Make entrypoint executable
RUN chmod +x /home/appuser/.local/bin/entrypoint.sh

# Configure entrypoint and command
ENTRYPOINT ["entrypoint.sh"]
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "4", "app:app"]