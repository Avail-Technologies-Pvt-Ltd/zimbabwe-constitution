"""
Custom Authentication Backend for login by email.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

class EmailBackend(ModelBackend):
    """
    Authenticates against settings.AUTH_USER_MODEL using email address.
    Case-insensitive lookup.
    """
    def authenticate(self, request, username=None, password=None, **kwargs):
        UserModel = get_user_model()
        email = kwargs.get('email') or username
        if not email or not password:
            return None
        try:
            user = UserModel.objects.filter(email__iexact=email).first()
            if not user:
                # Also allow username if user entered it
                user = UserModel.objects.filter(username__iexact=email).first()
            if user and user.check_password(password):
                return user
        except UserModel.DoesNotExist:
            return None
        return None
