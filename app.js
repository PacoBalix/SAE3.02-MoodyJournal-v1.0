const express = require('express');
const session = require('express-session');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');

const PORT = 3000;
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// === Middleware ===
app.use(express.json({ limit: '10mb' })); // pour parser le JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // pour parser les form-data

// Désactiver CSP pour éviter les erreurs avec les CDN externes
app.use((req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  next();
});

// Servir les fichiers statiques (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public'))); // sert le dossier /public
// Servir les assets
app.use('/assets', express.static('assets'));

// Middleware pour injecter les données utilisateur dans toutes les vues
app.use(async (req, res, next) => {
  try {
    // Injecter les données utilisateur dans toutes les vues
    res.locals.user = req.session ? req.session.user : null;
    res.locals.authenticated = !!(req.session && req.session.user);
    
    next();
  } catch (err) {
    console.error('Erreur middleware utilisateur:', err);
    res.locals.user = null;
    res.locals.authenticated = false;
    next();
  }
});

// Définition des chemins des fichiers
const DATA_FILE = path.join(__dirname, 'public', 'data', 'journal.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const FRIENDS_FILE = path.join(__dirname, 'data', 'friends.json');

const ensureDir = async () => {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
};

// Charger les utilisateurs depuis users.json
let users = [];
async function loadUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    users = JSON.parse(data);
    console.log('✅ Utilisateurs chargés depuis users.json');
  } catch (err) {
    console.log('⚠️ Fichier users.json non trouvé, utilisation des utilisateurs par défaut');
    users = [
      { username: 'Alix', password: 'alixpassword' },
      { username: 'Lallie', password: 'lalliepassword' },
      { username: 'Emmanuel', password: 'emmanuelpassword'},
      { username: 'Noa', password: 'noapassword' }
    ];
  }
}

// Configuration de la session utilisateur
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

// Initialiser les utilisateurs au démarrage
loadUsers();

// Routes principales
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

app.get('/journal', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/index.html?login');
  }
  res.redirect('/journal.html');
});

app.get('/view', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/index.html?login');
  }
  res.redirect('/view.html');
});

app.get('/settings', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/index.html?login');
  }
  res.redirect('/settings.html');
});

// Routes d'authentification simples
// plus de page /login, on ouvre le modal sur /index.html
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/journal');
  }
  res.redirect('/index.html?login');
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
    console.log(`✅ Connexion réussie pour: ${username}`);
    res.redirect('/index.html'); // Redirection vers la page principale
  } else {
    console.log(`❌ Tentative de connexion échouée pour: ${username}`);
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  console.log(`👋 Déconnexion de: ${req.session.user || 'utilisateur inconnu'}`);
  req.session.destroy(() => {
    res.redirect('/index.html');
  });
});

// Route pour vérifier l'état de la session
app.get('/api/session', (req, res) => {
  const sessionInfo = {
    authenticated: !!req.session.user,
    user: req.session.user || null
  };
  console.log('📡 État de session:', sessionInfo);
  res.json(sessionInfo);
});

// Route de test pour vérifier que les API fonctionnent
app.get('/api/test', (req, res) => {
  console.log('🧪 Test API appelé');
  res.json({ 
    status: 'OK', 
    message: 'API fonctionne correctement',
    timestamp: new Date().toISOString()
  });
});

// Route pour les préférences utilisateur (pour éviter l'erreur 404)
app.get('/api/user-preferences', (req, res) => {
  const preferences = {
    enableVanta: false,
    theme: 'light',
    animations: true
  };
  res.json(preferences);
});

// Route pour lister les utilisateurs (pour debug)
app.get('/api/users', (req, res) => {
  const userList = users.map(u => ({ username: u.username }));
  res.json(userList);
});

// Route pour créer un nouvel utilisateur
app.post('/api/create-user', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }
    
    // Vérifier si l'utilisateur existe déjà
    const existingUser = users.find(u => u.username === username);
    if (existingUser) {
      return res.status(409).json({ error: 'Utilisateur déjà existant' });
    }
    
    // Ajouter le nouvel utilisateur
    const newUser = { username, password };
    users.push(newUser);
    
    // Sauvegarder dans le fichier
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    
    console.log(`✅ Nouvel utilisateur créé: ${username}`);
    res.json({ success: true, message: 'Utilisateur créé avec succès' });
    
  } catch (err) {
    console.error('❌ Erreur lors de la création de l\'utilisateur:', err);
    res.status(500).json({ error: 'Erreur lors de la création de l\'utilisateur' });
  }
});

// Route pour sauvegarder les paramètres utilisateur
app.post('/api/save-settings', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const settings = req.body;
    
    console.log(`⚙️ Sauvegarde des paramètres pour: ${username}`);
    console.log('📊 Paramètres reçus:', settings);
    
    // Créer le fichier de paramètres utilisateur s'il n'existe pas
    const settingsFile = path.join(__dirname, 'data', 'user-settings.json');
    
    let allSettings = {};
    try {
      const data = await fs.readFile(settingsFile, 'utf-8');
      allSettings = JSON.parse(data);
    } catch (err) {
      // Fichier n'existe pas encore, on le créera
      console.log('📁 Création du fichier de paramètres');
    }
    
    // Sauvegarder les paramètres pour cet utilisateur
    allSettings[username] = {
      ...settings,
      lastUpdated: new Date().toISOString()
    };
    
    await fs.writeFile(settingsFile, JSON.stringify(allSettings, null, 2));
    
    console.log(`✅ Paramètres sauvegardés pour ${username}`);
    res.json({ success: true, message: 'Paramètres sauvegardés avec succès' });
    
  } catch (err) {
    console.error('❌ Erreur lors de la sauvegarde des paramètres:', err);
    res.status(500).json({ error: 'Impossible de sauvegarder les paramètres' });
  }
});

// Route pour récupérer les paramètres utilisateur
app.get('/api/user-settings', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const settingsFile = path.join(__dirname, 'data', 'user-settings.json');

    console.log(`📖 Récupération des paramètres pour: ${username}`);

    let allSettings = {};
    try {
      const data = await fs.readFile(settingsFile, 'utf-8');
      allSettings = JSON.parse(data);
      console.log('📁 Fichier de paramètres trouvé');
    } catch (err) {
      console.log('📁 Fichier de paramètres non trouvé, utilisation des valeurs par défaut');
    }

    const userSettings = allSettings[username] || {
      trackingCategories: [],
      trackingOptions: {},
      sections: ['mood', 'goals', 'reflections'],
      notifications: [],
      reminderTime: '20:00'
    };

    console.log(`📖 Paramètres récupérés pour: ${username}`, userSettings);
    res.json(userSettings);

  } catch (err) {
    console.error('❌ Erreur lors de la récupération des paramètres:', err);
    res.status(500).json({ error: 'Impossible de récupérer les paramètres' });
  }
});


// Middleware pour les routes qui nécessitent une authentification
function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      res.status(401).json({ error: 'Authentification requise' });
    } else {
      res.redirect('/index.html?login');
    }
  } else {
    next();
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
      
      // Ajouter un timestamp à l'entrée
      entry.savedAt = new Date().toISOString();
      
      // Initialiser l'utilisateur s'il n'existe pas
      if (!journal[username]) {
        journal[username] = [];
      }
      
      // Ajouter l'entrée à l'utilisateur
      journal[username].push(entry);
      
      await this.save(journal);
      console.log(`✅ Entrée ajoutée pour ${username}`);
    } catch (err) {
      console.error('Erreur d\'ajout d\'entrée:', err);
      throw new Error('Impossible d\'ajouter l\'entrée');
    }
  }
}

const journalManager = new JournalManager(path.join(__dirname, 'data', 'journal.json'));

// API de sauvegarde du journal (utilisé par journal.html)
app.post('/api/save-journal', requireAuth, async (req, res) => {
  try {
    const newEntry = req.body;
    const username = req.session.user;
    
    console.log(`📝 Sauvegarde du journal pour: ${username}`);
    console.log('📊 Données reçues:', newEntry);
    
    await journalManager.addEntry(username, newEntry);
    console.log(`✅ Journal sauvegardé avec succès pour ${username}`);
    res.status(200).json({ success: true, message: 'Journal saved' });
  } catch (err) {
    console.error('❌ Erreur lors de la sauvegarde:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Route pour récupérer les entrées du journal (utilisé par view.html)
app.get('/api/journal-entries', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    console.log(`📖 Récupération des entrées pour: ${username}`);
    
    const entries = await journalManager.getUserEntries(username);
    console.log(`📋 ${entries.length} entrées trouvées pour ${username}`);
    res.json(entries);
  } catch (err) {
    console.error('❌ Erreur lors de la lecture du fichier journal.json:', err);
    res.status(500).json({ error: 'Impossible de charger les entrées du journal.' });
  }
});

// === Routes pour la gestion des amis ===

// Récupérer la liste des amis
app.get('/api/friends', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    console.log(`👥 Récupération des amis pour: ${username}`);
    
    let friendsData = {};
    try {
      const data = await fs.readFile(FRIENDS_FILE, 'utf-8');
      friendsData = JSON.parse(data);
    } catch (err) {
      console.log('📁 Fichier friends.json non trouvé, création...');
    }
    
    const userFriends = friendsData[username] || [];
    console.log(`📋 ${userFriends.length} amis trouvés pour ${username}`);
    res.json(userFriends);
    
  } catch (err) {
    console.error('❌ Erreur lors de la récupération des amis:', err);
    res.status(500).json({ error: 'Impossible de charger les amis' });
  }
});

// Ajouter un ami
app.post('/api/add-friend', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const { friendUsername } = req.body;
    
    console.log(`👥 ${username} veut ajouter ${friendUsername}`);
    
    if (!friendUsername) {
      return res.status(400).json({ error: 'Nom d\'utilisateur requis' });
    }
    
    // Vérifier que l'ami existe
    const friendExists = users.find(u => u.username === friendUsername);
    if (!friendExists) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // Charger les amis
    let friendsData = {};
    try {
      const data = await fs.readFile(FRIENDS_FILE, 'utf-8');
      friendsData = JSON.parse(data);
    } catch (err) {
      console.log('📁 Création du fichier friends.json');
    }
    
    // Initialiser la liste d'amis si nécessaire
    if (!friendsData[username]) {
      friendsData[username] = [];
    }
    
    // Vérifier si déjà ami
    if (friendsData[username].includes(friendUsername)) {
      return res.status(409).json({ error: 'Déjà ami' });
    }
    
    // Ajouter l'ami
    friendsData[username].push(friendUsername);
    
    // Ajouter réciproquement (optionnel)
    if (!friendsData[friendUsername]) {
      friendsData[friendUsername] = [];
    }
    if (!friendsData[friendUsername].includes(username)) {
      friendsData[friendUsername].push(username);
    }
    
    // Sauvegarder
    await fs.writeFile(FRIENDS_FILE, JSON.stringify(friendsData, null, 2));
    
    console.log(`✅ ${username} et ${friendUsername} sont maintenant amis`);
    res.json({ success: true, message: 'Ami ajouté avec succès' });
    
  } catch (err) {
    console.error('❌ Erreur lors de l\'ajout d\'ami:', err);
    res.status(500).json({ error: 'Impossible d\'ajouter l\'ami' });
  }
});

// === Socket.IO pour le chat en temps réel ===
const onlineUsers = new Map(); // Map<socketId, username>

io.on('connection', (socket) => {
  console.log('🔌 Nouvelle connexion Socket.IO:', socket.id);
  
  // Utilisateur se connecte
  socket.on('user-online', (username) => {
    onlineUsers.set(socket.id, username);
    console.log(`👤 ${username} est en ligne (${socket.id})`);
    
    // Envoyer la liste des utilisateurs en ligne
    const usersOnline = Array.from(onlineUsers.values());
    io.emit('users-online', usersOnline);
    
    // Notifier les autres utilisateurs
    socket.broadcast.emit('user-connected', username);
  });
  
  // Envoi de message
  socket.on('send-message', (data) => {
    const { to, message, from } = data;
    console.log(`💬 Message de ${from} vers ${to}: ${message}`);
    
    // Trouver le socket du destinataire
    for (const [socketId, username] of onlineUsers.entries()) {
      if (username === to) {
        io.to(socketId).emit('receive-message', {
          from: from,
          message: message,
          timestamp: new Date().toISOString()
        });
        console.log(`✅ Message envoyé à ${to}`);
        break;
      }
    }
  });
  
  // Déconnexion
  socket.on('disconnect', () => {
    const username = onlineUsers.get(socket.id);
    if (username) {
      onlineUsers.delete(socket.id);
      console.log(`👋 ${username} s'est déconnecté (${socket.id})`);
      
      // Mettre à jour la liste des utilisateurs en ligne
      const usersOnline = Array.from(onlineUsers.values());
      io.emit('users-online', usersOnline);
      
      // Notifier les autres utilisateurs
      socket.broadcast.emit('user-disconnected', username);
    }
  });
});

// === Démarrage du serveur ===
server.listen(PORT, () => {
  console.log(`🚀 Serveur en cours sur http://localhost:${PORT}`);
  console.log(`📂 Assure-toi que les pages HTML soit dans /public`);
  console.log(`💬 Socket.IO activé pour le chat en temps réel`);
});