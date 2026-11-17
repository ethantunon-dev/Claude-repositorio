# Servidor estático local para las pruebas (tipos MIME correctos para .mjs y .webmanifest).
import http.server, functools, sys
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json'}
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache'); super().end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', 8080), functools.partial(H, directory=sys.argv[1] if len(sys.argv) > 1 else __import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.abspath(__file__))))).serve_forever()
