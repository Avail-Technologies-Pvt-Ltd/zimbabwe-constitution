"""
Development preview server for the Zimbabwean Constitution Website.
Reads configuration from .env.dev or .env.
Automatically launches default browser when AUTO_OPEN_BROWSER=true.
"""

import http.server
import socketserver
import os
import sys
import webbrowser
import threading
import time

DIRECTORY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_env(env_path):
    config = {
        'PORT': '8000',
        'HOST': '0.0.0.0',
        'APP_ENV': 'development',
        'AUTO_OPEN_BROWSER': 'true'
    }
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    config[k] = v
    return config

# Detect env file
dev_env = os.path.join(DIRECTORY, '.env.dev')
default_env = os.path.join(DIRECTORY, '.env')
target_env = dev_env if os.path.exists(dev_env) else default_env

config = load_env(target_env)
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(config.get('PORT', 8000))
HOST = config.get('HOST', '0.0.0.0')
AUTO_OPEN = config.get('AUTO_OPEN_BROWSER', 'true').lower() == 'true'

class PWAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Service worker header
        if self.path.endswith('sw.js'):
            self.send_header('Service-Worker-Allowed', '/')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        else:
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def guess_type(self, path):
        if path.endswith('.js'):
            return 'application/javascript; charset=utf-8'
        if path.endswith('.json') or path.endswith('.webmanifest'):
            return 'application/json; charset=utf-8'
        if path.endswith('.svg'):
            return 'image/svg+xml'
        return super().guess_type(path)

def open_browser(port):
    time.sleep(1.0)
    url = f"http://localhost:{port}"
    print(f"Launching web browser at {url}...")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Could not open browser automatically: {e}")

if __name__ == '__main__':
    os.chdir(DIRECTORY)
    with socketserver.TCPServer((HOST, PORT), PWAHandler) as httpd:
        print("=" * 64)
        print("  ZIMBABWEAN CONSTITUTION - LOCAL DEV ENVIRONMENT (.env dev)")
        print(f"  Mode:        {config.get('APP_ENV', 'development')}")
        print(f"  Local URL:   http://localhost:{PORT}")
        print(f"  Network URL: http://{HOST}:{PORT}")
        print(f"  Env File:    {os.path.basename(target_env)}")
        print("  Service Worker & Cache API Active")
        print("  Press Ctrl+C to stop the development server")
        print("=" * 64)

        if AUTO_OPEN:
            t = threading.Thread(target=open_browser, args=(PORT,))
            t.daemon = True
            t.start()

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nDev server stopped.")
