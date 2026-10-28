"""Serve the web UI and proxy chat requests to a local Ollama server.

Usage: python3 server.py [--port 8000] [--ollama http://localhost:11434]
"""
import argparse
import http.server
import json
import os
import urllib.error
import urllib.request

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")


def make_handler(ollama_url):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=WEB_DIR, **kwargs)

        def do_GET(self):
            if self.path == "/api/tags":
                return self._proxy("GET", "/api/tags")
            return super().do_GET()

        def do_POST(self):
            if self.path == "/api/chat":
                length = int(self.headers.get("Content-Length", 0))
                return self._proxy("POST", "/api/chat", self.rfile.read(length))
            self.send_error(404)

        def _proxy(self, method, path, body=None):
            req = urllib.request.Request(
                ollama_url + path, data=body, method=method,
                headers={"Content-Type": "application/json"},
            )
            try:
                with urllib.request.urlopen(req) as resp:
                    self.send_response(resp.status)
                    self.send_header("Content-Type", "application/x-ndjson")
                    self.end_headers()
                    # Stream Ollama's newline-delimited JSON straight through.
                    for line in resp:
                        self.wfile.write(line)
                        self.wfile.flush()
            except (urllib.error.URLError, ConnectionError) as e:
                msg = json.dumps({"error": f"Could not reach Ollama at {ollama_url}: {e}"})
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(msg.encode())

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--ollama", default=os.environ.get("OLLAMA_URL", "http://localhost:11434"))
    args = parser.parse_args()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(args.ollama.rstrip("/")))
    print(f"Kindred running at http://localhost:{args.port}  (model server: {args.ollama})")
    server.serve_forever()


if __name__ == "__main__":
    main()
