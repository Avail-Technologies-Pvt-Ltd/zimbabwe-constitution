from django.urls import path
from . import views

app_name = 'constitution'

urlpatterns = [
    path('', views.index_view, name='index'),
    path('sw.js', views.service_worker_view, name='service_worker'),
    path('manifest.json', views.manifest_view, name='manifest'),
    path('health/', views.health_check, name='health_check'),
    
    # Constitution APIs
    path('api/constitution/', views.api_constitution, name='api_constitution'),
    path('api/section/<int:number>/', views.api_section, name='api_section'),

    # Email Authentication Endpoints
    path('api/auth/register/', views.api_register, name='api_register'),
    path('api/auth/login/', views.api_login, name='api_login'),
    path('api/auth/logout/', views.api_logout, name='api_logout'),
    path('api/auth/user/', views.api_user_status, name='api_user_status'),

    # User Progress & Sync Endpoints
    path('api/progress/toggle/', views.api_toggle_section_read, name='api_toggle_section_read'),
    path('api/progress/sync/', views.api_sync_progress, name='api_sync_progress'),

    # ElevenLabs & Premium Endpoints
    path('api/tts/elevenlabs/', views.api_elevenlabs_tts, name='api_elevenlabs_tts'),
    path('api/auth/demo-toggle-premium/', views.api_toggle_demo_premium, name='api_toggle_demo_premium'),
]

