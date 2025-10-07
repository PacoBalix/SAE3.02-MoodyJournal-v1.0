// Gestionnaire de thèmes global - Version basique
class ThemeManager {
    constructor() {
        this.settings = null;
        this.init();
    }

    async init() {
        try {
            // Charger les paramètres utilisateur
            await this.loadUserSettings();
            
            // Appliquer les paramètres
            this.applyTheme();
            this.applyBackground();
            
            console.log('✅ ThemeManager initialisé');
        } catch (err) {
            console.error('❌ Erreur lors de l\'initialisation du ThemeManager:', err);
            // Utiliser les paramètres par défaut
            this.settings = this.getDefaultSettings();
            this.applyTheme();
        }
    }

    async loadUserSettings() {
        try {
            const response = await fetch('/api/user-settings', {
                credentials: 'same-origin'
            });
            
            if (response.ok) {
                this.settings = await response.json();
                console.log('📊 Paramètres de thème chargés:', this.settings);
            } else {
                console.log('📁 Aucun paramètre trouvé, utilisation des valeurs par défaut');
                this.settings = this.getDefaultSettings();
            }
        } catch (err) {
            console.error('❌ Erreur lors du chargement des paramètres:', err);
            this.settings = this.getDefaultSettings();
        }
    }

    getDefaultSettings() {
        return {
            theme: 'emerald',
            background: 'gradient',
            sections: ['mood', 'goals', 'reflections'],
            notifications: [],
            reminderTime: '20:00'
        };
    }

    applyTheme() {
        if (!this.settings) return;

        console.log('🎨 Application du thème:', this.settings.theme);
        
        // Supprimer les classes de thème existantes
        document.body.classList.remove('theme-emerald', 'theme-blue', 'theme-purple');
        
        // Ajouter la classe du nouveau thème
        document.body.classList.add(`theme-${this.settings.theme}`);
        
        // Appliquer les couleurs selon le thème
        const root = document.documentElement;
        switch(this.settings.theme) {
            case 'blue':
                root.style.setProperty('--primary-color', '#3b82f6');
                root.style.setProperty('--primary-light', '#dbeafe');
                root.style.setProperty('--primary-dark', '#1e40af');
                break;
            case 'purple':
                root.style.setProperty('--primary-color', '#8b5cf6');
                root.style.setProperty('--primary-light', '#ede9fe');
                root.style.setProperty('--primary-dark', '#6d28d9');
                break;
            default: // emerald
                root.style.setProperty('--primary-color', '#10b981');
                root.style.setProperty('--primary-light', '#d1fae5');
                root.style.setProperty('--primary-dark', '#047857');
        }
    }

    applyBackground() {
        if (!this.settings) return;

        console.log('🖼️ Application du fond:', this.settings.background);
        
        // Supprimer les classes de fond existantes
        document.body.classList.remove('bg-gradient', 'bg-vanta');
        
        // Appliquer le dégradé selon le thème
        this.applyGradientBackground();
    }

    applyGradientBackground() {
        // Appliquer le dégradé selon le thème
        const gradientClasses = {
            emerald: 'bg-gradient-to-br from-emerald-50 to-teal-100',
            blue: 'bg-gradient-to-br from-blue-50 to-indigo-100',
            purple: 'bg-gradient-to-br from-purple-50 to-pink-100'
        };
        
        const theme = this.settings.theme || 'emerald';
        document.body.className = document.body.className.replace(/bg-gradient-to-br from-\w+-\d+ to-\w+-\d+/g, '');
        document.body.classList.add(gradientClasses[theme]);
    }

    // Méthode pour mettre à jour les paramètres
    async updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.applyTheme();
        this.applyBackground();
    }
}

// Initialiser le gestionnaire de thèmes globalement
window.themeManager = new ThemeManager();