import re

from django.core.exceptions import ValidationError


class LettresEtChiffresValidator:
    def validate(self, password, user=None):
        if not re.search(r'[A-Za-z]', password) or not re.search(r'\d', password):
            raise ValidationError('Le mot de passe doit contenir des lettres et des chiffres.', code='lettres_chiffres')

    def get_help_text(self):
        return 'Le mot de passe doit contenir des lettres et des chiffres.'
