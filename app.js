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

// Helper pour parser les dates des articles blog
function parseBlogDate(dateString) {
  if (!dateString) return new Date(0);
  try {
    // Format: DDMMYYYY (8 chiffres)
    if (dateString.length === 8 && /^\d+$/.test(dateString)) {
      const day = dateString.substring(0, 2);
      const month = dateString.substring(2, 4);
      const year = dateString.substring(4, 8);
      const date = new Date(year, month - 1, day);
      // Vérifier que la date est valide et que l'année est raisonnable
      if (date.getFullYear() == year && date.getMonth() == month - 1 && date.getDate() == day && parseInt(year) > 1900) {
        return date;
      }
    }
    // Format: YYYYMMDD (8 chiffres)
    if (dateString.length === 8 && /^\d+$/.test(dateString)) {
      const year = dateString.substring(0, 4);
      const month = dateString.substring(4, 6);
      const day = dateString.substring(6, 8);
      const date = new Date(year, month - 1, day);
      // Vérifier que la date est valide
      if (date.getFullYear() == year && date.getMonth() == month - 1 && date.getDate() == day) {
        return date;
      }
    }
    // Format DD/MM/YYYY ou autre
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        const date = new Date(parts[2], parts[1] - 1, parts[0]);
        if (!isNaN(date.getTime())) return date;
      }
    }
    // Format ISO ou autre format standard
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
    return new Date(0);
  } catch (e) {
    return new Date(0);
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
      const dateA = parseBlogDate(a.date);
      const dateB = parseBlogDate(b.date);
      return dateB - dateA;
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

async function saveUsers() {
  try {
    await ensureDir();
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    console.log('✅ Utilisateurs sauvegardés dans users.json');
  } catch (err) {
    console.error('❌ Erreur lors de la sauvegarde des utilisateurs:', err);
    throw err;
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

// Route d'inscription
app.post('/register', async (req, res) => {
  // S'assurer que la réponse est en JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    console.log('📝 Tentative d\'inscription reçue');
    console.log('📝 Content-Type:', req.headers['content-type']);
    console.log('📝 Body reçu:', req.body);
    console.log('📝 Type de body:', typeof req.body);
    
    // Vérifier que le body est bien parsé
    if (!req.body || Object.keys(req.body).length === 0) {
      console.log('❌ Body vide ou non parsé');
      return res.status(400).json({ 
        success: false, 
        error: 'Données invalides. Veuillez réessayer.' 
      });
    }
    
    const { username, password, trackingCategories } = req.body;
    console.log('📝 Données extraites:', { username: username ? 'présent' : 'absent', password: password ? 'présent' : 'absent', trackingCategories });

    // Validation des champs
    if (!username || !password) {
      console.log('❌ Validation échouée: champs manquants');
      return res.status(400).json({ 
        success: false, 
        error: 'Le nom d\'utilisateur et le mot de passe sont requis.' 
      });
    }

    // Normaliser les entrées
    const normalizedUsername = username.trim();
    const normalizedPassword = password.trim();

    // Validation renforcée
    if (normalizedUsername.length < 3) {
      return res.status(400).json({ 
        success: false, 
        error: 'Le nom d\'utilisateur doit contenir au moins 3 caractères.' 
      });
    }

    if (normalizedPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'Le mot de passe doit contenir au moins 6 caractères.' 
      });
    }

    // Vérifier l'unicité du pseudo (insensible à la casse)
    console.log(`🔍 Vérification unicité pour: ${normalizedUsername}`);
    console.log(`🔍 Nombre d'utilisateurs actuels: ${users.length}`);
    const existingUser = users.find(u => 
      u.username && u.username.toLowerCase() === normalizedUsername.toLowerCase()
    );

    if (existingUser) {
      console.log(`❌ Nom d'utilisateur déjà pris: ${normalizedUsername}`);
      return res.status(400).json({ 
        success: false, 
        error: 'Ce nom d\'utilisateur est déjà pris.' 
      });
    }

    // Générer un nouvel ID (max des IDs existants + 1)
    const maxId = users.length > 0 ? Math.max(...users.map(u => u.id || 0)) : 0;
    const newId = maxId + 1;

    // Créer le nouvel utilisateur
    const newUser = {
      id: newId,
      username: normalizedUsername,
      password: normalizedPassword
    };

    // Ajouter l'utilisateur à la liste
    users.push(newUser);
    
    // Mettre à jour le mapping username -> id
    usernameToId.set(normalizedUsername, newId);

    // Sauvegarder les utilisateurs
    try {
      await saveUsers();
      console.log(`✅ Utilisateurs sauvegardés avec succès`);
    } catch (saveErr) {
      console.error('❌ Erreur lors de la sauvegarde des utilisateurs:', saveErr);
      // Retirer l'utilisateur de la liste en cas d'erreur
      users.pop();
      usernameToId.delete(normalizedUsername);
      throw saveErr;
    }

    console.log(`✅ Nouvel utilisateur créé: ${normalizedUsername} (ID: ${newId})`);

    // Sauvegarder les paramètres (catégories de suivi) si fournies
    if (trackingCategories && Array.isArray(trackingCategories) && trackingCategories.length > 0) {
      const settingsFile = path.join(__dirname, 'data', 'user-settings.json');
      let allSettings = {};

      try {
        const data = await fs.readFile(settingsFile, 'utf-8');
        allSettings = JSON.parse(data);
      } catch (err) {
        console.log('📁 Création du fichier de paramètres');
      }

      // Sauvegarder les catégories de suivi
      allSettings[normalizedUsername] = {
        trackingCategories: trackingCategories,
        lastUpdated: new Date().toISOString()
      };

      await fs.writeFile(settingsFile, JSON.stringify(allSettings, null, 2));
      console.log(`✅ Paramètres sauvegardés pour ${normalizedUsername}`);
    }

    // Créer une session pour l'utilisateur
    req.session.user = normalizedUsername;

    // Retourner une réponse de succès
    res.json({ 
      success: true, 
      message: 'Inscription réussie !',
      user: {
        id: newId,
        username: normalizedUsername
      }
    });

  } catch (err) {
    console.error('❌ Erreur lors de l\'inscription:', err);
    console.error('❌ Stack trace:', err.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Une erreur est survenue lors de l\'inscription. Veuillez réessayer.' 
    });
  }
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
    
    // Formater la date
    let formattedDate = article.date || 'Récemment';
    try {
      if (article.date && article.date.length === 8 && /^\d+$/.test(article.date)) {
        // Essayer d'abord le format DDMMYYYY
        const day = article.date.substring(0, 2);
        const month = article.date.substring(2, 4);
        const year = article.date.substring(4, 8);
        let date = new Date(year, month - 1, day);
        
        // Vérifier si c'est une date valide (format DDMMYYYY)
        if (date.getFullYear() == year && date.getMonth() == month - 1 && date.getDate() == day && parseInt(year) > 1900) {
          formattedDate = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        } else {
          // Essayer le format YYYYMMDD
          const year2 = article.date.substring(0, 4);
          const month2 = article.date.substring(4, 6);
          const day2 = article.date.substring(6, 8);
          date = new Date(year2, month2 - 1, day2);
          if (date.getFullYear() == year2 && date.getMonth() == month2 - 1 && date.getDate() == day2) {
            formattedDate = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
          }
        }
      } else {
        // Format ISO ou autre
        const date = new Date(article.date);
        if (!isNaN(date.getTime())) {
          formattedDate = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        }
      }
    } catch (e) {
      // Garder la date originale si erreur
    }
    
    // Générer la page HTML avec rendu amélioré
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${article.title} - MoodyJournal</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="/js/navbar.js"></script>
    <style>
        /* Variables CSS */
        :root {
            --primary-color: #10b981;
            --primary-dark: #059669;
            --primary-light: #d1fae5;
            --text-primary: #1f2937;
            --text-secondary: #6b7280;
            --bg-light: #f9fafb;
        }

        /* Typographie améliorée */
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.7;
            color: var(--text-primary);
        }

        /* Header immersif */
        .article-hero {
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
            color: white;
            padding: 4rem 2rem;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .article-hero::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.2);
            z-index: 1;
        }

        .article-hero-content {
            position: relative;
            z-index: 2;
            max-width: 900px;
            margin: 0 auto;
        }

        .article-title {
            font-size: clamp(2.5rem, 6vw, 4.5rem);
            font-weight: 800;
            line-height: 1.1;
            margin-bottom: 1.5rem;
            letter-spacing: -0.02em;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
        }

        .article-meta {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 2rem;
            flex-wrap: wrap;
            font-size: 1rem;
            opacity: 0.95;
            margin-top: 2rem;
        }

        .article-meta-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        /* Contenu de l'article */
        .article-wrapper {
            max-width: 960px;
            margin: -60px auto 0;
            padding: 0 1.5rem;
            position: relative;
            z-index: 10;
        }

        .article-content {
            background: white;
            border-radius: 1.5rem;
            padding: 3rem;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
            margin-bottom: 3rem;
        }

        /* Styles markdown améliorés */
        .article-content h1 {
            font-size: 2.75rem;
            font-weight: 800;
            color: var(--text-primary);
            margin: 3rem 0 1.5rem;
            line-height: 1.2;
            letter-spacing: -0.02em;
            border-bottom: 3px solid var(--primary-light);
            padding-bottom: 1rem;
        }

        .article-content h2 {
            font-size: 2.25rem;
            font-weight: 700;
            color: var(--primary-dark);
            margin: 2.5rem 0 1.25rem;
            line-height: 1.3;
            letter-spacing: -0.015em;
            padding-top: 1rem;
            border-top: 2px solid var(--primary-light);
        }

        .article-content h3 {
            font-size: 1.75rem;
            font-weight: 600;
            color: var(--primary-color);
            margin: 2rem 0 1rem;
            line-height: 1.4;
        }

        .article-content h4 {
            font-size: 1.375rem;
            font-weight: 600;
            color: var(--primary-color);
            margin: 1.5rem 0 0.75rem;
        }

        .article-content p {
            margin: 1.5rem 0;
            line-height: 1.85;
            color: var(--text-primary);
            font-size: 1.125rem;
            text-align: justify;
        }

        .article-content ul,
        .article-content ol {
            margin: 1.5rem 0;
            padding-left: 2.5rem;
            color: var(--text-primary);
        }

        .article-content li {
            margin: 0.75rem 0;
            line-height: 1.75;
            font-size: 1.125rem;
        }

        .article-content li::marker {
            color: var(--primary-color);
            font-weight: 600;
        }

        .article-content strong,
        .article-content b {
            color: var(--primary-dark);
            font-weight: 700;
        }

        .article-content em {
            font-style: italic;
            color: var(--text-secondary);
        }

        .article-content blockquote {
            border-left: 5px solid var(--primary-color);
            padding: 1.5rem 2rem;
            margin: 2rem 0;
            background: linear-gradient(to right, var(--primary-light), #f0fdf4);
            font-size: 1.25rem;
            font-style: italic;
            color: var(--primary-dark);
            border-radius: 0 8px 8px 0;
            box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
            position: relative;
            transition: all 0.3s ease;
        }

        .article-content blockquote:hover {
            transform: translateX(5px);
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
        }

        .article-content blockquote::before {
            content: '"';
            position: absolute;
            top: -10px;
            left: 10px;
            font-size: 4rem;
            color: var(--primary-color);
            opacity: 0.2;
            font-family: Georgia, serif;
        }

        .article-content blockquote p {
            margin: 0.5rem 0;
            position: relative;
            z-index: 1;
        }

        .article-content code {
            background: #f3f4f6;
            padding: 0.25rem 0.5rem;
            border-radius: 0.375rem;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 0.95em;
            color: var(--primary-dark);
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
            color: var(--primary-color);
            text-decoration: underline;
            text-decoration-thickness: 2px;
            text-underline-offset: 3px;
            transition: all 0.2s ease;
            font-weight: 500;
        }

        .article-content a:hover {
            color: var(--primary-dark);
            text-decoration-thickness: 3px;
        }

        .article-content hr {
            border: none;
            border-top: 3px solid var(--primary-light);
            margin: 3rem 0;
            border-radius: 2px;
        }

        .article-content img {
            max-width: 100%;
            height: auto;
            border-radius: 0.75rem;
            margin: 2rem 0;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
        }

        .article-content img:hover {
            transform: scale(1.02);
        }

        /* Tags */
        .article-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
            margin: 2rem 0;
        }

        .article-tag {
            background: var(--primary-light);
            color: var(--primary-dark);
            padding: 0.5rem 1rem;
            border-radius: 9999px;
            font-size: 0.875rem;
            font-weight: 600;
            transition: all 0.2s ease;
        }

        .article-tag:hover {
            background: var(--primary-color);
            color: white;
            transform: translateY(-2px);
        }

        /* Navigation */
        .article-navigation {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 3rem 0;
            padding: 2rem;
            background: var(--bg-light);
            border-radius: 1rem;
        }

        .nav-link {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem 1.5rem;
            background: white;
            border-radius: 0.75rem;
            text-decoration: none;
            color: var(--text-primary);
            font-weight: 600;
            transition: all 0.3s ease;
            border: 2px solid transparent;
        }

        .nav-link:hover {
            border-color: var(--primary-color);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
        }

        /* Actions */
        .article-actions {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin: 2rem 0;
            flex-wrap: wrap;
        }

        .action-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            font-weight: 600;
            transition: all 0.3s ease;
            cursor: pointer;
            border: none;
            text-decoration: none;
        }

        .action-btn.primary {
            background: var(--primary-color);
            color: white;
        }

        .action-btn.primary:hover {
            background: var(--primary-dark);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .action-btn.secondary {
            background: white;
            color: var(--primary-dark);
            border: 2px solid var(--primary-color);
        }

        .action-btn.secondary:hover {
            background: var(--primary-light);
        }

        /* Responsive */
        @media (max-width: 768px) {
            .article-hero {
                padding: 3rem 1.5rem;
            }

            .article-wrapper {
                margin-top: -40px;
                padding: 0 1rem;
            }

            .article-content {
                padding: 2rem 1.5rem;
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

            .article-content p {
                font-size: 1rem;
                text-align: left;
            }

            .article-navigation {
                flex-direction: column;
                gap: 1rem;
            }

            .nav-link {
                width: 100%;
                justify-content: center;
            }
        }

        /* Intro accrocheuse */
        .article-intro {
            font-size: 1.5rem;
            line-height: 1.6;
            color: var(--text-secondary);
            font-weight: 400;
            margin: 2rem 0;
            padding: 1.5rem;
            background: var(--primary-light);
            border-left: 4px solid var(--primary-color);
            border-radius: 0.5rem;
            font-style: italic;
        }
    </style>
</head>
<body class="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100">
    <!-- Navbar -->
    <div id="navbar-container"></div>

    <!-- Header immersif -->
    <header class="article-hero">
        <div class="article-hero-content">
            ${article.tags && article.tags.length > 0 ? `
            <div class="flex items-center justify-center gap-2 mb-4 flex-wrap">
                ${article.tags.map(tag => `
                    <span class="bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-semibold">
                        ${tag}
                    </span>
                `).join('')}
            </div>
            ` : ''}
            
            <h1 class="article-title">${article.title}</h1>
            
            ${article.excerpt ? `
            <p class="article-intro" style="background: rgba(255,255,255,0.1); border: none; color: rgba(255,255,255,0.95);">${article.excerpt}</p>
            ` : ''}
            
            <div class="article-meta">
                <div class="article-meta-item">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                    </svg>
                    <span>MoodyJournal</span>
                </div>
                <div class="article-meta-item">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    <span>${formattedDate}</span>
                </div>
                <div class="article-meta-item">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span>${article.readingTime || '5 min'}</span>
                </div>
            </div>
        </div>
    </header>

    <!-- Contenu de l'article -->
    <main>
        <div class="article-wrapper">
            <article class="article-content">
                ${htmlContent}
            </article>

            <!-- Tags -->
            ${article.tags && article.tags.length > 0 ? `
            <div class="article-tags">
                ${article.tags.map(tag => `
                    <a href="/blog.html?tag=${tag}" class="article-tag">#${tag}</a>
                `).join('')}
            </div>
            ` : ''}

            <!-- Actions -->
            <div class="article-actions">
                <a href="/blog.html" class="action-btn primary">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                    </svg>
                    Retour au blog
                </a>
                <button class="action-btn secondary" onclick="shareArticle()">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path>
                    </svg>
                    Partager
                </button>
            </div>
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

    <script>
        // Initialiser la navbar
        if (typeof initNavbar !== 'undefined') {
            initNavbar('blog.html');
        }

        // Fonction de partage
        function shareArticle() {
            const url = window.location.href;
            const title = '${article.title}';
            
            if (navigator.share) {
                navigator.share({
                    title: title,
                    text: '${article.excerpt || ''}',
                    url: url
                });
            } else {
                navigator.clipboard.writeText(url);
                alert('Lien copié dans le presse-papier !');
            }
        }

        // Animation d'entrée pour les éléments
        document.addEventListener('DOMContentLoaded', () => {
            const content = document.querySelector('.article-content');
            if (content) {
                content.style.opacity = '0';
                content.style.transform = 'translateY(20px)';
                setTimeout(() => {
                    content.style.transition = 'all 0.6s ease-out';
                    content.style.opacity = '1';
                    content.style.transform = 'translateY(0)';
                }, 100);
            }
        });
    </script>
    <script src="/js/session-check.js"></script>
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

// === Documentation des routes ===
function displayRoutes() {
  console.log('\n📋 ========== ROUTES DISPONIBLES ==========\n');
  
  console.log('🔐 AUTHENTIFICATION:');
  console.log('  GET  /                    → Redirige vers /index.html');
  console.log('  GET  /login                → Redirige vers /index.html?login');
  console.log('  POST /login                → Connexion utilisateur (username, password)');
  console.log('  POST /register             → Inscription utilisateur (username, password, trackingCategories)');
  console.log('  GET  /logout               → Déconnexion et destruction de session');
  console.log('  GET  /api/session          → Vérifie l\'état de la session (authenticated, user)');
  
  console.log('\n📄 PAGES PRINCIPALES:');
  console.log('  GET  /journal              → Redirige vers /journal.html (nécessite auth)');
  console.log('  GET  /view                 → Redirige vers /view.html (nécessite auth)');
  console.log('  GET  /settings             → Redirige vers /settings.html (nécessite auth)');
  
  console.log('\n👤 UTILISATEURS:');
  console.log('  GET  /api/users            → Liste tous les utilisateurs');
  console.log('  GET  /api/user-id/:username → Récupère l\'ID d\'un utilisateur par son username');
  console.log('  POST /api/create-user      → Crée un nouvel utilisateur (admin)');
  console.log('  POST /api/reload-users     → Recharge les utilisateurs depuis users.json');
  
  console.log('\n⚙️ PARAMÈTRES UTILISATEUR:');
  console.log('  GET  /api/user-preferences → Récupère les préférences par défaut');
  console.log('  GET  /api/user-settings    → Récupère les paramètres de l\'utilisateur connecté');
  console.log('  POST /api/save-settings    → Sauvegarde les paramètres utilisateur');
  
  console.log('\n📝 JOURNAL:');
  console.log('  GET  /api/journal-entries  → Récupère toutes les entrées du journal de l\'utilisateur');
  console.log('  POST /api/save-journal     → Sauvegarde une nouvelle entrée de journal');
  console.log('  POST /api/save-followup    → Sauvegarde les réponses au suivi');
  console.log('  GET  /api/followup-answers → Récupère les réponses au suivi');
  
  console.log('\n💪 HABITUDES:');
  console.log('  GET  /api/habits           → Récupère les habitudes de l\'utilisateur');
  console.log('  POST /api/habits/save      → Sauvegarde une habitude');
  console.log('  GET  /api/habits/templates → Récupère les modèles d\'habitudes');
  console.log('  POST /api/habits/templates → Crée un nouveau modèle d\'habitude');
  
  console.log('\n⚠️ ADDICTIONS:');
  console.log('  GET  /api/addictions                    → Récupère les addictions de l\'utilisateur');
  console.log('  POST /api/addictions/save               → Sauvegarde une addiction');
  console.log('  POST /api/addictions/:addictionId/trigger → Enregistre un déclenchement d\'addiction');
  
  console.log('\n🏆 BADGES & STREAKS:');
  console.log('  GET  /api/badges           → Récupère les badges de l\'utilisateur');
  console.log('  POST /api/badges/unlock    → Débloque un badge');
  console.log('  GET  /api/streaks          → Récupère les séries (streaks) de l\'utilisateur');
  
  console.log('\n👥 AMIS & CONTACTS:');
  console.log('  GET  /api/friends                        → Liste les amis de l\'utilisateur');
  console.log('  POST /api/add-friend                    → Ajoute un ami');
  console.log('  GET  /api/contacts/:userId               → Récupère les contacts d\'un utilisateur');
  console.log('  POST /api/contacts/:userId/add           → Ajoute un contact');
  console.log('  POST /api/friend-requests/send           → Envoie une demande d\'ami');
  console.log('  GET  /api/friend-requests/received/:userId → Récupère les demandes reçues');
  console.log('  GET  /api/friend-requests/sent/:userId  → Récupère les demandes envoyées');
  console.log('  POST /api/friend-requests/accept        → Accepte une demande d\'ami');
  console.log('  POST /api/friend-requests/reject        → Rejette une demande d\'ami');
  
  console.log('\n💬 CHAT:');
  console.log('  GET  /api/global-chat      → Récupère les messages du chat global');
  console.log('  (Socket.IO)                → Chat en temps réel via WebSocket');
  
  console.log('\n📚 BLOG:');
  console.log('  GET  /api/blog/articles    → Liste tous les articles du blog');
  console.log('  GET  /api/blog/:slug       → Récupère un article par son slug (JSON)');
  console.log('  GET  /blog/:slug           → Affiche un article du blog (HTML)');
  
  console.log('\n🧪 TEST:');
  console.log('  GET  /api/test             → Route de test pour vérifier que les API fonctionnent');
  
  console.log('\n📋 ===========================================\n');
}

// === Démarrage du serveur ===
async function startServer() {
  await loadUsers(); // Charger les utilisateurs AVANT de démarrer le serveur
  await ensureDir();
  
  server.listen(PORT, () => {
    console.log(`🚀 Serveur en cours sur http://localhost:${PORT}`);
    console.log(`📂 Assure-toi que les pages HTML soit dans /public`);
    console.log(`💬 Socket.IO activé pour le chat en temps réel`);
    console.log(`👥 ${users.length} utilisateurs chargés`);
    
    // Afficher toutes les routes disponibles
    displayRoutes();
  });
}

startServer().catch(err => {
  console.error('❌ Erreur au démarrage:', err);
  process.exit(1);
});