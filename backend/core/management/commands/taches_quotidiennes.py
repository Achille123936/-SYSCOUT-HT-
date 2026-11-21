"""Tâches de fin de journée (à planifier avec cron) : RG10 et sauvegarde quotidienne (EF 16.2)."""
from django.core.management.base import BaseCommand

from core.services import journaliser, mettre_a_jour_abonnements, sauvegarder


class Command(BaseCommand):
    help = 'Suspend les abonnements impayés depuis 15 jours puis sauvegarde la base et les vidéos.'

    def handle(self, *args, **options):
        bilan = mettre_a_jour_abonnements()
        self.stdout.write(f"Abonnements : {bilan['suspendus']} suspendu(s), {bilan['expires']} expiré(s).")
        copies = sauvegarder()
        journaliser(None, 'SAUVEGARDE', table='base', apres={'copies': copies, 'origine': 'quotidienne'})
        for copie in copies:
            self.stdout.write(f"Sauvegarde {copie['destination']} : {copie['fichier']} ({copie['taille_ko']} Ko)")
