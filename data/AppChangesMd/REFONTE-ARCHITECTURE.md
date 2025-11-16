# 🏗️ Refonte Architecture MoodyJournal

## 📊 Vue d'ensemble

Cette refonte transforme MoodyJournal en une application de journaling moderne basée sur les meilleures pratiques de psychologie positive, TCC, et design centré utilisateur.

## 🎯 Principes Directeurs

1. **Honnêteté par le Design** - Créer un espace sans jugement qui encourage l'authenticité
2. **Privacy-First** - Sécurité et confidentialité au cœur du produit
3. **Gamification Éthique** - Motivation sans compétition ni anxiété
4. **Intelligence Empathique** - IA qui comprend et s'adapte à l'utilisateur
5. **Progression Graduelle** - Du simple au profond, respecter le rythme de chacun

## 📝 Types d'Entrées

### 1. Entrée d'Humeur (Mood Entry)
**Format :** Rapide, visuel, micro-journalisation
```json
{
  "type": "mood",
  "date": "2025-10-24",
  "timestamp": "2025-10-24T20:30:00Z",
  "mood": 7,
  "primaryEmotion": "contentment",
  "intensity": 3,
  "emoji": "😊",
  "activities": ["sport", "amis", "lecture"],
  "triggers": ["réunion stressante"],
  "note": "Bonne journée dans l'ensemble"
}
```

**Features :**
- Sélection emoji ou échelle 1-10
- Émotions primaires catégorisées
- Intensité émotionnelle
- Activités personnalisables
- Triggers identifiés

### 2. Suivi des Habitudes (Habit Tracking)
**Format :** Checkboxes, streaks, groupes d'habitudes
```json
{
  "type": "habit",
  "date": "2025-10-24",
  "habits": [
    {
      "id": "sport-morning",
      "name": "Sport matinal",
      "completed": true,
      "time": "07:30",
      "streak": 12,
      "category": "physical"
    },
    {
      "id": "meditation",
      "name": "Méditation",
      "completed": true,
      "time": "20:00",
      "streak": 8,
      "category": "mental"
    }
  ],
  "stacks": [
    {
      "name": "Routine Matinale",
      "habits": ["sport-morning", "breakfast-healthy", "shower-cold"]
    }
  ]
}
```

**Features :**
- Streaks visuels avec feu 🔥
- Groupes d'habitudes (stacks)
- Rappels personnalisables
- Statistiques détaillées (taux de complétion, meilleur streak)
- Visualisation calendrier

### 3. Suivi d'Addictions (Addiction Recovery)
**Format :** Timeline, jalons, déclencheurs
```json
{
  "type": "addiction",
  "addictionId": "smoking",
  "name": "Arrêt du tabac",
  "startDate": "2025-09-01",
  "currentStreak": 53,
  "longestStreak": 53,
  "milestones": [
    {
      "day": 1,
      "reached": true,
      "date": "2025-09-02"
    },
    {
      "day": 7,
      "reached": true,
      "date": "2025-09-08"
    },
    {
      "day": 30,
      "reached": true,
      "date": "2025-10-01"
    }
  ],
  "triggerMap": {
    "morning": 2,
    "afternoon": 1,
    "evening": 5,
    "night": 3,
    "stress": 8,
    "social": 4
  },
  "savingsCalculated": {
    "money": 265.00,
    "time": "8h30min",
    "cigarettes": 530
  },
  "withdrawalTimeline": [
    {
      "phase": "20 minutes",
      "description": "La pression artérielle et le rythme cardiaque reviennent à la normale"
    },
    {
      "phase": "24 heures",
      "description": "Le risque d'accident cardiaque commence à diminuer"
    }
  ]
}
```

**Features :**
- Compteur de sobriété en temps réel
- Jalons franchis (1 jour, 1 semaine, 1 mois, 6 mois, 1 an)
- Timeline de sevrage avec ce à quoi s'attendre
- Carte des déclencheurs (moments/situations à risque)
- Calcul des économies (argent, temps, santé)
- Message de motivation personnalisé

### 4. Journal Libre (Free Journal)
**Format :** Texte enrichi, multimédia, flexible
```json
{
  "type": "journal",
  "date": "2025-10-24",
  "timestamp": "2025-10-24T21:00:00Z",
  "title": "Réflexion sur la journée",
  "content": "Texte riche avec **markdown**",
  "media": [
    {
      "type": "image",
      "url": "/uploads/photo.jpg",
      "caption": "Coucher de soleil"
    }
  ],
  "location": {
    "name": "Paris",
    "coordinates": null
  },
  "linkedContent": [
    {
      "type": "music",
      "title": "Clair de Lune - Debussy",
      "url": "https://spotify.com/..."
    }
  ],
  "tags": ["réflexion", "gratitude", "famille"]
}
```

**Features :**
- Éditeur texte riche (markdown)
- Pièces jointes (photos, vidéos, audio)
- Localisation optionnelle
- Liens vers articles, musiques, podcasts
- Tags personnalisés

## 🧠 Intégration TCC (Thérapie Cognitivo-Comportementale)

### Modèle ABC
Structure pour analyser les situations difficiles :

```json
{
  "type": "cbt-abc",
  "date": "2025-10-24",
  "activatingEvent": {
    "description": "Mon manager a critiqué mon travail en réunion",
    "context": "Réunion d'équipe, 10 personnes présentes"
  },
  "beliefs": {
    "automaticThoughts": [
      "Je suis nul",
      "Je vais me faire virer",
      "Tout le monde me juge"
    ],
    "distortions": [
      {
        "type": "catastrophizing",
        "thought": "Je vais me faire virer",
        "identified": true
      },
      {
        "type": "overgeneralization",
        "thought": "Je suis nul",
        "identified": true
      }
    ]
  },
  "consequences": {
    "emotional": ["anxiété", "honte", "colère"],
    "emotional_intensity": 8,
    "behavioral": "Éviter le manager, ne pas parler en réunion"
  },
  "reframing": {
    "evidenceFor": ["Il a dit que ce rapport manquait de détails"],
    "evidenceAgainst": [
      "Il a aussi dit que le reste était bon",
      "J'ai eu de bons retours la semaine dernière",
      "Je n'ai jamais eu d'avertissement"
    ],
    "alternativeThought": "Ce rapport n'était pas optimal, mais je peux l'améliorer. Un feedback n'est pas une condamnation.",
    "actionPlan": "Demander des précisions, refaire le rapport, apprendre de cette expérience"
  }
}
```

### Questions Progressives

**Niveau 1 - Surface (Jours 1-7)**
- Comment vous sentez-vous aujourd'hui ?
- Qu'est-ce qui a rendu votre journée spéciale ?
- Pour quoi êtes-vous reconnaissant ?

**Niveau 2 - Intermédiaire (Jours 8-30)**
- Quel a été votre plus grand défi aujourd'hui ?
- Qu'avez-vous appris sur vous-même ?
- Qu'est-ce qui vous a donné / drainé de l'énergie ?

**Niveau 3 - Profond (Jour 30+)**
- Quelle peur vous retient actuellement ?
- Quel pattern récurrent remarquez-vous ?
- Comment votre comportement d'aujourd'hui reflète-t-il vos valeurs ?

## 🎮 Gamification Éthique

### Streaks
- **Visuel :** 🔥 avec nombre de jours
- **Non punitif :** Rupture du streak = encouragement à recommencer, pas de culpabilisation
- **Statistiques positives :** "Vous avez écrit 42 fois ce trimestre" plutôt que "Vous avez manqué 50 jours"

### Badges
Basés sur la progression personnelle, pas la compétition :

```json
{
  "badges": [
    {
      "id": "first-entry",
      "name": "Premier Pas",
      "description": "Votre première entrée !",
      "icon": "🌱",
      "unlocked": true,
      "unlockedAt": "2025-10-01"
    },
    {
      "id": "week-streak",
      "name": "Régularité",
      "description": "7 jours consécutifs",
      "icon": "🔥",
      "unlocked": true,
      "unlockedAt": "2025-10-08"
    },
    {
      "id": "deep-reflection",
      "name": "Profondeur",
      "description": "Entrée de plus de 500 mots",
      "icon": "🌊",
      "unlocked": true,
      "unlockedAt": "2025-10-10"
    },
    {
      "id": "pattern-discovered",
      "name": "Découverte",
      "description": "Premier pattern émotionnel identifié",
      "icon": "💡",
      "unlocked": false
    }
  ]
}
```

### Calendrier en Pixels (Year in Pixels)
- Chaque jour = un pixel coloré selon l'humeur
- Vue année complète en un coup d'œil
- Visualisation puissante de l'évolution émotionnelle
- Export en image pour partage (optionnel)

## 🔔 Notifications Intelligentes

### Système Adaptatif

```json
{
  "notificationPreferences": {
    "enabled": true,
    "frequency": "daily",
    "preferredTime": "20:30",
    "adaptiveTimingEnabled": true,
    "learnedBehavior": {
      "mostLikelyToWrite": "22:00",
      "lessResponsiveOn": ["dimanche"],
      "adjustedTime": "21:45"
    }
  },
  "messageRotation": [
    {
      "type": "question",
      "message": "Qu'est-ce qui a rendu aujourd'hui spécial ?"
    },
    {
      "type": "streak",
      "message": "Votre streak de {days} jours vous attend ! 🔥"
    },
    {
      "type": "insight",
      "message": "Vous semblez plus heureux les mercredis - explorons pourquoi ?"
    }
  ]
}
```

### Règles de Notification
- **Maximum :** 1 par jour
- **Timing par défaut :** 20h-21h (golden hour)
- **Personnalisation :** Ajustement automatique selon le comportement
- **Variété :** 5+ templates de messages différents
- **Respect :** Désactivation facile, pas de harcèlement

## 🔒 Sécurité & RGPD

### Niveaux de Confidentialité

**Niveau 1 : Standard (Cloud chiffré)**
- Stockage serveur avec chiffrement AES-256
- Transmission HTTPS
- Backup automatique

**Niveau 2 : Renforcé (End-to-End)**
- Chiffrement E2E avec clé utilisateur
- Serveur ne peut pas lire les données
- Backup chiffré

**Niveau 3 : Maximal (Local only)**
- Stockage 100% local (IndexedDB)
- Aucune transmission réseau
- Backup manuel

### Droits RGPD Implémentés

```javascript
// Export de données
GET /api/export-data
→ Retourne ZIP avec :
  - journal-entries.json
  - habits.json
  - addictions.json
  - media/ (photos, audio)
  - report.pdf (résumé lisible)

// Suppression complète
DELETE /api/delete-account
→ Supprime immédiatement :
  - Toutes les entrées
  - Tous les médias
  - Toutes les métadonnées
  - Le compte utilisateur
```

## 📊 Visualisations & Insights

### Dashboard Principal

**Métriques Clés**
- Humeur moyenne (7 derniers jours, 30 derniers jours, 90 derniers jours)
- Streak actuel d'écriture
- Habitudes complétées aujourd'hui
- Jours de sobriété (si applicable)

**Graphiques**
1. **Évolution de l'humeur** - Line chart sur période sélectionnable
2. **Calendrier en pixels** - Vue mois/année
3. **Distribution des émotions** - Bar chart
4. **Patterns temporels** - Humeur par jour de la semaine, par heure
5. **Corrélations** - Activités vs humeur, sommeil vs humeur
6. **Progression TCC** - Nombre de distorsions identifiées, situations reframées

### Insights IA (Futur)

**Exemples d'insights générés :**
- "Vous semblez plus heureux après avoir fait du sport le matin"
- "Votre humeur baisse souvent les lundis - peut-être planifier quelque chose d'agréable ?"
- "Vous avez utilisé le mot 'anxieux' 12 fois ce mois, contre 5 le mois dernier"
- "Votre streak d'habitudes le plus long était en mars - qu'est-ce qui fonctionnait alors ?"

## 🚀 Onboarding

### Flux Minimaliste

**Étape 1 : Bienvenue (15 secondes)**
- Message d'accueil chaleureux
- Promesse de valeur claire
- Un seul CTA : "Créer ma première entrée"

**Étape 2 : Première Entrée (2 minutes)**
- Interface simplifiée : juste humeur + émotion
- Encouragement en temps réel
- Célébration immédiate du succès

**Étape 3 : Aperçu de Valeur (30 secondes)**
- "Voici votre première entrée !"
- Aperçu du calendrier (1 pixel coloré)
- Message : "Revenez demain pour construire votre streak 🔥"

**Étapes 4-7 : Découverte Progressive**
- Jour 2 : Introduction des habitudes
- Jour 3 : Introduction du journal libre
- Jour 7 : Déblocage des insights
- Jour 14 : Introduction du modèle TCC

## 🗄️ Structure de Données

### Format Unifié d'Entrée

```json
{
  "userId": 1,
  "entryId": "uuid-v4",
  "type": "mood|habit|addiction|journal|cbt",
  "date": "2025-10-24",
  "timestamp": "2025-10-24T20:30:00Z",
  "data": {
    // Contenu spécifique au type
  },
  "metadata": {
    "createdAt": "2025-10-24T20:30:00Z",
    "updatedAt": "2025-10-24T20:35:00Z",
    "timezone": "Europe/Paris",
    "deviceType": "mobile",
    "appVersion": "2.0.0"
  }
}
```

### Base de Données Recommandée

**Pour production future :**
- PostgreSQL avec Prisma ORM
- Migrations versionnées
- Indexes sur userId, date, type
- Partitioning par date pour performance

**Pour prototype actuel :**
- Fichiers JSON séparés par type :
  - `data/entries-mood.json`
  - `data/entries-habit.json`
  - `data/entries-addiction.json`
  - `data/entries-journal.json`
  - `data/entries-cbt.json`

## 🎨 Design System

### Palette Émotionnelle

```css
/* Humeurs */
--mood-1-3: #ef4444 (rouge - difficile)
--mood-4-5: #f97316 (orange - moyen-bas)
--mood-6-7: #facc15 (jaune - moyen)
--mood-8-9: #84cc16 (vert clair - bien)
--mood-10: #22c55e (vert - excellent)

/* Catégories */
--addiction: #dc2626
--mental-health: #3b82f6
--physical-health: #10b981
--social: #8b5cf6
--productivity: #f59e0b
```

### Composants Réutilisables
- MoodSelector (emoji ou échelle)
- StreakDisplay (🔥 + nombre)
- BadgeCard (icône + description)
- ProgressRing (cercle de progression)
- PixelCalendar (année en pixels)
- InsightCard (💡 + message)

## 📱 Responsive & Accessibilité

- **Mobile-first :** 80% des utilisateurs sur mobile
- **Touch-friendly :** Zones tactiles ≥ 44px
- **Keyboard navigation :** Accès complet sans souris
- **Screen readers :** Labels ARIA appropriés
- **Contrast :** WCAG AA minimum
- **Font size :** 16px minimum, scalable

## 🔄 Roadmap d'Implémentation

### Sprint 1 (Semaine 1) - Fondations
- [ ] Nouvelle structure de données
- [ ] Refonte journal.html avec 4 types d'entrées
- [ ] API routes pour nouveaux types
- [ ] Migration des données existantes

### Sprint 2 (Semaine 2) - Suivi & Streaks
- [ ] Système de suivi des habitudes
- [ ] Système de suivi d'addictions
- [ ] Calcul et affichage des streaks
- [ ] Page dédiée aux habitudes

### Sprint 3 (Semaine 3) - Gamification
- [ ] Système de badges
- [ ] Calendrier en pixels
- [ ] Visualisations avancées
- [ ] Dashboard amélioré

### Sprint 4 (Semaine 4) - TCC & Intelligence
- [ ] Modèle ABC pour TCC
- [ ] Questions progressives
- [ ] Identification des distorsions cognitives
- [ ] Suggestions de reframing

### Sprint 5 (Semaine 5) - Engagement
- [ ] Onboarding minimaliste
- [ ] Système de notifications
- [ ] Adaptation algorithmique
- [ ] Messages motivationnels

### Sprint 6 (Semaine 6) - Sécurité & Polish
- [ ] Chiffrement E2E optionnel
- [ ] Export de données RGPD
- [ ] Suppression complète
- [ ] Documentation utilisateur

## 🎯 KPIs de Succès

**Rétention**
- Jour 1 : > 35%
- Jour 7 : > 25%
- Jour 30 : > 15%
- Jour 90 : > 40%

**Engagement**
- Fréquence : 4+ fois/semaine
- Longueur moyenne : 150+ mots
- Temps sur insights : 2+ minutes
- Completion onboarding : > 70%

**Satisfaction**
- NPS : > 50
- Rating app : > 4.5/5
- Taux de recommandation : > 60%

---

**Cette architecture transforme MoodyJournal d'un simple journal digital en un véritable compagnon de développement personnel, scientifiquement fondé et centré sur l'utilisateur.**

