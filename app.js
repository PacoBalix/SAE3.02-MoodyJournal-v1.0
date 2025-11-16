const express = require('express');
const session = require('express-session');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
const { marked } = require('marked');

const PORT = 80;
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
// Servir le dossier data pour accès aux JSON
app.use('/data', express.static('data'));

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

// === Système de Chat (inspiré de Chat-main) ===
const CONTACTS_FILE = path.join(__dirname, 'data', 'contacts.json');
const FRIEND_REQUESTS_FILE = path.join(__dirname, 'data', 'friend-requests.json');
const CHATS_DIR = path.join(__dirname, 'data', 'chats');
const GLOBAL_CHAT_FILE = path.join(__dirname, 'data', 'global-chat.json');

// === Système de Blog ===
const BLOG_DIR = path.join(__dirname, 'data', 'blog');

// Helpers pour le chat
function loadContacts() {
  try {
    return JSON.parse(require('fs').readFileSync(CONTACTS_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function saveContacts(contacts) {
  require('fs').writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
}

// Helpers pour les demandes d'amis
function loadFriendRequests() {
  try {
    return JSON.parse(require('fs').readFileSync(FRIEND_REQUESTS_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function saveFriendRequests(requests) {
  require('fs').writeFileSync(FRIEND_REQUESTS_FILE, JSON.stringify(requests, null, 2));
}

function getChatFile(userId1, userId2) {
  const f1 = path.join(CHATS_DIR, `chat-${userId1}-${userId2}.json`);
  const f2 = path.join(CHATS_DIR, `chat-${userId2}-${userId1}.json`);
  if (require('fs').existsSync(f1)) return f1;
  if (require('fs').existsSync(f2)) return f2;
  return userId1 < userId2 ? f1 : f2;
}

function loadChatMessages(userId1, userId2) {
  const chatFile = getChatFile(userId1, userId2);
  if (!require('fs').existsSync(chatFile)) return [];
  const data = require('fs').readFileSync(chatFile, 'utf8');
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error('Erreur parsing chat file', chatFile, e);
    return [];
  }
}

function saveChatMessages(userId1, userId2, messages) {
  const chatFile = getChatFile(userId1, userId2);
  require('fs').writeFileSync(chatFile, JSON.stringify(messages, null, 2));
}

function loadGlobalChat() {
  try {
    if (!require('fs').existsSync(GLOBAL_CHAT_FILE)) {
      require('fs').writeFileSync(GLOBAL_CHAT_FILE, '[]');
      return [];
    }
    const data = require('fs').readFileSync(GLOBAL_CHAT_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Erreur chargement chat global:', err);
    return [];
  }
}

function saveGlobalChat(messages) {
  require('fs').writeFileSync(GLOBAL_CHAT_FILE, JSON.stringify(messages, null, 2));
}

// === Helpers pour le blog ===
async function ensureBlogDir() {
  try {
    await fs.mkdir(BLOG_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error('Erreur création dossier blog:', err);
    }
  }
}

async function getBlogArticles() {
  try {
    await ensureBlogDir();
    const files = await fs.readdir(BLOG_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    
    const articles = await Promise.all(
      mdFiles.map(async (file) => {
        const content = await fs.readFile(path.join(BLOG_DIR, file), 'utf-8');
        const slug = file.replace('.md', '');
        
        // Extraire les métadonnées (titre, date, tags, etc.)
        const lines = content.split('\n');
        const meta = {
          slug,
          title: slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          excerpt: '',
          date: new Date().toLocaleDateString('fr-FR'),
          readingTime: Math.ceil(content.split(' ').length / 200) + ' min',
          tags: [],
          category: 'general'
        };
        
        // Parser les métadonnées si présentes (format YAML front-matter)
        if (lines[0].trim() === '---') {
          let i = 1;
          while (i < lines.length && lines[i].trim() !== '---') {
            const line = lines[i].trim();
            if (line.startsWith('title:')) {
              meta.title = line.substring(6).trim().replace(/^['"]|['"]$/g, '');
            }
            if (line.startsWith('date:')) {
              meta.date = line.substring(5).trim().replace(/^['"]|['"]$/g, '');
            }
            if (line.startsWith('excerpt:')) {
              meta.excerpt = line.substring(8).trim().replace(/^['"]|['"]$/g, '');
            }
            if (line.startsWith('tags:')) {
              const tagsStr = line.substring(5).trim();
              meta.tags = tagsStr.replace(/[\[\]'"]/g, '').split(',').map(t => t.trim()).filter(t => t);
            }
            if (line.startsWith('category:')) {
              meta.category = line.substring(9).trim().replace(/^['"]|['"]$/g, '');
            }
            i++;
          }
          
          // Extraire un extrait du contenu si pas spécifié
          if (!meta.excerpt && i + 1 < lines.length) {
            // Trouver le premier paragraphe de texte (pas un titre)
            for (let j = i + 1; j < lines.length; j++) {
              const line = lines[j].trim();
              if (line.length > 0 && !line.startsWith('#')) {
                meta.excerpt = line.length > 150 ? line.substring(0, 150) + '...' : line;
                break;
              }
            }
          }
        } else {
          // Pas de front-matter, extraire le premier paragraphe
          const firstPara = lines.find(l => l.trim().length > 0 && !l.startsWith('#'));
          if (firstPara) {
            meta.excerpt = firstPara.length > 150 ? firstPara.substring(0, 150) + '...' : firstPara;
          }
        }
        
        return meta;
      })
    );
    
    // Trier par date (plus récent en premier)
    return articles.sort((a, b) => {
      const dateA = new Date(b.date.split('/').reverse().join('-'));
      const dateB = new Date(a.date.split('/').reverse().join('-'));
      return dateA - dateB;
    });
  } catch (err) {
    console.error('Erreur lecture articles blog:', err);
    return [];
  }
}

async function getBlogArticle(slug) {
  try {
    const filePath = path.join(BLOG_DIR, `${slug}.md`);
    const content = await fs.readFile(filePath, 'utf-8');
    
    const meta = {
      slug,
      title: slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      content: content,
      excerpt: '',
      date: new Date().toLocaleDateString('fr-FR'),
      readingTime: Math.ceil(content.split(' ').length / 200) + ' min',
      tags: [],
      category: 'general'
    };
    
    // Parser le front-matter YAML
    const lines = content.split('\n');
    if (lines[0].trim() === '---') {
      let i = 1;
      // Trouver la fin du front-matter
      while (i < lines.length && lines[i].trim() !== '---') {
        const line = lines[i].trim();
        if (line.startsWith('title:')) {
          meta.title = line.substring(6).trim().replace(/^['"]|['"]$/g, '');
        }
        if (line.startsWith('date:')) {
          meta.date = line.substring(5).trim().replace(/^['"]|['"]$/g, '');
        }
        if (line.startsWith('excerpt:')) {
          meta.excerpt = line.substring(8).trim().replace(/^['"]|['"]$/g, '');
        }
        if (line.startsWith('tags:')) {
          const tagsStr = line.substring(5).trim();
          meta.tags = tagsStr.replace(/[\[\]'"]/g, '').split(',').map(t => t.trim()).filter(t => t);
        }
        if (line.startsWith('category:')) {
          meta.category = line.substring(9).trim().replace(/^['"]|['"]$/g, '');
        }
        i++;
      }
      
      // Le contenu commence après le deuxième '---'
      // On saute aussi la ligne vide qui suit généralement
      const contentStart = i + 1;
      meta.content = lines.slice(contentStart).join('\n').trim();
    }
    
    return meta;
  } catch (err) {
    console.error('Erreur lecture article:', err);
    return null;
  }
}

// Créer le dossier chats s'il n'existe pas
async function ensureChatDir() {
  try {
    await fs.mkdir(CHATS_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error('Erreur création dossier chats:', err);
    }
  }
}
ensureChatDir();

// Charger les utilisateurs depuis users.json
let users = [];
const usernameToId = new Map(); // Mapping username -> userId pour Socket.IO

async function loadUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    users = JSON.parse(data);
    console.log('✅ Utilisateurs chargés depuis users.json:', users.length, 'utilisateurs');
    console.log('   Utilisateurs:', users.map(u => `${u.username} (ID: ${u.id})`).join(', '));
    
    // Vérifier que tous les utilisateurs ont les champs requis
    users.forEach(u => {
      if (!u.id || !u.username || !u.password) {
        console.warn(`⚠️ Utilisateur invalide détecté:`, u);
      }
    });
    
    // Initialiser le mapping username -> id après chargement
    users.forEach(u => {
      if (u.id && u.username) {
        usernameToId.set(u.username, u.id);
      }
    });
    console.log('✅ Mapping username->id initialisé:', usernameToId.size, 'utilisateurs');
  } catch (err) {
    console.log('⚠️ Fichier users.json non trouvé, utilisation des utilisateurs par défaut');
    users = [
      { id: 1, username: 'Alix', password: 'alixpassword' },
      { id: 2, username: 'Lallie', password: 'lalliepassword' },
      { id: 3, username: 'Emmanuel', password: 'emmanuelpassword'},
      { id: 4, username: 'Noa', password: 'noapassword' }
    ];
    
    // Initialiser le mapping pour les utilisateurs par défaut aussi
    users.forEach(u => {
      if (u.id && u.username) {
        usernameToId.set(u.username, u.id);
      }
    });
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

// Initialiser les utilisateurs au démarrage (await dans la fonction de démarrage)

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
    console.log('❌ Connexion échouée: champs manquants');
    return res.redirect('/login?error=1');
  }

  // Normaliser les entrées (trim et recherche insensible à la casse)
  const normalizedUsername = username.trim();
  const normalizedPassword = password.trim();

  // Recherche insensible à la casse pour le username
  const user = users.find(u => {
    if (!u.username || !u.password) return false;
    return u.username.toLowerCase() === normalizedUsername.toLowerCase() && 
           u.password === normalizedPassword;
  });
  
  if (user) {
    req.session.user = user.username; // Utiliser le username original du fichier
    console.log(`✅ Connexion réussie pour: ${user.username} (ID: ${user.id})`);
    res.redirect('/index.html'); // Redirection vers la page principale
  } else {
    console.log(`❌ Tentative de connexion échouée pour: ${normalizedUsername}`);
    console.log(`   Utilisateurs disponibles: ${users.map(u => u.username).join(', ')}`);
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
      sections: ['mood', 'gratitude', 'habits', 'challenges', 'reflections', 'consciousness', 'intention', 'notes'],
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

// Route pour sauvegarder les réponses aux questions annexes
app.post('/api/save-followup', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const { date, answers, savedAt } = req.body;

    console.log(`📝 Sauvegarde des réponses aux questions annexes pour: ${username}`);
    console.log('📊 Données reçues:', { date, answers });

    // Créer le fichier de réponses aux questions annexes s'il n'existe pas
    const followupFile = path.join(__dirname, 'data', 'journal-followup.json');

    let allFollowups = {};
    try {
      const data = await fs.readFile(followupFile, 'utf-8');
      allFollowups = JSON.parse(data);
    } catch (err) {
      // Fichier n'existe pas encore, on le créera
      console.log('📁 Création du fichier de questions annexes');
    }

    // Initialiser l'utilisateur s'il n'existe pas
    if (!allFollowups[username]) {
      allFollowups[username] = [];
    }

    // Ajouter les réponses
    allFollowups[username].push({
      date,
      answers,
      savedAt
    });

    await fs.writeFile(followupFile, JSON.stringify(allFollowups, null, 2));

    console.log(`✅ Réponses aux questions annexes sauvegardées pour ${username}`);
    res.json({ success: true, message: 'Réponses sauvegardées avec succès' });

  } catch (err) {
    console.error('❌ Erreur lors de la sauvegarde des réponses:', err);
    res.status(500).json({ error: 'Impossible de sauvegarder les réponses' });
  }
});

// Route pour récupérer les réponses aux questions annexes
app.get('/api/followup-answers', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    console.log(`📖 Récupération des réponses aux questions annexes pour: ${username}`);

    const followupFile = path.join(__dirname, 'data', 'journal-followup.json');

    let allFollowups = {};
    try {
      const data = await fs.readFile(followupFile, 'utf-8');
      allFollowups = JSON.parse(data);
    } catch (err) {
      console.log('📁 Fichier de questions annexes non trouvé');
    }

    const userFollowups = allFollowups[username] || [];
    console.log(`📋 ${userFollowups.length} réponses trouvées pour ${username}`);
    res.json(userFollowups);

  } catch (err) {
    console.error('❌ Erreur lors de la récupération des réponses:', err);
    res.status(500).json({ error: 'Impossible de charger les réponses' });
  }
});

// === Routes pour les Habitudes (Habit Tracking) ===

// Sauvegarder les habitudes du jour
app.post('/api/habits/save', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const { date, habits, stacks } = req.body;
    
    console.log(`📝 Sauvegarde des habitudes pour: ${username}`);
    
    const habitsFile = path.join(__dirname, 'data', 'habits.json');
    let allHabits = {};
    
    try {
      const data = await fs.readFile(habitsFile, 'utf-8');
      allHabits = JSON.parse(data);
    } catch (err) {
      console.log('📁 Création du fichier habits.json');
    }
    
    if (!allHabits[username]) {
      allHabits[username] = [];
    }
    
    // Vérifier si une entrée existe déjà pour cette date
    const existingIndex = allHabits[username].findIndex(h => h.date === date);
    
    const habitEntry = {
      date,
      habits,
      stacks: stacks || [],
      savedAt: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
      allHabits[username][existingIndex] = habitEntry;
    } else {
      allHabits[username].push(habitEntry);
    }
    
    await fs.writeFile(habitsFile, JSON.stringify(allHabits, null, 2));
    
    console.log(`✅ Habitudes sauvegardées pour ${username}`);
    res.json({ success: true, message: 'Habitudes sauvegardées avec succès' });
    
  } catch (err) {
    console.error('❌ Erreur lors de la sauvegarde des habitudes:', err);
    res.status(500).json({ error: 'Impossible de sauvegarder les habitudes' });
  }
});

// Récupérer les habitudes d'un utilisateur
app.get('/api/habits', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const habitsFile = path.join(__dirname, 'data', 'habits.json');
    
    let allHabits = {};
    try {
      const data = await fs.readFile(habitsFile, 'utf-8');
      allHabits = JSON.parse(data);
    } catch (err) {
      console.log('📁 Fichier habits.json non trouvé');
    }
    
    const userHabits = allHabits[username] || [];
    res.json(userHabits);
    
  } catch (err) {
    console.error('❌ Erreur lors de la récupération des habitudes:', err);
    res.status(500).json({ error: 'Impossible de charger les habitudes' });
  }
});

// Récupérer les définitions d'habitudes (templates)
app.get('/api/habits/templates', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const templatesFile = path.join(__dirname, 'data', 'habit-templates.json');
    
    let allTemplates = {};
    try {
      const data = await fs.readFile(templatesFile, 'utf-8');
      allTemplates = JSON.parse(data);
    } catch (err) {
      console.log('📁 Fichier habit-templates.json non trouvé, utilisation des défauts');
      // Templates par défaut
      allTemplates = {};
    }
    
    // Templates par défaut si l'utilisateur n'en a pas
    const userTemplates = allTemplates[username] || [
      { id: 'exercise', name: 'Exercice physique', category: 'physical', icon: '🏃' },
      { id: 'meditation', name: 'Méditation', category: 'mental', icon: '🧘' },
      { id: 'reading', name: 'Lecture', category: 'growth', icon: '📚' },
      { id: 'water', name: 'Boire de l\'eau', category: 'health', icon: '💧' },
      { id: 'sleep', name: 'Dormir 8h', category: 'health', icon: '😴' }
    ];
    
    res.json(userTemplates);
    
  } catch (err) {
    console.error('❌ Erreur lors de la récupération des templates:', err);
    res.status(500).json({ error: 'Impossible de charger les templates' });
  }
});

// Sauvegarder les templates d'habitudes personnalisés
app.post('/api/habits/templates', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const { templates } = req.body;
    
    const templatesFile = path.join(__dirname, 'data', 'habit-templates.json');
    let allTemplates = {};
    
    try {
      const data = await fs.readFile(templatesFile, 'utf-8');
      allTemplates = JSON.parse(data);
    } catch (err) {
      console.log('📁 Création du fichier habit-templates.json');
    }
    
    allTemplates[username] = templates;
    
    await fs.writeFile(templatesFile, JSON.stringify(allTemplates, null, 2));
    
    res.json({ success: true, message: 'Templates sauvegardés' });
    
  } catch (err) {
    console.error('❌ Erreur lors de la sauvegarde des templates:', err);
    res.status(500).json({ error: 'Impossible de sauvegarder les templates' });
  }
});

// === Routes pour le Suivi des Addictions ===

// Créer/mettre à jour un suivi d'addiction
app.post('/api/addictions/save', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const addictionData = req.body;
    
    console.log(`📝 Sauvegarde du suivi d'addiction pour: ${username}`);
    
    const addictionsFile = path.join(__dirname, 'data', 'addictions.json');
    let allAddictions = {};
    
    try {
      const data = await fs.readFile(addictionsFile, 'utf-8');
      allAddictions = JSON.parse(data);
    } catch (err) {
      console.log('📁 Création du fichier addictions.json');
    }
    
    if (!allAddictions[username]) {
      allAddictions[username] = [];
    }
    
    // Ajouter timestamp et calculer le streak
    addictionData.savedAt = new Date().toISOString();
    
    // Calculer les jours de sobriété
    if (addictionData.startDate) {
      const start = new Date(addictionData.startDate);
      const now = new Date();
      const diffTime = Math.abs(now - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      addictionData.currentStreak = diffDays;
    }
    
    // Vérifier si cette addiction existe déjà
    const existingIndex = allAddictions[username].findIndex(a => a.addictionId === addictionData.addictionId);
    
    if (existingIndex >= 0) {
      allAddictions[username][existingIndex] = addictionData;
    } else {
      allAddictions[username].push(addictionData);
    }
    
    await fs.writeFile(addictionsFile, JSON.stringify(allAddictions, null, 2));
    
    console.log(`✅ Addiction sauvegardée pour ${username}`);
    res.json({ success: true, message: 'Suivi d\'addiction sauvegardé', data: addictionData });
    
  } catch (err) {
    console.error('❌ Erreur lors de la sauvegarde de l\'addiction:', err);
    res.status(500).json({ error: 'Impossible de sauvegarder le suivi' });
  }
});

// Récupérer les suivis d'addictions
app.get('/api/addictions', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const addictionsFile = path.join(__dirname, 'data', 'addictions.json');
    
    let allAddictions = {};
    try {
      const data = await fs.readFile(addictionsFile, 'utf-8');
      allAddictions = JSON.parse(data);
    } catch (err) {
      console.log('📁 Fichier addictions.json non trouvé');
    }
    
    const userAddictions = allAddictions[username] || [];
    
    // Mettre à jour les streaks actuels
    userAddictions.forEach(addiction => {
      if (addiction.startDate) {
        const start = new Date(addiction.startDate);
        const now = new Date();
        const diffTime = Math.abs(now - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        addiction.currentStreak = diffDays;
      }
    });
    
    res.json(userAddictions);
    
  } catch (err) {
    console.error('❌ Erreur lors de la récupération des addictions:', err);
    res.status(500).json({ error: 'Impossible de charger les suivis' });
  }
});

// Enregistrer un moment de vulnérabilité/trigger
app.post('/api/addictions/:addictionId/trigger', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const { addictionId } = req.params;
    const { triggerType, notes } = req.body;
    
    const addictionsFile = path.join(__dirname, 'data', 'addictions.json');
    let allAddictions = {};
    
    try {
      const data = await fs.readFile(addictionsFile, 'utf-8');
      allAddictions = JSON.parse(data);
    } catch (err) {
      return res.status(404).json({ error: 'Suivi non trouvé' });
    }
    
    const userAddictions = allAddictions[username] || [];
    const addiction = userAddictions.find(a => a.addictionId === addictionId);
    
    if (!addiction) {
      return res.status(404).json({ error: 'Addiction non trouvée' });
    }
    
    if (!addiction.triggerMap) {
      addiction.triggerMap = {};
    }
    
    addiction.triggerMap[triggerType] = (addiction.triggerMap[triggerType] || 0) + 1;
    
    if (!addiction.triggerLog) {
      addiction.triggerLog = [];
    }
    
    addiction.triggerLog.push({
      timestamp: new Date().toISOString(),
      triggerType,
      notes
    });
    
    await fs.writeFile(addictionsFile, JSON.stringify(allAddictions, null, 2));
    
    res.json({ success: true, message: 'Trigger enregistré' });
    
  } catch (err) {
    console.error('❌ Erreur lors de l\'enregistrement du trigger:', err);
    res.status(500).json({ error: 'Impossible d\'enregistrer le trigger' });
  }
});

// === Routes pour la Gamification (Badges, Streaks) ===

// Récupérer les badges d'un utilisateur
app.get('/api/badges', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const badgesFile = path.join(__dirname, 'data', 'badges.json');
    
    let allBadges = {};
    try {
      const data = await fs.readFile(badgesFile, 'utf-8');
      allBadges = JSON.parse(data);
    } catch (err) {
      console.log('📁 Fichier badges.json non trouvé, initialisation...');
    }
    
    if (!allBadges[username]) {
      // Initialiser les badges pour le nouvel utilisateur
      allBadges[username] = {
        unlockedBadges: [],
        allBadges: [
          { id: 'first-entry', name: 'Premier Pas', description: 'Votre première entrée !', icon: '🌱', unlocked: false },
          { id: 'week-streak', name: 'Régularité', description: '7 jours consécutifs', icon: '🔥', unlocked: false },
          { id: 'month-streak', name: 'Persévérance', description: '30 jours consécutifs', icon: '💪', unlocked: false },
          { id: 'deep-reflection', name: 'Profondeur', description: 'Entrée de plus de 500 mots', icon: '🌊', unlocked: false },
          { id: 'pattern-discovered', name: 'Découverte', description: 'Premier pattern émotionnel identifié', icon: '💡', unlocked: false },
          { id: 'habit-master', name: 'Maître des Habitudes', description: '30 jours de suivi d\'habitudes', icon: '⭐', unlocked: false },
          { id: 'sobriety-week', name: 'Force Intérieure', description: '1 semaine de sobriété', icon: '🛡️', unlocked: false },
          { id: 'sobriety-month', name: 'Guerrier', description: '1 mois de sobriété', icon: '🏆', unlocked: false },
          { id: 'cbt-champion', name: 'Esprit Analytique', description: '10 analyses TCC complétées', icon: '🧠', unlocked: false },
          { id: 'gratitude-guru', name: 'Cœur Reconnaissant', description: '100 gratitudes enregistrées', icon: '💚', unlocked: false }
        ]
      };
    }
    
    res.json(allBadges[username]);
    
  } catch (err) {
    console.error('❌ Erreur lors de la récupération des badges:', err);
    res.status(500).json({ error: 'Impossible de charger les badges' });
  }
});

// Débloquer un badge
app.post('/api/badges/unlock', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    const { badgeId } = req.body;
    
    const badgesFile = path.join(__dirname, 'data', 'badges.json');
    let allBadges = {};
    
    try {
      const data = await fs.readFile(badgesFile, 'utf-8');
      allBadges = JSON.parse(data);
    } catch (err) {
      allBadges = {};
    }
    
    if (!allBadges[username]) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    const badge = allBadges[username].allBadges.find(b => b.id === badgeId);
    
    if (!badge) {
      return res.status(404).json({ error: 'Badge non trouvé' });
    }
    
    if (!badge.unlocked) {
      badge.unlocked = true;
      badge.unlockedAt = new Date().toISOString();
      allBadges[username].unlockedBadges.push(badgeId);
      
      await fs.writeFile(badgesFile, JSON.stringify(allBadges, null, 2));
      
      res.json({ success: true, message: 'Badge débloqué !', badge });
    } else {
      res.json({ success: false, message: 'Badge déjà débloqué' });
    }
    
  } catch (err) {
    console.error('❌ Erreur lors du déblocage du badge:', err);
    res.status(500).json({ error: 'Impossible de débloquer le badge' });
  }
});

// Récupérer les statistiques de streaks
app.get('/api/streaks', requireAuth, async (req, res) => {
  try {
    const username = req.session.user;
    
    // Calculer le streak d'écriture
    const journalEntries = await journalManager.getUserEntries(username);
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    
    if (journalEntries.length > 0) {
      // Trier par date décroissante
      const sortedEntries = journalEntries.sort((a, b) => {
        const dateA = new Date(a.date || a.savedAt);
        const dateB = new Date(b.date || b.savedAt);
        return dateB - dateA;
      });
      
      // Calculer le streak actuel
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let checkDate = new Date(today);
      
      for (let i = 0; i < sortedEntries.length; i++) {
        const entryDate = new Date(sortedEntries[i].date || sortedEntries[i].savedAt);
        entryDate.setHours(0, 0, 0, 0);
        
        if (entryDate.getTime() === checkDate.getTime()) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
      
      // Calculer le streak le plus long
      tempStreak = 1;
      for (let i = 0; i < sortedEntries.length - 1; i++) {
        const currentDate = new Date(sortedEntries[i].date || sortedEntries[i].savedAt);
        const nextDate = new Date(sortedEntries[i + 1].date || sortedEntries[i + 1].savedAt);
        
        currentDate.setHours(0, 0, 0, 0);
        nextDate.setHours(0, 0, 0, 0);
        
        const diffDays = Math.floor((currentDate - nextDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);
    }
    
    res.json({
      journal: {
        current: currentStreak,
        longest: longestStreak,
        totalEntries: journalEntries.length
      }
    });
    
  } catch (err) {
    console.error('❌ Erreur lors du calcul des streaks:', err);
    res.status(500).json({ error: 'Impossible de calculer les streaks' });
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

// === Routes API pour le Chat ===

// Récupérer les contacts d'un utilisateur
app.get('/api/contacts/:userId', requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const contactsData = loadContacts();
    const userContacts = contactsData.find(c => c.userId === userId);
    
    if (!userContacts) {
      return res.json([]);
    }
    
    const usersList = users.filter(u => userContacts.contacts.includes(u.id))
                          .map(u => ({ id: u.id, username: u.username }));
    res.json(usersList);
  } catch (err) {
    console.error('❌ Erreur récupération contacts:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter un contact
app.post('/api/contacts/:userId/add', requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { contactId } = req.body;
    
    if (!contactId) {
      return res.status(400).json({ error: 'contactId manquant' });
    }
    
    const contactExists = users.find(u => u.id === contactId);
    if (!contactExists) {
      return res.status(400).json({ error: 'Contact inconnu' });
    }
    
    let contactsData = loadContacts();
    let userContacts = contactsData.find(c => c.userId === userId);
    
    if (!userContacts) {
      userContacts = { userId, contacts: [] };
      contactsData.push(userContacts);
    }
    
    if (userContacts.contacts.includes(contactId)) {
      return res.status(400).json({ error: 'Contact déjà ajouté' });
    }
    
    userContacts.contacts.push(contactId);
    saveContacts(contactsData);
    
    // Créer fichier chat vide
    const chatFile = getChatFile(userId, contactId);
    if (!require('fs').existsSync(chatFile)) {
      require('fs').writeFileSync(chatFile, '[]');
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erreur ajout contact:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// === Routes API pour les demandes d'amis ===

// Envoyer une demande d'ami
app.post('/api/friend-requests/send', requireAuth, async (req, res) => {
  try {
    const { fromUserId, toUserId } = req.body;
    
    if (!fromUserId || !toUserId) {
      return res.status(400).json({ error: 'fromUserId et toUserId requis' });
    }
    
    if (fromUserId === toUserId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas vous envoyer une demande' });
    }
    
    // Vérifier que l'utilisateur existe
    const toUser = users.find(u => u.id === toUserId);
    if (!toUser) {
      return res.status(400).json({ error: 'Utilisateur introuvable' });
    }
    
    // Vérifier qu'ils ne sont pas déjà amis
    const contactsData = loadContacts();
    const userContacts = contactsData.find(c => c.userId === fromUserId);
    if (userContacts && userContacts.contacts.includes(toUserId)) {
      return res.status(400).json({ error: 'Vous êtes déjà amis' });
    }
    
    // Vérifier qu'une demande n'existe pas déjà
    let requests = loadFriendRequests();
    const existingRequest = requests.find(r => 
      (r.fromUserId === fromUserId && r.toUserId === toUserId) ||
      (r.fromUserId === toUserId && r.toUserId === fromUserId)
    );
    
    if (existingRequest) {
      return res.status(400).json({ error: 'Une demande existe déjà' });
    }
    
    // Créer la demande
    const newRequest = {
      id: Date.now(),
      fromUserId,
      toUserId,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    requests.push(newRequest);
    saveFriendRequests(requests);
    
    res.json({ success: true, request: newRequest });
  } catch (err) {
    console.error('❌ Erreur envoi demande:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les demandes d'amis reçues
app.get('/api/friend-requests/received/:userId', requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const requests = loadFriendRequests();
    
    const receivedRequests = requests
      .filter(r => r.toUserId === userId && r.status === 'pending')
      .map(r => {
        const fromUser = users.find(u => u.id === r.fromUserId);
        return {
          ...r,
          fromUsername: fromUser ? fromUser.username : 'Inconnu'
        };
      });
    
    res.json(receivedRequests);
  } catch (err) {
    console.error('❌ Erreur récupération demandes:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les demandes d'amis envoyées
app.get('/api/friend-requests/sent/:userId', requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const requests = loadFriendRequests();
    
    const sentRequests = requests
      .filter(r => r.fromUserId === userId && r.status === 'pending')
      .map(r => {
        const toUser = users.find(u => u.id === r.toUserId);
        return {
          ...r,
          toUsername: toUser ? toUser.username : 'Inconnu'
        };
      });
    
    res.json(sentRequests);
  } catch (err) {
    console.error('❌ Erreur récupération demandes:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Accepter une demande d'ami
app.post('/api/friend-requests/accept', requireAuth, async (req, res) => {
  try {
    const { requestId } = req.body;
    
    if (!requestId) {
      return res.status(400).json({ error: 'requestId requis' });
    }
    
    let requests = loadFriendRequests();
    const request = requests.find(r => r.id === requestId);
    
    if (!request) {
      return res.status(404).json({ error: 'Demande introuvable' });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Demande déjà traitée' });
    }
    
    // Marquer la demande comme acceptée
    request.status = 'accepted';
    saveFriendRequests(requests);
    
    // Ajouter les contacts mutuellement
    let contactsData = loadContacts();
    
    // Ajouter toUserId dans les contacts de fromUserId
    let fromUserContacts = contactsData.find(c => c.userId === request.fromUserId);
    if (!fromUserContacts) {
      fromUserContacts = { userId: request.fromUserId, contacts: [] };
      contactsData.push(fromUserContacts);
    }
    if (!fromUserContacts.contacts.includes(request.toUserId)) {
      fromUserContacts.contacts.push(request.toUserId);
    }
    
    // Ajouter fromUserId dans les contacts de toUserId
    let toUserContacts = contactsData.find(c => c.userId === request.toUserId);
    if (!toUserContacts) {
      toUserContacts = { userId: request.toUserId, contacts: [] };
      contactsData.push(toUserContacts);
    }
    if (!toUserContacts.contacts.includes(request.fromUserId)) {
      toUserContacts.contacts.push(request.fromUserId);
    }
    
    saveContacts(contactsData);
    
    // Créer fichier chat vide
    const chatFile = getChatFile(request.fromUserId, request.toUserId);
    if (!require('fs').existsSync(chatFile)) {
      require('fs').writeFileSync(chatFile, '[]');
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erreur acceptation demande:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Refuser une demande d'ami
app.post('/api/friend-requests/reject', requireAuth, async (req, res) => {
  try {
    const { requestId } = req.body;
    
    if (!requestId) {
      return res.status(400).json({ error: 'requestId requis' });
    }
    
    let requests = loadFriendRequests();
    const request = requests.find(r => r.id === requestId);
    
    if (!request) {
      return res.status(404).json({ error: 'Demande introuvable' });
    }
    
    // Marquer la demande comme refusée
    request.status = 'rejected';
    saveFriendRequests(requests);
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erreur refus demande:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour recharger les utilisateurs (utile après modification de users.json)
app.post('/api/reload-users', requireAuth, async (req, res) => {
  try {
    await loadUsers();
    res.json({ success: true, count: users.length, users: users.map(u => u.username) });
  } catch (err) {
    console.error('❌ Erreur rechargement utilisateurs:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer l'ID utilisateur à partir du username
app.get('/api/user-id/:username', requireAuth, (req, res) => {
  try {
    const username = decodeURIComponent(req.params.username).trim();
    
    if (!username) {
      return res.status(400).json({ error: 'Nom d\'utilisateur requis' });
    }
    
    // Recherche insensible à la casse
    const user = users.find(u => u.username && u.username.toLowerCase() === username.toLowerCase());
    
    if (user && user.id) {
      res.json({ id: user.id, username: user.username });
    } else {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
  } catch (err) {
    console.error('❌ Erreur récupération user-id:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les messages du chat global
app.get('/api/global-chat', requireAuth, (req, res) => {
  const messages = loadGlobalChat();
  res.json(messages);
});

// === Routes API pour le Blog ===

// Récupérer la liste de tous les articles
app.get('/api/blog/articles', async (req, res) => {
  try {
    const articles = await getBlogArticles();
    res.json(articles);
  } catch (err) {
    console.error('❌ Erreur récupération articles:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer un article spécifique (API JSON)
app.get('/api/blog/:slug', async (req, res) => {
  try {
    const article = await getBlogArticle(req.params.slug);
    if (!article) {
      return res.status(404).json({ error: 'Article non trouvé' });
    }
    res.json(article);
  } catch (err) {
    console.error('❌ Erreur récupération article:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Afficher un article complet (page HTML)
app.get('/blog/:slug', async (req, res) => {
  try {
    const article = await getBlogArticle(req.params.slug);
    if (!article) {
      return res.status(404).send('<h1>Article non trouvé</h1>');
    }
    
    // Convertir le markdown en HTML
    const htmlContent = marked(article.content);
    
    // Générer la page HTML
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${article.title} - MoodyJournal</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        
        .article-content {
            max-width: 750px;
            margin: 0 auto;
            font-size: 1.125rem;
            line-height: 1.85;
            color: #1f2937;
        }
        
        .article-content h1 {
            font-size: 2.75rem;
            font-weight: 800;
            color: #065f46;
            margin: 3rem 0 1.5rem;
            line-height: 1.2;
            letter-spacing: -0.02em;
        }
        
        .article-content h2 {
            font-size: 2.25rem;
            font-weight: 700;
            color: #047857;
            margin: 2.5rem 0 1.25rem;
            line-height: 1.3;
            letter-spacing: -0.015em;
            padding-top: 0.5rem;
            border-top: 1px solid #d1fae5;
        }
        
        .article-content h3 {
            font-size: 1.75rem;
            font-weight: 600;
            color: #059669;
            margin: 2rem 0 1rem;
            line-height: 1.4;
        }
        
        .article-content h4 {
            font-size: 1.375rem;
            font-weight: 600;
            color: #10b981;
            margin: 1.5rem 0 0.75rem;
        }
        
        .article-content p {
            margin: 1.5rem 0;
            line-height: 1.85;
            color: #374151;
            text-align: justify;
        }
        
        .article-content ul, .article-content ol {
            margin: 1.5rem 0;
            padding-left: 2.5rem;
            color: #374151;
        }
        
        .article-content li {
            margin: 0.75rem 0;
            line-height: 1.75;
        }
        
        .article-content li::marker {
            color: #10b981;
            font-weight: 600;
        }
        
        .article-content strong, .article-content b {
            color: #059669;
            font-weight: 700;
        }
        
        .article-content em {
            font-style: italic;
            color: #4b5563;
        }
        
        .article-content blockquote {
            border-left: 5px solid #10b981;
            padding: 1.5rem 2rem;
            margin: 2rem 0;
            background: linear-gradient(to right, #ecfdf5, #f0fdf4);
            font-size: 1.2rem;
            font-style: italic;
            color: #065f46;
            border-radius: 0 8px 8px 0;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
        }
        
        .article-content blockquote p {
            margin: 0.5rem 0;
        }
        
        .article-content code {
            background: #f3f4f6;
            padding: 0.25rem 0.5rem;
            border-radius: 0.375rem;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 0.95em;
            color: #059669;
            border: 1px solid #e5e7eb;
        }
        
        .article-content pre {
            background: #1f2937;
            color: #f9fafb;
            padding: 1.5rem;
            border-radius: 0.75rem;
            overflow-x: auto;
            margin: 2rem 0;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            line-height: 1.6;
        }
        
        .article-content pre code {
            background: transparent;
            color: inherit;
            padding: 0;
            border: none;
            font-size: 0.95rem;
        }
        
        .article-content a {
            color: #10b981;
            text-decoration: underline;
            text-decoration-thickness: 2px;
            text-underline-offset: 3px;
            transition: all 0.2s ease;
        }
        
        .article-content a:hover {
            color: #059669;
            text-decoration-thickness: 3px;
        }
        
        .article-content hr {
            border: none;
            border-top: 3px solid #d1fae5;
            margin: 3rem 0;
            border-radius: 2px;
        }
        
        .article-content img {
            max-width: 100%;
            height: auto;
            border-radius: 0.75rem;
            margin: 2rem 0;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        }
        
        /* Amélioration de la lecture */
        @media (max-width: 768px) {
            .article-content {
                font-size: 1rem;
                line-height: 1.75;
            }
            
            .article-content h1 {
                font-size: 2rem;
            }
            
            .article-content h2 {
                font-size: 1.75rem;
            }
            
            .article-content h3 {
                font-size: 1.5rem;
            }
        }
    </style>
</head>
<body class="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100">
    <!-- Header -->
    <header class="bg-white/90 backdrop-blur-md shadow-lg border-b-2 border-emerald-200">
        <div class="max-w-7xl mx-auto px-6 py-4">
            <div class="flex items-center justify-between">
                <a href="/index.html" class="flex items-center space-x-3 hover:opacity-80 transition-opacity">
                    <img src="/assets/moodyjournal.svg" alt="Logo MoodyJournal" class="h-14">
                    <span class="text-sm text-gray-600 hidden sm:block">Votre compagnon bien-être</span>
                </a>

                <nav class="hidden md:flex items-center space-x-6">
                    <a href="/index.html" class="text-gray-700 hover:text-emerald-600 font-medium transition-colors">Accueil</a>
                    <a href="/journal.html" class="text-gray-700 hover:text-emerald-600 font-medium transition-colors">Écrire</a>
                    <a href="/view.html" class="text-gray-700 hover:text-emerald-600 font-medium transition-colors">Consulter</a>
                    <a href="/blog.html" class="text-gray-700 hover:text-emerald-600 font-medium transition-colors">Blog</a>
                    <a href="/chat.html" class="text-gray-700 hover:text-emerald-600 font-medium transition-colors">Discuter</a>
                    <a href="/settings.html" class="text-gray-700 hover:text-emerald-600 font-medium transition-colors">Paramètres</a>
                    <a href="/logout" class="text-red-600 hover:text-red-700 font-medium transition-colors">Déconnexion</a>
                </nav>
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto px-6 py-12">
        <!-- Breadcrumb -->
        <div class="mb-8">
            <a href="/blog.html" class="text-emerald-600 hover:text-emerald-700 font-medium flex items-center">
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
                Retour au blog
            </a>
        </div>

        <!-- Article Header -->
        <div class="bg-white rounded-3xl shadow-xl overflow-hidden mb-8">
            <div class="bg-gradient-to-r from-emerald-600 to-emerald-700 px-8 md:px-12 py-6">
                ${article.tags && article.tags.length > 0 ? `
                <div class="flex items-center gap-2 mb-4">
                    ${article.tags.map(tag => `
                        <span class="bg-white/20 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-sm font-semibold">
                            ${tag}
                        </span>
                    `).join('')}
                </div>
                ` : ''}
                
                <h1 class="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">${article.title}</h1>
                
                ${article.excerpt ? `
                <p class="text-xl text-emerald-50 mb-6 leading-relaxed">${article.excerpt}</p>
                ` : ''}
                
                <div class="flex items-center gap-6 text-emerald-100 text-sm">
                    <span class="flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        ${article.date}
                    </span>
                    <span class="flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        ${article.readingTime}
                    </span>
                </div>
            </div>
        </div>

        <!-- Article Content -->
        <article class="bg-white rounded-3xl shadow-xl p-8 md:p-16">
            <div class="article-content">
                ${htmlContent}
            </div>
        </article>

        <!-- Navigation -->
        <div class="mt-12 text-center">
            <a href="/blog.html" class="inline-flex items-center bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold transition-colors">
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
                Voir tous les articles
            </a>
        </div>
    </main>

    <footer class="bg-gray-800 text-white py-8 mt-12">
        <div class="max-w-6xl mx-auto px-6 text-center">
            <div class="flex items-center justify-center mb-4">
                <img src="/assets/moodyjournal.svg" alt="Logo" class="h-8 mr-3">
                <span class="text-xl font-semibold">MoodyJournal</span>
            </div>
            <p class="text-gray-400 mb-4">Votre compagnon quotidien pour la réflexion et le bien-être</p>
            <div class="border-t border-gray-700 pt-4">
                <p class="text-gray-500 text-sm">© 2025 MoodyJournal. Tous droits réservés.</p>
            </div>
        </div>
    </footer>
</body>
</html>
    `;
    
    res.send(html);
  } catch (err) {
    console.error('❌ Erreur affichage article:', err);
    res.status(500).send('<h1>Erreur serveur</h1>');
  }
});

// === Socket.IO pour le chat en temps réel ===
const usersSockets = new Map(); // userId => socket.id

io.on('connection', (socket) => {
  console.log('🔌 Nouvelle connexion Socket.IO:', socket.id);
  
  // Utilisateur se connecte avec username
  socket.on('user-online', (username) => {
    const userId = usernameToId.get(username);
    if (userId) {
      usersSockets.set(userId, socket.id);
      socket.userId = userId;
      socket.username = username;
      console.log(`👤 ${username} (ID: ${userId}) est en ligne`);
      
      // Envoyer la liste des utilisateurs en ligne
      const usersOnline = Array.from(usernameToId.keys()).filter(name => {
        const id = usernameToId.get(name);
        return usersSockets.has(id);
      });
      io.emit('users-online', usersOnline);
      socket.broadcast.emit('user-connected', username);
    }
  });
  
  // Login avec userId (pour compatibilité)
  socket.on('login', ({ userId }) => {
    usersSockets.set(userId, socket.id);
    socket.userId = userId;
    const user = users.find(u => u.id === userId);
    if (user) {
      socket.username = user.username;
      usernameToId.set(user.username, userId);
    }
    console.log(`Utilisateur connecté en socket: ${userId}`);
    socket.emit('login-success', { userId });
  });
  
  // Récupérer l'historique des messages privés
  socket.on('get-messages', ({ withUserId }) => {
    if (!socket.userId) return;
    const messages = loadChatMessages(socket.userId, withUserId);
    socket.emit('message-history', messages);
  });
  
  // Envoyer un message privé
  socket.on('send-message', ({ toUserId, text }) => {
    if (!socket.userId) return;
    if (!toUserId || !text) return;
    
    const messages = loadChatMessages(socket.userId, toUserId);
    
    const message = {
      from: socket.userId,
      to: toUserId,
      text,
      timestamp: Date.now()
    };
    
    messages.push(message);
    saveChatMessages(socket.userId, toUserId, messages);
    
    console.log(`💬 Message de ${socket.username} vers user ${toUserId}: ${text}`);
    
    // Émettre à l'envoyeur
    socket.emit('new-message', message);
    
    // Émettre au destinataire si connecté
    const recipientSocketId = usersSockets.get(toUserId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('new-message', message);
    }
  });
  
  // 🌍 CHAT GLOBAL - Récupérer l'historique
  socket.on('get-global-messages', () => {
    const messages = loadGlobalChat();
    socket.emit('global-message-history', messages);
  });
  
  // 🌍 CHAT GLOBAL - Envoyer un message
  socket.on('send-global-message', ({ text }) => {
    if (!socket.userId || !text) return;
    
    const messages = loadGlobalChat();
    const message = {
      id: Date.now(),
      userId: socket.userId,
      username: socket.username,
      text,
      timestamp: new Date().toISOString()
    };
    
    messages.push(message);
    saveGlobalChat(messages);
    
    console.log(`🌍 Message global de ${socket.username}: ${text}`);
    
    // Diffuser à tous les utilisateurs connectés
    io.emit('new-global-message', message);
  });
  
  // Déconnexion
  socket.on('disconnect', () => {
    if (socket.userId) {
      usersSockets.delete(socket.userId);
      console.log(`👋 ${socket.username || socket.userId} s'est déconnecté`);
      
      // Mettre à jour la liste des utilisateurs en ligne
      const usersOnline = Array.from(usernameToId.keys()).filter(name => {
        const id = usernameToId.get(name);
        return usersSockets.has(id);
      });
      io.emit('users-online', usersOnline);
      
      if (socket.username) {
        socket.broadcast.emit('user-disconnected', socket.username);
      }
    }
  });
});

// === Démarrage du serveur ===
async function startServer() {
  await loadUsers(); // Charger les utilisateurs AVANT de démarrer le serveur
  await ensureDir();
  
  server.listen(PORT, () => {
    console.log(`🚀 Serveur en cours sur http://localhost:${PORT}`);
    console.log(`📂 Assure-toi que les pages HTML soit dans /public`);
    console.log(`💬 Socket.IO activé pour le chat en temps réel`);
    console.log(`👥 ${users.length} utilisateurs chargés`);
  });
}

startServer().catch(err => {
  console.error('❌ Erreur au démarrage:', err);
  process.exit(1);
});