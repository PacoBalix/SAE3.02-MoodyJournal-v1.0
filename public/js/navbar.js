// Gestion de la navbar avec vérification de session
let currentUser = null;
let isAuthenticated = false;

// Vérifier la session au chargement
async function checkSessionForNavbar() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    isAuthenticated = data.authenticated;
    currentUser = data.user;
    
    console.log('📡 Session navbar:', { authenticated: isAuthenticated, user: currentUser });
    updateNavbar();
    return data;
  } catch (err) {
    console.error('❌ Erreur vérification session navbar:', err);
    isAuthenticated = false;
    currentUser = null;
    updateNavbar();
    return { authenticated: false, user: null };
  }
}

// Mettre à jour la navbar selon l'état de connexion
function updateNavbar() {
  const authButton = document.getElementById('auth-button');
  const userDisplay = document.getElementById('user-display');
  const settingsButton = document.getElementById('settings-button');
  const settingsButtonMobile = document.getElementById('settings-button-mobile');
  
  if (authButton) {
    if (isAuthenticated && currentUser) {
      // Bouton Déconnexion (rouge/orangé)
      authButton.href = '/logout';
      authButton.textContent = 'Déconnexion';
      authButton.className = 'bg-gradient-to-r from-red-400/70 to-orange-400/70 hover:from-red-500/80 hover:to-orange-500/80 text-white font-semibold px-6 py-2 rounded-full transition-all duration-300 shadow-md hover:shadow-lg backdrop-blur-sm';
      authButton.onclick = null;
    } else {
      // Bouton Se connecter (vert clair)
      authButton.href = '#';
      authButton.textContent = 'Se connecter';
      authButton.className = 'bg-gradient-to-r from-emerald-400/70 to-green-400/70 hover:from-emerald-500/80 hover:to-green-500/80 text-white font-semibold px-6 py-2 rounded-full transition-all duration-300 shadow-md hover:shadow-lg backdrop-blur-sm';
      authButton.onclick = (e) => {
        e.preventDefault();
        const loginModal = document.getElementById('login-modal');
        if (loginModal) {
          loginModal.style.display = 'flex';
        }
      };
    }
  }
  
  // Afficher le nom d'utilisateur si connecté
  if (userDisplay) {
    if (isAuthenticated && currentUser) {
      userDisplay.textContent = currentUser;
      userDisplay.classList.remove('hidden');
    } else {
      userDisplay.classList.add('hidden');
    }
  }
  
  // Afficher le bouton Paramètres si connecté
  if (settingsButton) {
    if (isAuthenticated && currentUser) {
      settingsButton.classList.remove('hidden');
    } else {
      settingsButton.classList.add('hidden');
    }
  }
  
  if (settingsButtonMobile) {
    if (isAuthenticated && currentUser) {
      settingsButtonMobile.classList.remove('hidden');
    } else {
      settingsButtonMobile.classList.add('hidden');
    }
  }
}

// Générer le HTML de la navbar
function generateNavbarHTML(currentPage, options = {}) {
  const pages = {
    'index.html': 'Accueil',
    'journal.html': 'Écrire',
    'view.html': 'Consulter',
    'blog.html': 'Blog',
    'chat.html': 'Discuter'
  };
  
  // Ajouter Paramètres uniquement s'il sera visible (connecté)
  const includeSettings = currentPage === 'settings.html';
  
  let navLinks = '';
  for (const [page, label] of Object.entries(pages)) {
    const isActive = currentPage === page;
    const activeClass = isActive 
      ? 'bg-emerald-500/70 text-white' 
      : 'bg-white/66 text-gray-700 hover:bg-emerald-300/50 hover:text-emerald-800';
    
    navLinks += `
      <a href="${page}" class="${activeClass} font-medium px-5 py-2 rounded-full transition-all duration-300 backdrop-blur-sm shadow-sm hover:shadow-md">
        ${label}
      </a>
    `;
  }
  
  // Boutons personnalisés (ex: Exporter pour view.html)
  const customButtons = options.customButtons || '';
  
  // Style du bouton Paramètres selon si on est sur la page ou non
  const settingsActive = currentPage === 'settings.html';
  const settingsClass = settingsActive
    ? 'hidden bg-emerald-500/70 text-white font-medium px-5 py-2 rounded-full transition-all duration-300 backdrop-blur-sm shadow-sm hover:shadow-md'
    : 'hidden bg-gray-500/70 hover:bg-gray-600/80 text-white font-medium px-5 py-2 rounded-full transition-all duration-300 backdrop-blur-sm shadow-sm hover:shadow-md';
  
  return `
    <header class="bg-white/90 backdrop-blur-md shadow-lg border-b-2 border-emerald-200 sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <div class="flex items-center justify-between">
          <!-- Logo -->
          <a href="index.html" class="flex items-center space-x-3 hover:opacity-80 transition-opacity">
            <img src="../assets/moodyjournal.svg" alt="Logo MoodyJournal" class="h-12 sm:h-14">
            <span class="text-sm text-gray-600 hidden sm:block">Votre compagnon bien-être</span>
          </a>

          <!-- Desktop Navigation -->
          <nav class="hidden md:flex items-center space-x-3">
            ${navLinks}
            
            ${customButtons}
            
            <!-- Bouton Paramètres (si connecté) -->
            <a id="settings-button" href="settings.html" class="${settingsClass}">
              Paramètres
            </a>
            
            <!-- User Display (si connecté) -->
            <span id="user-display" class="hidden bg-blue-500/70 text-white font-medium px-4 py-2 rounded-full backdrop-blur-sm shadow-sm"></span>
            
            <!-- Auth Button -->
            <a id="auth-button" href="#" class="bg-gradient-to-r from-emerald-400/70 to-green-400/70 hover:from-emerald-500/80 hover:to-green-500/80 text-white font-semibold px-6 py-2 rounded-full transition-all duration-300 shadow-md hover:shadow-lg backdrop-blur-sm">
              Se connecter
            </a>
          </nav>

          <!-- Mobile menu button -->
          <button id="mobile-menu-btn" class="md:hidden p-2 rounded-full hover:bg-emerald-100 transition-colors">
            <svg class="w-6 h-6 text-emerald-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
        </div>

        <!-- Mobile Navigation -->
        <div id="mobile-menu" class="hidden md:hidden mt-4 pb-4 space-y-2">
          ${Object.entries(pages).map(([page, label]) => {
            const isActive = currentPage === page;
            const activeClass = isActive 
              ? 'bg-emerald-500/70 text-white' 
              : 'bg-white/66 text-gray-700 hover:bg-emerald-300/50';
            return `
              <a href="${page}" class="${activeClass} block font-medium px-4 py-3 rounded-lg transition-all duration-300 backdrop-blur-sm shadow-sm text-center">
                ${label}
              </a>
            `;
          }).join('')}
          
          ${options.customButtonsMobile || ''}
          
          <!-- Bouton Paramètres Mobile (si connecté) -->
          <a id="settings-button-mobile" href="settings.html" class="${settingsActive ? 'hidden block bg-emerald-500/70 text-white' : 'hidden block bg-gray-500/70 hover:bg-gray-600/80 text-white'} font-medium px-4 py-3 rounded-lg transition-all duration-300 backdrop-blur-sm shadow-sm text-center">
            Paramètres
          </a>
          
          <!-- User Display Mobile -->
          <div id="user-display-mobile" class="hidden bg-blue-500/70 text-white font-medium px-4 py-3 rounded-lg backdrop-blur-sm shadow-sm text-center"></div>
          
          <!-- Auth Button Mobile -->
          <a id="auth-button-mobile" href="#" class="block bg-gradient-to-r from-emerald-400/70 to-green-400/70 text-white font-semibold px-4 py-3 rounded-lg transition-all duration-300 shadow-md text-center">
            Se connecter
          </a>
        </div>
      </div>
    </header>
  `;
}

// Initialiser la navbar au chargement
function initNavbar(currentPage, options = {}) {
  // Générer et insérer la navbar
  const navbarContainer = document.getElementById('navbar-container');
  if (navbarContainer) {
    navbarContainer.innerHTML = generateNavbarHTML(currentPage, options);
  }
  
  // Exécuter les callbacks d'initialisation si fournis
  if (options.onInit) {
    options.onInit();
  }
  
  // Toggle mobile menu
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }
  
  // Vérifier la session et mettre à jour
  checkSessionForNavbar().then(sessionData => {
    // Synchroniser avec le mobile
    const authButtonMobile = document.getElementById('auth-button-mobile');
    const userDisplayMobile = document.getElementById('user-display-mobile');
    
    if (authButtonMobile) {
      const authButton = document.getElementById('auth-button');
      if (authButton) {
        authButtonMobile.href = authButton.href;
        authButtonMobile.textContent = authButton.textContent;
        authButtonMobile.className = authButton.className.replace('rounded-full', 'rounded-lg') + ' block text-center';
        authButtonMobile.onclick = authButton.onclick;
      }
    }
    
    if (userDisplayMobile && sessionData.authenticated && sessionData.user) {
      userDisplayMobile.textContent = sessionData.user;
      userDisplayMobile.classList.remove('hidden');
    }
  });
}

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initNavbar, checkSessionForNavbar };
}

