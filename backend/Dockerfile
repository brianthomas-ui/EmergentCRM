# Backend image for LOCAL/off-platform runs.
# Installs requirements EXCEPT the proprietary emergentintegrations, then installs
# the local dev shim in its place. requirements.txt is left untouched (round-trip safe).
FROM python:3.11-slim

WORKDIR /app

# System deps occasionally needed by pandas/numpy wheels; slim usually has wheels.
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
# Strip the Emergent-only package (not on public PyPI) before installing.
RUN grep -v -i '^emergentintegrations' /app/backend/requirements.txt > /tmp/requirements.local.txt \
    && pip install --no-cache-dir -r /tmp/requirements.local.txt

# Install the drop-in shim that satisfies `import emergentintegrations`.
COPY tools/dev-shims/emergentintegrations /app/tools/dev-shims/emergentintegrations
RUN pip install --no-cache-dir -e /app/tools/dev-shims/emergentintegrations

COPY backend /app/backend
WORKDIR /app/backend

EXPOSE 8001
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
