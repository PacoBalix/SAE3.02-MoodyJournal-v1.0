const express = require('express');
const session = require('express-session');
const fs = require('fs').promises;
const path = require('path');

const PORT = 3000;
const app = express();

// === Middleware ===
app.use(express.json()); // pour parser le JSON
app.use(express.urlencoded({ extended: true })); // pour parser les form-data

// Servir les fichiers statiques (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public'))); // sert le dossier /public
// Servir les assets
app.use('/assets', express.static('assets'));


// Définition du chemin du fichier journal.json
const DATA_FILE = path.join(__dirname, 'public', 'data', 'journal.json');

const ensureDir = async () => {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
};

// Définition des utilisateurs en mémoire

const users = [
  { username: 'Alix', password: 'alixpassword' },
  { username: 'Lallie', password: 'lalliepassword' },
  { username: 'Emmanuel', password: 'emmanuelpassword'},
  { username: 'Noa', password: 'noapassword' }
];

// Configuration de la session utilisateur avec sécurité renforcée
app.use(session({
  secret: 'unSecretTresLongEtUnique',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 60 * 60 * 1000, // 1h
    httpOnly: true, // Protection XSS
    secure: process.env.NODE_ENV === 'production', // HTTPS en prod
    sameSite: 'lax' // Protection CSRF
  },
  name: 'sessionId' // Nom de cookie personnalisé
}));

// Middleware de session pour le debugging
app.use((req, res, next) => {
  console.log(`📍 ${req.method} ${req.path} - User: ${req.session.user || 'Non connecté'}`);
  next();
});

// Routes d'authentification avec validation et messages d'erreur
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/journal');
  }
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Connexion - MoodyJournal</title>
      <style>
        body { font-family: system-ui; max-width: 500px; margin: 2rem auto; padding: 0 1rem; }
        .error { color: #dc2626; margin: 1rem 0; }
        form { display: flex; flex-direction: column; gap: 1rem; }
        input { padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }
        button { padding: 0.5rem; background: #16a34a; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #15803d; }
      </style>
    </head>
    <body>
      <h1>Connexion</h1>
      ${req.query.error ? '<p class="error">Identifiants invalides</p>' : ''}
      <form method="post">
        <input name="username" placeholder="Nom d'utilisateur" required autocomplete="username"/>
        <input name="password" type="password" placeholder="Mot de passe" required autocomplete="current-password"/>
        <button type="submit">Se connecter</button>
      </form>
      <p style="margin-top: 1rem">
        <small>Utilisateurs de test : Alix, Lallie, Emmanuel, Noa</small>
      </p>
    </body>
    </html>
  `);
});

app.post('/login', express.urlencoded({ extended: true }), (req, res) => {
  const { username, password } = req.body;

  // Validation des entrées
  if (!username || !password) {
    return res.redirect('/login?error=1');
  }

  const user = users.find(u => u.username === username && u.password === password);
  
  if (user) {
    req.session.user = user.username;
    req.session.loginTime = Date.now();
    console.log(`✅ Connexion réussie: ${user.username}`);
    res.redirect('/index.html'); // Redirection vers la page principale
  } else {
    console.log(`❌ Tentative de connexion échouée pour: ${username}`);
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  const username = req.session.user;
  req.session.destroy(() => {
    console.log(`👋 Déconnexion: ${username}`);
    res.redirect('/login');
  });
});

// Route pour vérifier l'état de la session
app.get('/api/session', (req, res) => {
  if (req.session.user) {
    res.json({ 
      authenticated: true, 
      user: req.session.user 
    });
  } else {
    res.status(401).json({ 
      authenticated: false 
    });
  }
});

// Route pour les préférences utilisateur
app.get('/api/user-preferences', requireAuth, async (req, res) => {
  try {
    // Par défaut, Vanta est désactivé
    let preferences = {
      enableVanta: false,
      theme: 'light',
      animations: true
    };

    // TODO: Charger les préférences depuis la base de données
    // Pour l'instant, on retourne des valeurs par défaut
    res.json(preferences);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors du chargement des préférences' });
  }
});

// Protéger les routes (middleware d'authentification)
function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      res.status(401).json({ error: 'Non authentifié' });
    } else {
      res.redirect('/login');
    }
  } else {
    // Vérifier si la session n'est pas expirée
    const sessionAge = Date.now() - (req.session.loginTime || 0);
    if (sessionAge > req.session.cookie.maxAge) {
      req.session.destroy(() => {
        res.redirect('/login');
      });
    } else {
      next();
    }
  }
}

// Gestionnaire de journal avec gestion d'erreurs
class JournalManager {
  constructor(dataPath) {
    this.dataPath = dataPath;
    this.ensureDataDirectory();
  }

  async ensureDataDirectory() {
    try {
      await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') {
        console.error('Erreur lors de la création du répertoire:', err);
      }
    }
  }

  async load() {
    try {
      const data = await fs.readFile(this.dataPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return {}; // Fichier n'existe pas encore
      }
      console.error('Erreur de lecture du journal:', err);
      throw new Error('Impossible de charger le journal');
    }
  }

  async save(data) {
    try {
      await this.ensureDataDirectory();
      await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Erreur de sauvegarde du journal:', err);
      throw new Error('Impossible de sauvegarder le journal');
    }
  }

  async getUserEntries(username) {
    try {
      const journal = await this.load();
      return journal[username] || [];
    } catch (err) {
      console.error('Erreur de lecture des entrées:', err);
      throw new Error('Impossible de récupérer les entrées');
    }
  }

  async addEntry(username, entry) {
    try {
      const journal = await this.load();
      if (!journal[username]) {
        journal[username] = [];
      }
      journal[username].push(entry);
      await this.save(journal);
    } catch (err) {
      console.error('Erreur d\'ajout d\'entrée:', err);
      throw new Error('Impossible d\'ajouter l\'entrée');
    }
  }
}

const journalManager = new JournalManager(path.join(__dirname, 'data', 'journal.json'));

// Suppression des routes /journal inutiles
// app.post('/journal', ...);
// app.get('/journal', ...);


// API de sauvegarde du journal (utilisé par journal.html)
app.post('/api/save-journal', requireAuth, async (req, res) => {
  try {
    const newEntry = req.body;
    // Ajouter les métadonnées
    newEntry.user = req.session.user;
    newEntry.savedAt = new Date().toISOString();

    await ensureDir();
    let data = [];
    try {
      const fileContent = await fs.readFile(DATA_FILE, 'utf-8');
      if (fileContent.trim()) {
        data = JSON.parse(fileContent);
      }
    } catch (err) {
      console.warn('Fichier inexistant ou corrompu, création d\'un nouveau.');
    }

    data.push(newEntry);
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');

    console.log(`✅ Journal sauvegardé pour ${req.session.user}`);
    res.status(200).json({ success: true, message: 'Journal saved' });
  } catch (err) {
    console.error('Erreur :', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Route pour récupérer les entrées du journal (utilisé par view.html)
app.get('/api/journal-entries', async (req, res) => {
  try {
    const data = await fs.readFile(path.join(__dirname, 'data', 'journal.json'), 'utf-8');
    const entries = JSON.parse(data);
    res.json(entries);
  } catch (err) {
    console.error('Erreur lors de la lecture du fichier journal.json:', err);
    res.status(500).json({ error: 'Impossible de charger les entrées du journal.' });
  }
});*/


// === Démarrage du serveur ===
app.listen(PORT, () => {
  console.log(`🚀 Serveur en cours sur http://localhost:${PORT}`);
  console.log(`📂 Assure-toi que les pages HTML soit dans /public`);
});   