from django.urls import path
from . import views

app_name = 'constitution'

urlpatterns = [
    path('', views.index_view, name='index'),
    path('sw.js', views.service_worker_view, name='service_worker'),
    path('manifest.json', views.manifest_view, name='manifest'),
    path('health/', views.health_check, name='health_check'),
    path('api/constitution/', views.api_constitution, name='api_constitution'),
    path('api/section/<int:number>/', views.api_section, name='api_section'),
]
