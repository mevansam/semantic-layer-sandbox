# Semantic Studio as a local container: the static site plus the read-only SPARQL endpoint.
# Built by `make studio-docker`, which first exports the data into build/site/data (this image does not read
# the repositories; it packages that export).
#   docker build -t semantic-studio semantic-studio && docker run --rm -p 8787:8787 semantic-studio

# ---- 1. build the site (Node) ----
FROM node:22-alpine AS app
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY build.mjs tsconfig.json ./
COPY public ./public
COPY src ./src
RUN node build.mjs

# ---- 2. serve it (Python + rdflib) ----
FROM python:3.12-slim
RUN pip install --no-cache-dir "rdflib>=7.1,<8" \
 && useradd --create-home --uid 10001 studio
WORKDIR /studio
COPY server/studio_server.py ./server/
COPY --from=app /app/build/site ./site
COPY build/site/data ./site/data
USER studio
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/config.json')"
CMD ["python", "server/studio_server.py", "--site", "/studio/site", "--host", "0.0.0.0", "--port", "8787"]
