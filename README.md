# AncreMail

Plateforme SaaS de **boîtes mail programmables pour agents IA** : un compte achète un accès
(plan gratuit, Pro ou Scale), crée des adresses `nom@votre-domaine` par API ou depuis la console,
puis envoie et reçoit des emails.

Fonctionnalités inspirées des consoles « email pour agents » du marché, avec un nom, un design et
un code entièrement originaux.

## Ce que fait l'application

| Domaine | Fonctionnalités |
|---|---|
| Comptes | Inscription, connexion, vérification d'email, déconnexion, verrouillage après 5 échecs |
| Console | Vue d'ensemble (quotas), boîtes mail, lecture/envoi, clés API, abonnement, journal d'activité |
| API REST v1 | `me`, CRUD boîtes, liste/lecture/envoi de messages, pagination par curseur, idempotence |
| Réception | Webhook entrant signé (fournisseur factice) ou Route Mailgun signée |
| Facturation | Paiement par virement bancaire (ex. compte Deblock) : commande avec référence unique, validation manuelle par l'administrateur, activation pour 1 mois, retour automatique au plan gratuit à échéance |
| Plans | Gratuit 3 boîtes / 100 envois · Pro 19 € 50 / 10 000 · Scale 99 € 500 / 100 000 (`src/lib/plans.ts`) |

## Sécurité intégrée

- **Mots de passe** : scrypt (N=2^17), sel aléatoire, comparaison à temps constant, 12 caractères minimum.
- **Sessions** : jeton aléatoire 256 bits, seul son SHA-256 est stocké ; cookie `HttpOnly`, `SameSite=Lax`,
  `Secure` + préfixe `__Host-` en production ; invalidation serveur à la déconnexion.
- **Anti-CSRF** : vérification stricte de l'en-tête `Origin` sur toute requête par cookie qui modifie l'état.
- **Clés API** : `amk_` + 256 bits, affichées une seule fois, stockées hachées, expiration et révocation.
- **Anti-IDOR** : chaque accès vérifie que la ressource appartient au compte (404 sinon).
- **Limitation de débit** : connexion (IP + email), inscription, API par clé selon le plan, webhooks.
- **Pas d'énumération de comptes** : même message et même temps de réponse si l'email n'existe pas.
- **Validation** de toutes les entrées (zod), limites de taille de corps, blocage de l'injection d'en-tête
  dans le sujet, noms d'adresse réservés (`postmaster`, `abuse`…).
- **En-têtes** : CSP stricte avec nonce par requête, HSTS, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, pas de `X-Powered-By`.
- **Emails HTML** affichés dans une iframe `sandbox` vide (aucun script) ; images distantes bloquées
  (anti-pistage).
- **Adresses jamais recyclées** : une boîte supprimée garde son adresse réservée, pour qu'aucun inconnu
  ne reçoive les mails (réinitialisations de mot de passe…) destinés à l'ancien propriétaire.
- **Webhooks** : signatures HMAC vérifiées à temps constant, fenêtre anti-rejeu de 5 minutes, dédoublonnage.
- **Paiement** : aucun moyen de paiement n'est saisi sur le site. L'IBAN vient d'une variable d'environnement
  validée (modulo 97). Seuls les emails listés dans `ADMIN_EMAILS` voient et valident les commandes (404 pour les
  autres). La validation est atomique, donc un double clic ne prolonge jamais deux fois, et tout est journalisé.
- **Abus** : l'envoi est bloqué tant que l'email du compte n'est pas vérifié ; quotas mensuels.
- **Journal d'audit** visible par l'utilisateur (connexions, échecs, clés, boîtes, abonnement).
- **Dépendances** : `npm audit` → 0 vulnérabilité au moment de la livraison.

## Démarrage local (5 minutes)

Prérequis : Node 20+ et PostgreSQL 16 (ou Docker).

```bash
cp .env.example .env              # puis ajustez DATABASE_URL et INBOUND_WEBHOOK_SECRET
npm install
npx prisma migrate deploy
npm run dev                       # http://localhost:3000
```

Avec le fournisseur `mock`, aucun email ne part : le lien de vérification s'affiche dans les journaux du serveur (terminal en local, « Runtime Logs » sur Vercel).

Avec Docker uniquement : `cp .env.example .env && docker compose up --build`.

### Simuler la réception d'un email (fournisseur mock)

```bash
BODY='{"recipient":"mon-agent@agents.localhost","from":"alice@exemple.fr","subject":"Code 123456","text":"Votre code"}'
T=$(date +%s)
SIG=$(printf "%s.%s" "$T" "$BODY" | openssl dgst -sha256 -hmac "$INBOUND_WEBHOOK_SECRET" | cut -d' ' -f2)
curl -X POST http://localhost:3000/api/webhooks/inbound -H "x-ancre-signature: t=$T,v1=$SIG" -d "$BODY"
```

## Tests

```bash
createdb ancremail_test                                   # base dédiée aux tests
DATABASE_URL=postgresql://.../ancremail_test npx prisma migrate deploy
npm test                                                  # 40 tests unitaires + intégration
npm run build && npm start &                              # puis, test navigateur complet :
BASE_URL=http://localhost:3000 npm run test:e2e           # nécessite `npx playwright install chromium`
```

Le test de bout en bout parcourt : inscription → clé API → création de boîte → API Bearer → réception
signée (et refus d'un faux webhook) → lecture d'un email HTML piégé (script neutralisé) → envoi →
tentative CSRF bloquée → commande par virement validée par l'admin → déconnexion, et échoue à la moindre violation CSP ou erreur JavaScript.

## Mise en production

1. **Domaine email** : choisissez un sous-domaine dédié (ex. `agents.mondomaine.fr`), ajoutez-le chez
   Mailgun (SPF, DKIM, MX), puis créez une *Route* `match_recipient(".*@agents.mondomaine.fr")` →
   `forward("https://app.mondomaine.fr/api/webhooks/inbound")`. Renseignez `MAIL_PROVIDER=mailgun`,
   `MAILGUN_API_KEY`, `MAILGUN_WEBHOOK_SIGNING_KEY`, `MAIL_DOMAIN`.
2. **Paiement par virement** : renseignez `BANK_ACCOUNT_HOLDER`, `BANK_IBAN` et `BANK_BIC` (votre compte Deblock,
   par exemple) et `ADMIN_EMAILS` (votre email de connexion). Le client commande un plan, reçoit l'IBAN, le montant
   et une référence `ANCRE-XXXXXXXX` à mettre dans le libellé. Quand le virement apparaît sur votre compte, ouvrez
   **Paiements à valider** dans la console et cliquez sur « Virement reçu » : le plan est activé pour 1 mois. Une
   commande impayée est annulée après 14 jours.
3. **Hébergement** : image Docker fournie (utilisateur non-root, healthcheck `/api/health`), ou Vercel /
   Railway / Fly avec une base PostgreSQL managée. Servez **uniquement en HTTPS**.
   *Netlify* (version de test actuelle) : reliez le dépôt GitHub au projet, déclarez les variables dans
   Project configuration › Environment variables, puis redéployez (une variable modifiée ne s'applique qu'au
   déploiement suivant). Avec Supabase, utilisez l'adresse du pooler donnée par **Connect** dans Supabase
   (`aws-1-…` pour les projets récents ; `aws-0-…` répond « tenant not found »).
4. **Plusieurs instances** : remplacez le limiteur en mémoire (`src/lib/rate-limit.ts`) par Redis.
5. **Secrets** : uniquement en variables d'environnement, jamais dans le dépôt (`.env` est ignoré par git).

## Architecture

```
src/
  proxy.ts                 CSP avec nonce (Next 16 « proxy », ex-middleware)
  lib/
    env.ts                 validation de la configuration au démarrage
    crypto.ts              scrypt, jetons, HMAC, comparaisons à temps constant
    auth.ts                sessions + contrôle d'origine anti-CSRF
    request-auth.ts        authentification API (clé Bearer ou session) + quota de débit
    inboxes.ts             logique métier boîtes / messages / quotas / réception
    users.ts               inscription, connexion, verrouillage, vérification d'email
    billing.ts             commandes par virement, validation admin, expiration des plans
    mail/                  adaptateurs fournisseur : mock (dev/tests) et Mailgun
  app/
    api/v1/...             API publique
    api/console/...        clés API, commandes, validation admin (session uniquement)
    api/webhooks/...       réception d'emails
    dashboard/...          console
prisma/schema.prisma       modèle de données
tests/                     unitaires + intégration (base PostgreSQL réelle)
e2e/smoke.mjs              parcours navigateur complet
```

## Pistes d'évolution

Webhooks sortants vers les clients (`message.received`), WebSocket temps réel, pièces jointes
(stockage S3), domaines personnalisés par client, double authentification (TOTP), équipes et rôles.
