# The gateway (wan_api.app). It keeps no state, so it runs fine on Cloud Run, Fly.io, Render
# or similar services that scale to zero.  Build from backend/:  docker build -t wan22-api .
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY wan_api wan_api
ENV PORT=8000
CMD ["sh", "-c", "uvicorn wan_api.app:app --host 0.0.0.0 --port ${PORT}"]
