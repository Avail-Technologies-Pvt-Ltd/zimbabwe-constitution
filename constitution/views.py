"""
Views for Zimbabwean Constitution website.
Provides the main app view, root-scoped Service Worker, Manifest,
Email authentication, and User Progress tracking APIs.
"""
from django.shortcuts import render
from django.http import HttpResponse, JsonResponse, Http404
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST, require_GET
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from .models import UserProfile, UserProgress, UserBookmark
import json

DATA_FILE = settings.BASE_DIR / 'data' / 'constitution.json'
SW_FILE = settings.BASE_DIR / 'static' / 'sw.js'
MANIFEST_FILE = settings.BASE_DIR / 'static' / 'manifest.json'

def load_constitution_data():
    if DATA_FILE.exists():
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

@ensure_csrf_cookie
def index_view(request):
    """Renders the main mobile-friendly website."""
    return render(request, 'index.html', {
        'app_title': 'Constitution of Zimbabwe',
        'debug': settings.DEBUG
    })

def service_worker_view(request):
    """
    Serves sw.js directly at domain root (/sw.js)
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

def health_check(request):
    """Healthcheck endpoint for Docker containers and uptime monitors."""
    return HttpResponse("OK", content_type="text/plain")

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

# ===================================================================
# EMAIL AUTHENTICATION & USER PROGRESS ENDPOINTS
# ===================================================================

def parse_json_body(request):
    try:
        return json.loads(request.body.decode('utf-8'))
    except Exception:
        return {}

def format_user_payload(user):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    read_sections = list(user.progress.filter(is_read=True).values_list('section_number', flat=True))
    bookmarks = list(user.bookmarks.values('section_number', 'note'))
    
    total_read = len(read_sections)
    percentage = round((total_read / 345) * 100, 1)

    return {
        'authenticated': True,
        'user': {
            'id': user.id,
            'email': user.email,
            'name': user.first_name or user.email.split('@')[0],
            'total_sections_read': total_read,
            'reading_percentage': percentage,
            'last_section_number': profile.last_section_number,
            'read_sections': read_sections,
            'bookmarks': bookmarks
        }
    }

@require_POST
def api_register(request):
    """Register a new user using email & password."""
    data = parse_json_body(request)
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()
    name = data.get('name', '').strip()

    if not email or not password:
        return JsonResponse({'error': 'Email and password are required.'}, status=400)

    try:
        validate_email(email)
    except ValidationError:
        return JsonResponse({'error': 'Please enter a valid email address.'}, status=400)

    if len(password) < 6:
        return JsonResponse({'error': 'Password must be at least 6 characters long.'}, status=400)

    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({'error': 'An account with this email already exists. Please log in.'}, status=400)

    # Create user with email as username for standard Django compatibility
    user = User.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=name
    )

    # Log user in
    user_authenticated = authenticate(request, email=email, password=password)
    if user_authenticated:
        login(request, user_authenticated)

    return JsonResponse(format_user_payload(user))

@require_POST
def api_login(request):
    """Log in an existing user via email & password."""
    data = parse_json_body(request)
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()

    if not email or not password:
        return JsonResponse({'error': 'Email and password are required.'}, status=400)

    user = authenticate(request, email=email, password=password)
    if not user:
        return JsonResponse({'error': 'Invalid email or password.'}, status=401)

    login(request, user)
    return JsonResponse(format_user_payload(user))

@require_POST
def api_logout(request):
    """Log out the current user."""
    logout(request)
    return JsonResponse({'authenticated': False, 'message': 'Logged out successfully.'})

@require_GET
def api_user_status(request):
    """Check current authentication status and user progress."""
    if request.user.is_authenticated:
        return JsonResponse(format_user_payload(request.user))
    return JsonResponse({'authenticated': False})

@require_POST
def api_toggle_section_read(request):
    """Toggle read status for a section and update progress metrics."""
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Authentication required to save progress to account.'}, status=401)

    data = parse_json_body(request)
    section_number = data.get('section_number')
    chapter_number = data.get('chapter_number', 1)
    force_read = data.get('is_read')

    if section_number is None:
        return JsonResponse({'error': 'section_number is required.'}, status=400)

    progress, _ = UserProgress.objects.get_or_create(
        user=request.user,
        section_number=int(section_number),
        defaults={'chapter_number': int(chapter_number)}
    )

    if force_read is not None:
        progress.is_read = bool(force_read)
    else:
        progress.is_read = not progress.is_read
    progress.save()

    # Update profile last read
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    profile.last_section_number = int(section_number)
    profile.save()

    total_read = request.user.progress.filter(is_read=True).count()
    percentage = round((total_read / 345) * 100, 1)

    return JsonResponse({
        'section_number': int(section_number),
        'is_read': progress.is_read,
        'total_sections_read': total_read,
        'reading_percentage': percentage
    })

@require_POST
def api_sync_progress(request):
    """Sync offline localStorage progress with user's account."""
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Authentication required.'}, status=401)

    data = parse_json_body(request)
    offline_read_sections = data.get('read_sections', [])
    offline_bookmarks = data.get('bookmarks', [])

    # Merge read sections
    for sec_num in offline_read_sections:
        try:
            sec_int = int(sec_num)
            progress, _ = UserProgress.objects.get_or_create(
                user=request.user,
                section_number=sec_int
            )
            progress.is_read = True
            progress.save()
        except ValueError:
            pass

    # Merge bookmarks
    for b in offline_bookmarks:
        try:
            sec_num = int(b.get('number', b.get('section_number', 0)))
            note = b.get('note', '')
            if sec_num > 0:
                bm, _ = UserBookmark.objects.get_or_create(
                    user=request.user,
                    section_number=sec_num
                )
                if note:
                    bm.note = note
                    bm.save()
        except Exception:
            pass

    return JsonResponse(format_user_payload(request.user))
