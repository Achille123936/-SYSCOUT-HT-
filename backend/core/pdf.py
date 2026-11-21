"""CU15 — Génération des documents PDF (fiche joueur, comparaison, rapport, facture, reçu)."""
from io import BytesIO

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

BLEU = colors.HexColor('#1f4fd1')
ROUGE = colors.HexColor('#d21034')
MARINE = colors.HexColor('#0b1f4d')
GRIS = colors.HexColor('#6b7280')

_styles = getSampleStyleSheet()
TITRE = ParagraphStyle('titre', parent=_styles['Title'], fontSize=17, textColor=MARINE, alignment=0, spaceAfter=2)
SOUS = ParagraphStyle('sous', parent=_styles['Normal'], fontSize=9.5, textColor=GRIS, spaceAfter=10)
H2 = ParagraphStyle('h2', parent=_styles['Heading2'], fontSize=11.5, textColor=MARINE, spaceBefore=12, spaceAfter=5)
TEXTE = ParagraphStyle('texte', parent=_styles['Normal'], fontSize=10, leading=14)

LIBELLES = [('minutes_jouees', 'Minutes jouées'), ('matchs_joues', 'Matchs joués'), ('buts', 'Buts'),
            ('passes_decisives', 'Passes décisives'), ('xg', 'xG'), ('buts_p90', 'Buts / 90'),
            ('xg_p90', 'xG / 90'), ('tirs_p90', 'Tirs / 90'), ('passes_p90', 'Passes / 90'),
            ('passes_reussies_pct', 'Passes réussies %'), ('dribbles_p90', 'Dribbles réussis / 90'),
            ('duels_gagnes_pct', 'Duels gagnés %'), ('recuperations_p90', 'Récupérations / 90'),
            ('interceptions_p90', 'Interceptions / 90'), ('buts_tete', 'Buts de la tête'),
            ('tirs_tete_p90', 'Tirs de la tête / 90'), ('xg_tete_p90', 'xG de la tête / 90')]


def htg(montant):
    """Montants en gourdes avec deux décimales (SEL 3.5), ex. 15 000,00 HTG."""
    entier, decimales = f'{montant:,.2f}'.split('.')
    return f"{entier.replace(',', ' ')},{decimales} HTG"


def jour(d):
    return d.strftime('%d/%m/%Y') if d else '—'


def _entete(canvas, doc):
    largeur, hauteur = A4
    canvas.saveState()
    canvas.setFillColor(BLEU)
    canvas.rect(18 * mm, hauteur - 20 * mm, 5 * mm, 10 * mm, stroke=0, fill=1)
    canvas.setFillColor(ROUGE)
    canvas.rect(23 * mm, hauteur - 20 * mm, 5 * mm, 10 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont('Helvetica-Bold', 8)
    canvas.drawCentredString(23 * mm, hauteur - 16.5 * mm, 'SH')
    canvas.setFillColor(MARINE)
    canvas.setFont('Helvetica-Bold', 12)
    canvas.drawString(32 * mm, hauteur - 15 * mm, 'SYSCOUT-HT')
    canvas.setFillColor(GRIS)
    canvas.setFont('Helvetica', 8)
    canvas.drawString(32 * mm, hauteur - 19 * mm, 'Ayiti Data Foot S.A. · Pétion-Ville, Haïti')
    canvas.drawRightString(largeur - 18 * mm, hauteur - 15 * mm,
                           'Édité le ' + timezone.localtime().strftime('%d/%m/%Y à %H:%M'))
    canvas.drawRightString(largeur - 18 * mm, 12 * mm, f'Page {doc.page}')
    canvas.restoreState()


def _tableau(lignes, largeurs=None, entete=True):
    t = Table(lignes, colWidths=largeurs, hAlign='LEFT')
    style = [('FONTSIZE', (0, 0), (-1, -1), 9.5), ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#d1d5db')),
             ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('TOPPADDING', (0, 0), (-1, -1), 4),
             ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]
    if entete:
        style += [('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eef3ff')),
                  ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('TEXTCOLOR', (0, 0), (-1, 0), MARINE)]
    t.setStyle(TableStyle(style))
    return t


def _construire(elements):
    tampon = BytesIO()
    doc = SimpleDocTemplate(tampon, pagesize=A4, topMargin=28 * mm, bottomMargin=18 * mm, leftMargin=18 * mm,
                            rightMargin=18 * mm, title='SYSCOUT-HT')
    doc.build(elements, onFirstPage=_entete, onLaterPages=_entete)
    return tampon.getvalue()


def _v(valeur):
    return '—' if valeur is None else str(valeur).replace('.', ',')


def _identite(joueur):
    return (f'{joueur.club_actuel.nom} · {joueur.get_poste_display()} · {_v(joueur.calculer_age())} ans · '
            f'pied {joueur.get_pied_fort_display().lower()}')


def pdf_joueur(joueur, stat):
    e = [Paragraph(f'Fiche joueur — {joueur.nom_complet}', TITRE), Paragraph(_identite(joueur), SOUS)]
    e.append(_tableau([
        ['Date de naissance', jour(joueur.date_naissance), 'Nationalité', joueur.nationalite or '—'],
        ['Taille', f'{_v(joueur.taille)} cm', 'Poids', f'{_v(joueur.poids)} kg'],
        ['Indice de performance', f'{_v(joueur.indice_performance)} / 100', 'Division', joueur.club_actuel.division],
    ], [40 * mm, 47 * mm, 40 * mm, 47 * mm], entete=False))
    e.append(Paragraph('Statistiques de la saison' + (f' {stat.saison.libelle}' if stat else ''), H2))
    if stat:
        lignes = [['Indicateur', 'Valeur', 'Centile (même poste)']]
        for cle, libelle in LIBELLES:
            lignes.append([libelle, _v(getattr(stat, cle)), _v(stat.centiles.get(cle)) if cle in stat.centiles else ''])
        e.append(_tableau(lignes, [70 * mm, 45 * mm, 59 * mm]))
        if not stat.eligible:
            e.append(Spacer(1, 4))
            e.append(Paragraph('Moins de 450 minutes jouées : pas de centiles ni de classement (RG5).', SOUS))
    else:
        e.append(Paragraph('Aucune statistique publiée pour cette saison.', TEXTE))
    e.append(Paragraph('Historique des clubs', H2))
    lignes = [['Club', 'Du', 'Au', 'Contrat']]
    for h in joueur.historique.select_related('club'):
        lignes.append([h.club.nom, jour(h.date_debut), jour(h.date_fin) if h.date_fin else 'en cours',
                       h.get_type_contrat_display()])
    e.append(_tableau(lignes, [70 * mm, 32 * mm, 32 * mm, 40 * mm]))
    return _construire(e)


COULEURS_COMPARAISON = [BLEU, ROUGE, colors.HexColor('#0f9d6b'), colors.HexColor('#b86e00'), colors.HexColor('#7c3aed')]


def pdf_comparaison(joueurs):
    """De deux à cinq joueurs ; `joueurs` = [(joueur, statistique), ...]."""
    statistiques = [stat for _, stat in joueurs if stat]
    saison = statistiques[0].saison.libelle if statistiques else ''
    e = [Paragraph('Comparaison de joueurs', TITRE),
         Paragraph(f'Saison {saison} · centiles parmi les joueurs du même poste (minimum 450 minutes)', SOUS)]
    lignes = [['Indicateur'] + [j.nom_complet for j, _ in joueurs],
              ['Club'] + [j.club_actuel.nom for j, _ in joueurs],
              ['Poste · âge'] + [f'{j.poste} · {_v(j.calculer_age())} ans' for j, _ in joueurs],
              ['Minutes jouées'] + [_v(getattr(stat, 'minutes_jouees', None)) for _, stat in joueurs],
              ['Indice de performance'] + [_v(getattr(stat, 'indice_performance', None)) for _, stat in joueurs]]

    def cellule(stat, cle):
        if not stat:
            return '—'
        centile = stat.centiles.get(cle)
        return _v(getattr(stat, cle)) + (f' (c. {_v(centile)})' if centile is not None else '')

    for cle, libelle in LIBELLES:
        lignes.append([libelle] + [cellule(stat, cle) for _, stat in joueurs])
    reste = 174 * mm - 40 * mm
    t = _tableau(lignes, [40 * mm] + [reste / len(joueurs)] * len(joueurs))
    t.setStyle(TableStyle([('TEXTCOLOR', (k + 1, 0), (k + 1, 0), COULEURS_COMPARAISON[k]) for k in range(len(joueurs))]
                          + ([('FONTSIZE', (0, 0), (-1, -1), 7.5)] if len(joueurs) > 3 else [])))
    e.append(t)
    faibles = [j.nom_complet for j, stat in joueurs if not stat or stat.minutes_jouees < 450]
    if faibles:
        e.append(Paragraph('Moins de 450 minutes jouées, comparaison peu fiable : ' + ', '.join(faibles) + '.', TEXTE))
    return _construire(e)


def pdf_rapport(rapport):
    joueur = rapport.joueur
    e = [Paragraph(f'Rapport de scouting — {joueur.nom_complet}', TITRE), Paragraph(_identite(joueur), SOUS)]
    e.append(_tableau([
        ['Scout', rapport.scout.nom_complet, 'Date', jour(rapport.date_rapport)],
        ['Note', f'{rapport.note} / 10', 'Recommandation', rapport.get_recommandation_display()],
        ['État', rapport.get_etat_display(), 'Validé par',
         rapport.valide_par.nom_complet if rapport.valide_par else '—'],
        ['Match observé', str(rapport.match_observe) if rapport.match_observe else '—', '', ''],
    ], [32 * mm, 62 * mm, 32 * mm, 48 * mm], entete=False))
    for titre, texte in (('Forces', rapport.forces), ('Faiblesses', rapport.faiblesses),
                         ('Commentaire du directeur sportif', rapport.commentaire_validation)):
        if texte:
            e.append(Paragraph(titre, H2))
            e.append(Paragraph(texte.replace('\n', '<br/>'), TEXTE))
    return _construire(e)


def pdf_facture(facture):
    abo = facture.abonnement
    e = [Paragraph(f'Facture {facture.numero_facture}', TITRE),
         Paragraph(f'Émise le {jour(facture.date_emission)} · à régler avant le {jour(facture.date_echeance)}', SOUS)]
    e.append(_tableau([['Client', abo.club.nom], ['Ville', abo.club.ville],
                       ['Formule', f'{abo.formule.nom} · {abo.duree_mois} mois'],
                       ['Période', f'du {jour(facture.periode_debut)} au {jour(facture.periode_fin)}']],
                      [45 * mm, 129 * mm], entete=False))
    e.append(Spacer(1, 10))
    e.append(_tableau([['Désignation', 'Montant'],
                       [f'Abonnement {abo.formule.nom} ({htg(abo.formule.prix_mensuel_htg)} x {abo.duree_mois} mois)',
                        htg(facture.montant_ht)],
                       ["Taxe sur le chiffre d'affaires (10 %)", htg(facture.taxe)],
                       ['Total TTC', htg(facture.montant_ttc)],
                       ['Solde dû', htg(facture.solde_du)]], [124 * mm, 50 * mm]))
    e.append(Paragraph(f'Statut : {facture.get_statut_display()}', H2))
    return _construire(e)


def pdf_recu(paiement):
    facture = paiement.facture
    e = [Paragraph(f'Reçu de paiement n° {paiement.id:06d}', TITRE),
         Paragraph(timezone.localtime(paiement.date_paiement).strftime('Encaissé le %d/%m/%Y à %H:%M'), SOUS)]
    e.append(_tableau([['Client', facture.abonnement.club.nom], ['Facture', facture.numero_facture],
                       ['Montant reçu', htg(paiement.montant_htg)], ['Mode', paiement.get_mode_display()],
                       ['Référence', paiement.reference or '—'], ['Encaissé par', paiement.encaisse_par.nom_complet],
                       ['Solde restant dû', htg(facture.solde_du)]], [45 * mm, 129 * mm], entete=False))
    if paiement.annule:
        e.append(Paragraph(f'PAIEMENT ANNULÉ — {paiement.motif_annulation}', H2))
    return _construire(e)


def pdf_match(tableau, date_match, stade, competition):
    """Rapport de match : score, possession, statistiques des deux équipes et chiffres de chaque joueur."""
    m = tableau['match']
    dom, ext = m['domicile'], m['exterieur']
    e = [Paragraph(f"{dom['nom']} {m['score_saisi'][0]} – {m['score_saisi'][1]} {ext['nom']}", TITRE),
         Paragraph(f"{competition} · journée {m['journee']} · {timezone.localtime(date_match).strftime('%d/%m/%Y %H:%M')}"
                   + (f' · {stade}' if stade else ''), SOUS)]
    p = tableau['possession']
    lignes = [['', dom['nom'], ext['nom']]]
    if p['domicile'] is not None:
        lignes.append(['Possession' + (' (estimée par les passes)' if p['methode'] == 'passes' else ''),
                       f"{_v(p['domicile'])} %", f"{_v(p['exterieur'])} %"])
    a, b = tableau['equipes']['domicile'], tableau['equipes']['exterieur']
    for cle, nom, unite in (('buts', 'Buts', ''), ('tirs', 'Tirs', ''), ('tirs_cadres', 'Tirs cadrés', ''),
                            ('xg', 'xG', ''), ('passes', 'Passes', ''), ('passes_reussies_pct', 'Passes réussies', ' %'),
                            ('duels_gagnes_pct', 'Duels gagnés', ' %'), ('centres', 'Centres', ''),
                            ('recuperations', 'Récupérations', ''), ('interceptions', 'Interceptions', ''),
                            ('fautes', 'Fautes', ''), ('cartons', 'Cartons', '')):
        lignes.append([nom, _v(a[cle]) + (unite if a[cle] is not None else ''),
                       _v(b[cle]) + (unite if b[cle] is not None else '')])
    if 'distance_m' in a or 'distance_m' in b:
        lignes.append(['Distance parcourue', f"{_v(round(a.get('distance_m', 0) / 1000, 1))} km",
                       f"{_v(round(b.get('distance_m', 0) / 1000, 1))} km"])
    e.append(Paragraph('Statistiques du match', H2))
    e.append(_tableau(lignes, [70 * mm, 52 * mm, 52 * mm]))
    for club in (dom, ext):
        e.append(Paragraph(club['nom'], H2))
        joueurs = [['Joueur', 'Poste', 'Min', 'Buts', 'Tirs', 'xG', 'Passes', '% réus.', 'Duels g.', 'Récup.']]
        for j in tableau['joueurs']:
            if j['club'] == club['id'] and (j['minutes_jouees'] or j['est_titulaire']):
                joueurs.append([j['nom'], j['poste'], j['minutes_jouees'], j['buts'], j['tirs'], _v(j['xg']),
                                j['passes'], _v(j['passes_reussies_pct']), f"{j['duels_gagnes']}/{j['duels']}",
                                j['recuperations']])
        e.append(_tableau(joueurs, [46 * mm, 13 * mm, 12 * mm, 12 * mm, 12 * mm, 13 * mm, 16 * mm, 16 * mm,
                                    18 * mm, 16 * mm]))
    return _construire(e)
