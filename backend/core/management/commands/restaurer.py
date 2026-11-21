"""Restauration des données à partir d'une sauvegarde (SEL 3.6.6 : restauration possible depuis la veille)."""
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = ('Remplace le contenu de la base par celui d\'une sauvegarde. Sans fichier indiqué, prend la plus '
            'récente du disque externe.')

    def add_arguments(self, parser):
        parser.add_argument('fichier', nargs='?', help='fichier base_AAAAMMJJ_HHMMSS.json à restaurer')
        parser.add_argument('--oui', action='store_true', help='confirme le remplacement des données actuelles')

    def handle(self, *args, **options):
        if options['fichier']:
            fichier = Path(options['fichier'])
        else:
            copies = sorted(Path(settings.SYSCOUT['SAUVEGARDES'][0]).glob('base_*.json'))
            if not copies:
                raise CommandError('Aucune sauvegarde trouvée.')
            fichier = copies[-1]
        if not fichier.exists():
            raise CommandError(f'Fichier introuvable : {fichier}')
        if not options['oui']:
            raise CommandError(f'Les données actuelles seront remplacées par {fichier.name}. '
                               'Relancez la commande avec --oui pour confirmer.')
        # tout ou rien : si la sauvegarde est illisible, la base actuelle reste intacte
        with transaction.atomic():
            call_command('flush', interactive=False, verbosity=0)
            call_command('loaddata', str(fichier), verbosity=0)
        self.stdout.write(self.style.SUCCESS(f'Base restaurée depuis {fichier.name}.'))
