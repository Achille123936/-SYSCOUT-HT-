# SYSCOUT-HT — petit modèle de langage (LoRA)

Ajuste un petit modèle ouvert (0,5 milliard de paramètres) pour **formuler** les statistiques validées de SYSCOUT-HT en
texte. Ce n'est pas un modèle entraîné de zéro : on ajoute des matrices LoRA à un modèle existant.

## Étapes

```bash
# 1. Corpus (depuis backend/) : joueurs majeurs éligibles, sans nom ni club, chiffres issus de la base
cd backend && python manage.py exporter_corpus_llm --sortie ../llm/corpus.jsonl

# 2. Ajustement (de préférence sur une machine avec GPU)
cd ../llm && pip install -r requirements.txt
python entrainer_lora.py --modele Qwen/Qwen2.5-0.5B-Instruct --corpus corpus.jsonl --sortie adaptateur

# 3. Essai
python generer.py "Résume le profil statistique de Joueur 1 pour un entraîneur." --contexte "..."
```

## Résultat mesuré (à lire avant tout usage)

Un essai a été fait sur CPU (Qwen2.5-0.5B, 3 époques, 228 exemples dont 58 connaissances de football). Perte de validation
0,59, et **les réponses de football sont fausses** (« hors-jeu » et « faux neuf » expliqués de façon inventée, même pour
une question présente dans le corpus). Cet adaptateur **ne doit pas servir à répondre sur le football**. Ce pipeline sert
à formuler des chiffres donnés en contexte ; pour « comprendre » le football, utilisez l'assistant IA du site
(`backend/assistant`, API Claude + recherche documentaire), qui cite ses sources.

## Limites

- La qualité n'est mesurée que par la perte de validation et quelques essais manuels : pas d'évaluation systématique.
- Les réponses du corpus viennent de règles fixes : le modèle apprend un style, pas de nouvelles connaissances. Donnez-lui
  toujours les chiffres en `--contexte` : sans eux, il peut inventer.
- **Créole** : le corpus est en français. Pour le créole, ajoutez un corpus rédigé ou relu par des locuteurs (même format
  `instruction` / `entree` / `sortie`) ; ne le générez pas par traduction automatique non vérifiée.
- Le corpus exclut les mineurs (RG12). Ne publiez pas `corpus.jsonl` ni l'adaptateur sans l'accord des clubs.
- Vérifiez la licence du modèle de base avant tout usage commercial.
