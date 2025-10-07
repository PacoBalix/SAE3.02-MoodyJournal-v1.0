// Script simple pour vérifier l'état de la session
class SessionManager {
    constructor() {
        this.checkSession();
    }

    async checkSession() {
        try {
            const response = await fetch('/api/session');
            const data = await response.json();
            
            if (data.authenticated) {
                this.showAuthenticatedState(data.user);
            } else {
                this.showLoggedOutState();
            }
        } catch (error) {
            console.error('❌ Erreur lors de la vérification de la session:', error);
            this.showLoggedOutState();
        }
    }

    showAuthenticatedState(username) {
        console.log(`✅ Utilisateur connecté: ${username}`);
        
        // Masquer le bouton de connexion
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.style.display = 'none';
        }

        // Afficher les informations utilisateur
        const userInfo = document.getElementById('user-info');
        if (userInfo) {
            userInfo.style.display = 'flex';
        }

        // Modifier le titre de bienvenue
        const welcomeTitle = document.getElementById('welcome-title');
        if (welcomeTitle) {
            welcomeTitle.textContent = `Bienvenue sur MoodyJournal🌿, ${username}!`;
        }
    }

    showLoggedOutState() {
        console.log('❌ Utilisateur non connecté');
        
        // Afficher le bouton de connexion
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.style.display = 'block';
        }

        // Masquer les informations utilisateur
        const userInfo = document.getElementById('user-info');
        if (userInfo) {
            userInfo.style.display = 'none';
        }

        // Titre de bienvenue standard
        const welcomeTitle = document.getElementById('welcome-title');
        if (welcomeTitle) {
            welcomeTitle.textContent = 'Bienvenue sur MoodyJournal🌿';
        }
    }
}

// Initialiser le gestionnaire de session
document.addEventListener('DOMContentLoaded', () => {
    new SessionManager();
});
