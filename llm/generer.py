"""Interroge le modèle ajusté : python generer.py "Question" --contexte "chiffres…" --adaptateur adaptateur"""
import argparse

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

p = argparse.ArgumentParser()
p.add_argument('question')
p.add_argument('--modele', default='Qwen/Qwen2.5-0.5B-Instruct')
p.add_argument('--adaptateur', default='adaptateur')
p.add_argument('--contexte', default='')
a = p.parse_args()

tok = AutoTokenizer.from_pretrained(a.adaptateur)
modele = PeftModel.from_pretrained(AutoModelForCausalLM.from_pretrained(a.modele), a.adaptateur).eval()
contexte = f'\nContexte :\n{a.contexte}' if a.contexte else ''
ids = tok(f'### Instruction :\n{a.question}{contexte}\n\n### Réponse :\n', return_tensors='pt')
with torch.no_grad():
    sortie = modele.generate(**ids, max_new_tokens=400, do_sample=False)
print(tok.decode(sortie[0][ids['input_ids'].shape[1]:], skip_special_tokens=True))
