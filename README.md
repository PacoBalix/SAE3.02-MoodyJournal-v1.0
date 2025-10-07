# Projet SAE 3.02 - MoodyJournal

## Description

**MoodyJournal** est une application web de journaling personnel qui s'adapte aux besoins individuels de chaque utilisateur. L'application permet de :

- **Exprimer ses émotions** et suivre son humeur au quotidien
- **Documenter ses journées** avec des sections personnalisables
- **Visualiser ses progrès** grâce à des graphiques et analyses
- **Personnaliser l'expérience** selon ses préférences et objectifs
- **Exporter ses données** de manière filtrée et pertinente

Ce projet s'inscrit dans une démarche de bien-être personnel et de développement, en offrant un espace sécurisé et personnalisé pour la réflexion et l'amélioration continue.

---

## 🌟 Fonctionnalités principales

### 1. **Journal dynamique et personnalisable**
- **Sections adaptatives** : Choisissez les sections qui vous intéressent
  - 🎭 **Humeur** : Évaluation 1-10 + mots d'émotion
  - 🎯 **Objectifs** : Sommeil, exercice, nutrition, habitudes
  - 🙏 **Gratitude** : 3 gratitudes + meilleur moment
  - 🤔 **Réflexions** : Défis, patterns, sources d'énergie
  - 📚 **Apprentissages** : Insights personnels, nouvelles connaissances
  - 🌅 **Préparation** : Améliorations, affirmations
- **Thèmes visuels** : Émeraude, Bleu, ou Violet
- **Interface responsive** avec TailwindCSS

### 2. **Système de paramètres avancé**
- **Page de configuration** dédiée (`settings.html`)
- **Thèmes personnalisables** avec couleurs cohérentes
- **Sections activables/désactivables** selon vos besoins
- **Notifications configurables** avec choix de l'heure
- **Sauvegarde persistante** des préférences par utilisateur

### 3. **Visualisation et analyse**
- **Tableau de bord** avec statistiques personnalisées
- **Graphiques interactifs** (humeur, sommeil, etc.)
- **Navigation temporelle** entre les entrées
- **Export personnalisé** selon vos sections activées

### 4. **Authentification et sécurité**
- **Système de connexion** avec sessions sécurisées
- **Données privées** par utilisateur
- **Protection CSRF** et XSS
- **Gestion des erreurs** robuste

---

## 🚀 Installation

### Prérequis
- **Node.js** (version 16 ou supérieure)
- **npm** (inclus avec Node.js)

### Étapes d'installation
1. **Clonez le dépôt** :
   ```bash
   git clone https://github.com/PacoBalix/MoodyJournal.git
   cd MoodyJournal
   ```

2. **Installez les dépendances** :
   ```bash
   npm install
   ```

3. **Démarrez le serveur** :
   ```bash
   node app.js
   ```

4. **Accédez à l'application** :
   ```
   http://localhost:3000
   ```

### 🔑 Utilisateurs de test
- **Alix** / **Lallie** / **Emmanuel** / **Noa**
- Mot de passe : `[nom]password` (ex: `alixpassword`)

---

## 📁 Structure du projet

```
MoodyJournal/
├── 📄 app.js                 # Serveur Express principal
├── 📄 package.json           # Dépendances et scripts
├── 📁 public/                # Fichiers statiques
│   ├── 📄 index.html         # Page d'accueil
│   ├── 📄 journal.html       # Journal personnalisable
│   ├── 📄 journal.js         # Logique du journal dynamique
│   ├── 📄 view.html          # Consultation et export
│   ├── 📄 settings.html      # Paramètres utilisateur
│   └── 📁 js/
│       └── 📄 session-check.js # Vérification de session
├── 📁 data/                  # Données persistantes
│   ├── 📄 users.json         # Utilisateurs
│   ├── 📄 journal.json       # Entrées du journal
│   └── 📄 user-settings.json # Paramètres utilisateur
├── 📁 assets/                # Ressources
│   └── 📄 moodyjournal.svg   # Logo
└── 📄 README.md              # Documentation
```

---

## 🎯 Guide d'utilisation

### 1. **Première connexion**
1. Allez sur `http://localhost:3000`
2. Cliquez sur "Se connecter"
3. Utilisez un utilisateur de test (ex: Alix / alixpassword)

### 2. **Configuration de vos paramètres**
1. Allez dans **"Paramètres"** (icône ⚙️)
2. **Choisissez votre thème** : Émeraude, Bleu, ou Violet
3. **Activez les sections** qui vous intéressent :
   - 🎭 Humeur du jour
   - 🎯 Objectifs et habitudes
   - 🙏 Gratitude
   - 🤔 Réflexions
   - 📚 Apprentissages
   - 🌅 Préparation du lendemain
4. **Configurez les notifications** si souhaité
5. **Sauvegardez** vos paramètres

### 3. **Utilisation du journal**
1. Allez dans **"Écrire"**
2. Seules vos sections activées sont visibles
3. Remplissez les champs selon vos préférences
4. **Sauvegardez** votre entrée

### 4. **Consultation et export**
1. Allez dans **"Consulter"**
2. Naviguez entre vos entrées
3. **Exportez vos données** avec le bouton "📊 Exporter"
4. Le fichier contient uniquement vos sections activées

---

## 🔧 API Endpoints

### Authentification
- `GET /api/session` - Vérifier l'état de la session
- `POST /login` - Connexion utilisateur
- `GET /logout` - Déconnexion

### Journal
- `POST /api/save-journal` - Sauvegarder une entrée
- `GET /api/journal-entries` - Récupérer les entrées

### Paramètres
- `GET /api/user-settings` - Récupérer les paramètres
- `POST /api/save-settings` - Sauvegarder les paramètres

### Test
- `GET /api/test` - Test de connectivité API

---

## 🎨 Personnalisation

### Thèmes disponibles
- **🌿 Émeraude** : Vert apaisant, parfait pour la relaxation
- **💙 Bleu** : Bleu calme, idéal pour la concentration
- **💜 Violet** : Violet créatif, stimule l'inspiration

### Profils recommandés
- **Bien-être** : Humeur + Gratitude + Réflexions
- **Productivité** : Objectifs + Apprentissages + Préparation
- **Créativité** : Humeur + Réflexions + Apprentissages
- **Minimaliste** : Humeur + Gratitude

---

## 🛠️ Développement

### Scripts disponibles
```bash
# Test des API
node test-api.js

# Test du système dynamique
node test-dynamic-journal.js

# Démarrage du serveur
node app.js
```

### Structure des données
- **Paramètres** : `data/user-settings.json`
- **Journal** : `data/journal.json`
- **Utilisateurs** : `data/users.json`

---

## 📊 Fonctionnalités avancées

### Export personnalisé
- **Filtrage automatique** selon vos paramètres
- **Métadonnées incluses** : paramètres, sections, date
- **Format JSON structuré** pour analyse

### Sauvegarde intelligente
- **Sections conditionnelles** : seules les sections activées sont sauvegardées
- **Données cohérentes** selon vos préférences
- **Évolution personnalisée** du bien-être

### Interface adaptative
- **Chargement dynamique** des paramètres
- **Application automatique** des thèmes
- **Visibilité conditionnelle** des sections

---

## 🚨 Dépannage

### Problèmes courants
1. **Erreur 404 sur les API** : Redémarrez le serveur
2. **Session expirée** : Reconnectez-vous
3. **Paramètres non sauvegardés** : Vérifiez la console du navigateur

### Logs de débogage
- **Console serveur** : Logs détaillés des opérations
- **Console navigateur** : Erreurs JavaScript
- **Fichiers de données** : Vérification de la persistance

---

## 🎯 Prochaines fonctionnalités

- **Analyses personnalisées** selon les sections
- **Recommandations intelligentes** basées sur les patterns
- **Objectifs adaptatifs** selon la progression
- **Communauté** avec des profils similaires
- **Notifications push** pour les rappels