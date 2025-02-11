FROM python:3.11-slim

# Install system dependencies and clean up after
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create app user and set up working directory
RUN useradd -m appuser && mkdir /app && chown appuser:appuser /app
USER appuser
WORKDIR /app

# Set up PATH and ensure scripts directory exists
RUN mkdir -p /home/appuser/.local/bin

ENV PATH="/home/appuser/.local/bin:${PATH}"
# Copy requirements and install dependencies
COPY --chown=appuser:appuser requirements.txt .
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt

# Copy application files and entrypoint
COPY --chown=appuser:appuser . .
COPY --chown=appuser:appuser entrypoint.sh /home/appuser/.local/bin/

# Make entrypoint executable
RUN chmod +x /home/appuser/.local/bin/entrypoint.sh

# Set entrypoint and command
ENTRYPOINT ["/home/appuser/.local/bin/entrypoint.sh"]
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "4", "app:app"]