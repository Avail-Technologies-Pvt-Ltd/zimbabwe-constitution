"""
Views for Zimbabwean Constitution website.
Provides the main app view, root-scoped Service Worker, Manifest, and JSON APIs.
"""
from django.shortcuts import render
from django.http import HttpResponse, JsonResponse, Http404
from django.conf import settings
from pathlib import Path
import json

DATA_FILE = settings.BASE_DIR / 'data' / 'constitution.json'
SW_FILE = settings.BASE_DIR / 'static' / 'sw.js'
MANIFEST_FILE = settings.BASE_DIR / 'static' / 'manifest.json'

def load_constitution_data():
    if DATA_FILE.exists():
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def index_view(request):
    """Renders the main mobile-friendly website."""
    return render(request, 'index.html', {
        'app_title': 'Constitution of Zimbabwe',
        'debug': settings.DEBUG
    })

def service_worker_view(request):
    """
    Serves sw.js directly at the domain root (/sw.js)
    with Service-Worker-Allowed header and no-cache policy.
    """
    if not SW_FILE.exists():
        raise Http404("Service Worker file not found")
        
    with open(SW_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    response = HttpResponse(content, content_type='application/javascript; charset=utf-8')
    response['Service-Worker-Allowed'] = '/'
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response['Pragma'] = 'no-cache'
    response['Expires'] = '0'
    return response

def manifest_view(request):
    """Serves manifest.json at /manifest.json with proper MIME type."""
    if not MANIFEST_FILE.exists():
        raise Http404("Manifest file not found")
        
    with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    response = HttpResponse(content, content_type='application/manifest+json; charset=utf-8')
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response

def api_constitution(request):
    """Returns the complete structured Constitution in JSON."""
    data = load_constitution_data()
    return JsonResponse(data, safe=False, json_dumps_params={'ensure_ascii': False})

def api_section(request, number):
    """Returns a specific section by number."""
    data = load_constitution_data()
    for ch in data.get('chapters', []):
        for sec in ch.get('sections', []):
            if sec.get('number') == number:
                return JsonResponse(sec, json_dumps_params={'ensure_ascii': False})
    return JsonResponse({'error': f'Section {number} not found'}, status=404)

def health_check(request):
    """Healthcheck endpoint for Docker containers and uptime monitors."""
    return HttpResponse("OK", content_type="text/plain")
