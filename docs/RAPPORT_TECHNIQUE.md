# Rapport Technique : Système de Collecte de Données 4chan

## Projet ESLSCA - Analyse des Discours en Ligne

> **Note** : Ce système supporte tous les boards 4chan (`/pol/`, `/x/`, `/biz/`, etc.) via l'argument `--board`

---

## 1. Contexte et Objectifs

### 1.1 Contexte du Projet

Dans le cadre de notre recherche sur l'analyse des discours en ligne, nous avons développé un outil de collecte de données (scraper) permettant d'extraire le contenu du forum 4chan, spécifiquement le board /pol/ (Politically Incorrect).

4chan est une plateforme de discussion anonyme particulièrement pertinente pour l'étude des théories du complot, de la désinformation et des mouvements d'opinion en ligne.

### 1.2 Objectifs

L'objectif principal est de constituer un corpus de données structurées pour une analyse ultérieure, comprenant :

- Le contenu textuel des publications
- Les métadonnées associées (date, auteur, engagement)
- Les relations entre les messages (citations, réponses)
- Les médias partagés (URLs des images)

---

## 2. Architecture Technique

### 2.1 Technologies Utilisées

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| Langage | TypeScript / Node.js | Typage fort, écosystème riche |
| Client HTTP | Axios | Gestion des requêtes, intercepteurs |
| Rate Limiting | p-queue | Respect des contraintes API |
| Export | csv-writer | Format universel pour analyse |
| Parsing HTML | he (HTML Entities) | Décodage des entités HTML |

### 2.2 Structure du Projet

```
eslsca-scraping/
├── src/
│   ├── index.ts         # Point d'entrée principal
│   ├── api.ts           # Client API avec rate limiting
│   ├── transformer.ts   # Transformation des données
│   ├── csv-writer.ts    # Export CSV
│   └── types.ts         # Définitions TypeScript
├── output/              # Fichiers CSV générés
├── package.json         # Dépendances
└── README.md            # Documentation
```

### 2.3 Flux de Données

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API 4chan     │────▶│   Transformer   │────▶│   Export CSV    │
│  (a.4cdn.org)   │     │  (nettoyage)    │     │   (output/)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │               ┌─────────────────┐
        │               │  Résolution     │
        │               │  des citations  │
        │               └─────────────────┘
        │
        ▼
┌─────────────────┐
│  Rate Limiter   │
│ (1 req/seconde) │
└─────────────────┘
```

---

## 3. Schéma de Données

### 3.1 Données Collectées

Le système extrait les champs suivants pour chaque publication :

| Champ | Type | Description |
|-------|------|-------------|
| `post_id` | Entier | Identifiant unique de la publication |
| `thread_id` | Entier | Identifiant du fil de discussion |
| `auteur` | Texte | Nom + tripcode + ID poster |
| `texte` | Texte | Contenu textuel nettoyé (HTML supprimé) |
| `plateforme` | Texte | "4chan" (constant) |
| `date` | Timestamp | Horodatage UNIX |
| `date_iso` | Texte | Date au format ISO 8601 |
| `type` | Enum | "post" (publication initiale) ou "reply" (réponse) |
| `engagement_replies` | Entier | Nombre de réponses (OP uniquement) |
| `engagement_images` | Entier | Nombre d'images (OP uniquement) |
| `engagement_unique_ips` | Entier | Nombre de participants uniques |
| `topic` | Texte | Sujet du fil (OP uniquement) |
| `country` | Texte | Pays du posteur |
| `country_code` | Texte | Code ISO du pays |
| `quoted_post_ids` | Liste | IDs des publications citées |
| `quoted_content` | Texte | Contenu des publications citées |
| `image_url` | URL | Lien vers l'image complète |
| `thumbnail_url` | URL | Lien vers la miniature |

### 3.2 Particularités de 4chan

Contrairement à Reddit ou d'autres plateformes :

- **Pas de système de votes** : L'engagement se mesure par le nombre de réponses
- **Anonymat** : La plupart des utilisateurs postent sous "Anonymous"
- **IDs temporaires** : Chaque utilisateur reçoit un ID unique par fil de discussion
- **Drapeaux pays** : Sur /pol/, le pays de l'utilisateur est affiché

---

## 4. Fonctionnalités Implémentées

### 4.1 Mode Snapshot (Instantané)

Capture l'état complet du board à un instant T :

```bash
npm run start:snapshot
```

- Récupère la liste de tous les fils actifs (~150 threads)
- Télécharge chaque fil avec toutes ses réponses
- Exporte l'ensemble en un fichier CSV horodaté

**Temps estimé** : ~3-5 minutes pour un board complet

### 4.2 Mode Monitor (Surveillance Continue)

Surveille en temps réel les nouvelles publications :

```bash
npm run start:monitor
```

- Vérifie les nouveaux contenus toutes les 60 secondes
- Détecte les nouvelles publications (évite les doublons)
- Ajoute les données au fichier CSV de manière incrémentale

### 4.3 Résolution des Citations

Fonctionnalité clé pour l'analyse conversationnelle :

Lorsqu'un utilisateur cite un autre message (ex: `>>524554423`), le système :

1. Identifie les IDs des posts cités
2. Recherche ces posts dans le fil de discussion
3. Inclut leur contenu textuel dans le champ `quoted_content`

**Exemple de sortie** :
```
quoted_post_ids: "524554423;524554500"
quoted_content: "[>>524554423]: Texte du premier post cité
---
[>>524554500]: Texte du second post cité"
```

### 4.4 Gestion des Contraintes API

Le système respecte scrupuleusement les règles de l'API 4chan :

| Contrainte | Implémentation |
|------------|----------------|
| 1 requête/seconde max | Queue avec intervalle de 1100ms |
| Header If-Modified-Since | Cache des timestamps pour éviter les téléchargements inutiles |
| Gestion des erreurs | Retry automatique avec backoff exponentiel |
| Rate limiting (429) | Attente du délai indiqué par le serveur |

---

## 5. Traitement des Données

### 5.1 Nettoyage du Contenu HTML

Le contenu brut de l'API contient du HTML qui est nettoyé :

| Élément HTML | Traitement |
|--------------|------------|
| `<br>` | Remplacé par saut de ligne |
| `<a class="quotelink">` | Conserve le texte (>>123456) |
| `<span class="quote">` | Conserve le texte (greentext) |
| `&gt;`, `&#039;` | Décodage des entités HTML |
| Autres balises | Supprimées |

### 5.2 Construction des URLs d'Images

Les images sont hébergées sur le CDN 4chan :

- **Image complète** : `https://i.4cdn.org/pol/{timestamp}{extension}`
- **Miniature** : `https://i.4cdn.org/pol/{timestamp}s.jpg`

---

## 6. Format de Sortie

### 6.1 Fichier CSV

Les données sont exportées en CSV avec encodage UTF-8 :

```
output/pol_2024-12-30T11-30-00_snapshot.csv
```

### 6.2 Exemple de Données

```csv
post_id,thread_id,auteur,texte,plateforme,date,type,engagement_replies,...
524554423,524554000,"Anonymous (ABC123)","Exemple de contenu...",4chan,1703945123,reply,,,,...
```

---

## 7. Considérations Éthiques et Légales

### 7.1 Respect des Conditions d'Utilisation

- Utilisation de l'API officielle (read-only)
- Respect strict des rate limits
- Pas de contournement des protections

### 7.2 Utilisation des Données

- Données publiques uniquement
- Usage strictement académique/recherche
- Pas de republication du contenu
- Anonymisation des analyses publiées

### 7.3 Stockage et Sécurité

- Données stockées localement
- Pas de partage avec des tiers
- Suppression après analyse

---

## 8. Perspectives d'Analyse

### 8.1 Analyses Possibles

Avec ce corpus, plusieurs analyses sont envisageables :

1. **Analyse de sentiment** : Classification positive/négative des discours
2. **Détection de topics** : Identification automatique des sujets (vaccins, 5G, etc.)
3. **Analyse de réseau** : Graphe des interactions entre utilisateurs
4. **Analyse temporelle** : Évolution des discours dans le temps
5. **Analyse géographique** : Répartition par pays

### 8.2 Outils Recommandés pour l'Analyse

| Outil | Usage |
|-------|-------|
| Python + Pandas | Manipulation des données CSV |
| spaCy / NLTK | Traitement du langage naturel |
| scikit-learn | Classification automatique |
| NetworkX | Analyse de réseau |
| Matplotlib / Plotly | Visualisation |

---

## 9. Conclusion

Ce système de collecte de données constitue la première étape d'un projet de recherche sur les discours en ligne. Il fournit :

- Une **infrastructure robuste** respectant les contraintes techniques
- Des **données structurées** prêtes pour l'analyse
- Une **traçabilité complète** des relations entre messages
- Une **documentation détaillée** pour la reproductibilité

La prochaine étape consistera à appliquer des techniques de NLP (Natural Language Processing) pour classifier automatiquement les types de discours et identifier les patterns de désinformation.

---

## Annexes

### A. Commandes Utiles

```bash
# Installation des dépendances
npm install

# Scraper /pol/ (Politically Incorrect)
npm run scrape:pol

# Scraper /x/ (Paranormal) - idéal pour les théories du complot
npm run scrape:x

# Scraper n'importe quel board
npm run start -- --mode snapshot --board biz   # /biz/ - Business & Finance
npm run start -- --mode snapshot --board v     # /v/ - Video Games

# Surveillance continue de /pol/
npm run monitor:pol

# Surveillance continue de /x/
npm run monitor:x

# Options avancées
npm run start -- --mode snapshot --board x --output ./data/paranormal

# Vérifier le code TypeScript
npx tsc --noEmit
```

### B. Boards Recommandés pour l'Analyse

| Board | Code | Contenu typique |
|-------|------|-----------------|
| /pol/ | `pol` | Politique, actualités, théories du complot |
| /x/ | `x` | Paranormal, conspirations, ésotérisme |
| /biz/ | `biz` | Crypto-monnaies, finance, arnaques |
| /b/ | `b` | Contenu aléatoire (attention: NSFW) |
| /v/ | `v` | Jeux vidéo, gaming culture |

### C. Statistiques Typiques

Pour un snapshot du board /pol/ :

- ~150 fils de discussion actifs
- ~15,000-25,000 publications totales
- ~60% de réponses avec citations
- ~40% de publications avec images
- Top pays : États-Unis, Royaume-Uni, Canada, Australie

---

*Document rédigé dans le cadre du MBA ESLSCA*
*Date : Décembre 2024*

