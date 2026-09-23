from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    last_section_number = models.IntegerField(default=1)
    is_premium = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile of {self.user.email or self.user.username} (Premium: {self.is_premium})"

    @property
    def total_sections_read(self):
        return self.user.progress.filter(is_read=True).count()

    @property
    def reading_percentage(self):
        # 345 total sections in the Constitution
        return round((self.total_sections_read / 345) * 100, 1)

class CachedAudio(models.Model):
    text_hash = models.CharField(max_length=64, unique=True, db_index=True)
    voice_id = models.CharField(max_length=64, default='21m00Tcm4TlvDq8ikWAM')
    audio_file = models.FileField(upload_to='audio_cache/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Audio Cache {self.text_hash[:12]} ({self.voice_id})"


class UserProgress(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='progress')
    section_number = models.IntegerField()
    chapter_number = models.IntegerField(default=1)
    is_read = models.BooleanField(default=False)
    is_listened = models.BooleanField(default=False)
    read_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'section_number')
        indexes = [
            models.Index(fields=['user', 'section_number']),
            models.Index(fields=['user', 'chapter_number']),
        ]

    def __str__(self):
        return f"{self.user.email} - Sec {self.section_number} (Read: {self.is_read})"

class UserBookmark(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bookmarks')
    section_number = models.IntegerField()
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'section_number')

    def __str__(self):
        return f"{self.user.email} - Bookmark Sec {self.section_number}"

@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)
    else:
        if hasattr(instance, 'profile'):
            instance.profile.save()
