"""Ajustement fin LoRA d'un petit modèle ouvert sur le corpus SYSCOUT-HT (corpus.jsonl).

Usage : python entrainer_lora.py --modele Qwen/Qwen2.5-0.5B-Instruct --corpus corpus.jsonl --sortie adaptateur
Un GPU est conseillé (même 0,5 milliard de paramètres est lent sur processeur). Chaque exemple suit le gabarit
instruction + contexte -> réponse. La perte n'est calculée que sur la réponse."""
import argparse
import json
import random

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer


def gabarit(e):
    entree = f"\nContexte :\n{e['entree']}" if e.get('entree') else ''
    return f"### Instruction :\n{e['instruction']}{entree}\n\n### Réponse :\n"


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--modele', default='Qwen/Qwen2.5-0.5B-Instruct')
    p.add_argument('--corpus', nargs='+', default=['corpus.jsonl'], help='un ou plusieurs fichiers JSONL')
    p.add_argument('--sortie', default='adaptateur')
    p.add_argument('--epoques', type=int, default=2)
    p.add_argument('--lot', type=int, default=4)
    p.add_argument('--taux', type=float, default=2e-4)
    p.add_argument('--longueur', type=int, default=512)
    a = p.parse_args()
    random.seed(42)
    torch.manual_seed(42)

    exemples = [json.loads(ligne) for chemin in a.corpus for ligne in open(chemin, encoding='utf-8') if ligne.strip()]
    random.shuffle(exemples)
    coupure = max(1, int(len(exemples) * 0.9))
    train, val = exemples[:coupure], exemples[coupure:]
    appareil = 'cuda' if torch.cuda.is_available() else 'cpu'
    tok = AutoTokenizer.from_pretrained(a.modele)
    tok.pad_token = tok.pad_token or tok.eos_token
    modele = AutoModelForCausalLM.from_pretrained(
        a.modele, torch_dtype=torch.bfloat16 if appareil == 'cuda' else torch.float32)
    modele = get_peft_model(modele, LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, task_type='CAUSAL_LM',
                                               target_modules=['q_proj', 'v_proj'])).to(appareil)
    modele.print_trainable_parameters()

    def lot(liste):
        sequences, etiquettes = [], []
        for e in liste:
            ids_i = tok(gabarit(e), add_special_tokens=False)['input_ids']
            ids_r = tok(e['sortie'] + tok.eos_token, add_special_tokens=False)['input_ids']
            sequences.append((ids_i + ids_r)[:a.longueur])
            etiquettes.append(([-100] * len(ids_i) + ids_r)[:a.longueur])
        n = max(map(len, sequences))
        entree = torch.tensor([s + [tok.pad_token_id] * (n - len(s)) for s in sequences])
        masque = torch.tensor([[1] * len(s) + [0] * (n - len(s)) for s in sequences])
        cibles = torch.tensor([c + [-100] * (n - len(c)) for c in etiquettes])
        return entree.to(appareil), masque.to(appareil), cibles.to(appareil)

    def perte_validation():
        modele.eval()
        total = 0.0
        with torch.no_grad():
            for i in range(0, len(val), a.lot):
                x, m, y = lot(val[i:i + a.lot])
                total += modele(input_ids=x, attention_mask=m, labels=y).loss.item()
        modele.train()
        return total / max(1, -(-len(val) // a.lot))

    opt = torch.optim.AdamW([q for q in modele.parameters() if q.requires_grad], lr=a.taux, weight_decay=1e-4)
    modele.train()
    for epoque in range(a.epoques):
        random.shuffle(train)
        for i in range(0, len(train), a.lot):
            x, m, y = lot(train[i:i + a.lot])
            perte = modele(input_ids=x, attention_mask=m, labels=y).loss
            perte.backward()
            torch.nn.utils.clip_grad_norm_(modele.parameters(), 1.0)  # écrêtage du gradient
            opt.step()
            opt.zero_grad()
        print(f'époque {epoque + 1} : perte de validation {perte_validation():.4f}' if val
              else f'époque {epoque + 1} terminée')
    modele.save_pretrained(a.sortie)
    tok.save_pretrained(a.sortie)
    print('Adaptateur enregistré dans', a.sortie)


if __name__ == '__main__':
    main()
