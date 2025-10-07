// Utilitaires
function info_popup() {
  var toaster = document.getElementById("snackbar");
  toaster.className = "show";
  setTimeout(function () {
    toaster.className = toaster.className.replace("show", "");
  }, 3000);
}
// Gestion des erreurs et du chargement
let isSubmitting = false;

// Helper pour charger des scripts dynamiquement
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Initialisation de Vanta.js si activé
async function initVanta() {
    if (window.VANTA_ENABLED) {
        try {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r148/three.min.js');
            await loadScript('https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.topology.min.js');
            
            if (typeof VANTA !== 'undefined') {
                VANTA.TOPOLOGY({
                    el: "#vanta-bg",
                    mouseControls: true,
                    touchControls: true,
                    gyroControls: false,
                    minHeight: 200.0,
                    minWidth: 200.0,
                    scale: 1.0,
                    scaleMobile: 1.0,
                    color: 0x85a53b,
                    backgroundColor: 0xffffff,
                });
            }
        } catch (err) {
            console.error('Erreur de chargement de Vanta:', err);
        }
    }
}

// Sauvegarde automatique des brouillons
function saveDraft() {
    const formData = collectFormData();
    localStorage.setItem('journal_draft', JSON.stringify({
        data: formData,
        timestamp: new Date().toISOString()
    }));
}

// Initialisation des composants UI
function initializeUI() {
    // Initialiser les animations si AOS est chargé
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,
            easing: "ease-in-out",
            once: true,
            disable: window.innerWidth < 768 // désactiver sur mobile pour les performances
        });
    }

    // Initialiser les icônes si Feather est chargé
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
}

// Vérifier la session avant de permettre l'accès
async function checkSession() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    
    if (!data.authenticated) {
      console.log('❌ Non connecté, redirection vers login');
      window.location.href = '/login?redirect=journal.html';
    } else {
      console.log(`✅ Connecté en tant que: ${data.user}`);
    }
  } catch (err) {
    console.error('❌ Erreur de vérification de session:', err);
    window.location.href = '/login?redirect=journal.html';
  }
}

// Charger les paramètres utilisateur
async function loadUserSettings() {
  try {
    console.log('🔄 Chargement des paramètres utilisateur...');
    const response = await fetch('/api/user-settings', {
      credentials: 'same-origin'
    });
    
    if (response.ok) {
      const settings = await response.json();
      console.log('📊 Paramètres chargés:', settings);
      return settings;
    } else {
      console.log('📁 Aucun paramètre trouvé, utilisation des valeurs par défaut');
      return {
        theme: 'emerald',
        sections: ['mood', 'goals', 'reflections'],
        notifications: [],
        reminderTime: '20:00'
      };
    }
  } catch (err) {
    console.error('❌ Erreur lors du chargement des paramètres:', err);
    return {
      theme: 'emerald',
      sections: ['mood', 'goals', 'reflections'],
      notifications: [],
      reminderTime: '20:00'
    };
  }
}

// Appliquer les paramètres utilisateur au journal
function applyUserSettings(settings) {
  console.log('⚙️ Application des paramètres utilisateur...');
  
  // Le thème et le fond sont maintenant gérés par ThemeManager
  // On se contente de gérer les sections et notifications
  
  // Masquer/afficher les sections selon les paramètres
  applySectionVisibility(settings.sections);
  
  // Appliquer les notifications si configurées
  if (settings.notifications && settings.notifications.includes('daily')) {
    setupDailyReminder(settings.reminderTime);
  }
}

// Appliquer la visibilité des sections
function applySectionVisibility(enabledSections) {
  console.log('📝 Application de la visibilité des sections:', enabledSections);
  
  // Mapping des sections vers leurs sélecteurs
  const sectionMapping = {
    'mood': '.mood-section',
    'goals': '.goals-section', 
    'gratitude': '.gratitude-section',
    'reflections': '.reflections-section',
    'learnings': '.learnings-section',
    'tomorrow': '.tomorrow-section'
  };
  
  // Masquer toutes les sections d'abord
  Object.values(sectionMapping).forEach(selector => {
    const section = document.querySelector(selector);
    if (section) {
      section.style.display = 'none';
    }
  });
  
  // Afficher seulement les sections activées
  enabledSections.forEach(sectionKey => {
    const selector = sectionMapping[sectionKey];
    if (selector) {
      const section = document.querySelector(selector);
      if (section) {
        section.style.display = 'block';
        console.log(`✅ Section ${sectionKey} affichée`);
      }
    }
  });
}

// Configurer le rappel quotidien
function setupDailyReminder(reminderTime) {
  console.log('⏰ Configuration du rappel quotidien à:', reminderTime);
  
  // Ici on pourrait implémenter une notification push ou un rappel
  // Pour l'instant, on affiche juste un message dans la console
  console.log(`📅 Rappel quotidien configuré pour ${reminderTime}`);
}

  // Save journal function
  document
    .getElementById("save-journal")
    .addEventListener("click", async function () {
      try {
        // Charger les paramètres utilisateur pour savoir quelles sections sauvegarder
        const userSettings = await loadUserSettings();
        const enabledSections = userSettings.sections || ['mood', 'goals', 'reflections'];
        
        console.log('💾 Sauvegarde du journal avec les sections:', enabledSections);
        
        // Création d'une Map pour préserver l'ordre d'insertion
        const journalMap = new Map();

        // Données de base (toujours incluses)
        journalMap.set("date", document.getElementById("journal-date").value);
        journalMap.set("day", document.querySelector('input[name="day"]:checked')?.value);
        journalMap.set("savedAt", new Date().toISOString());
        journalMap.set("enabledSections", enabledSections);

        // Section Mood (si activée)
        if (enabledSections.includes('mood')) {
          journalMap.set("mood", document.querySelector('input[name="mood"]:checked')?.value);
          journalMap.set("feelingWords", Array.from(document.querySelectorAll(".mood-checkin")).map(input => input.value));
        }

        // Section Gratitude (si activée)
        if (enabledSections.includes('gratitude')) {
          journalMap.set("gratitude", Array.from(document.querySelectorAll(".gratitude-input")).map(input => input.value));
          journalMap.set("bestMoment", document.getElementById("bestmoment")?.value || "");
        }

        // Section Goals/Habits (si activée)
        if (enabledSections.includes('goals')) {
          journalMap.set("sleep", document.querySelector("#sleep")?.value || "");
          journalMap.set("exercise", document.getElementById("exercice")?.value || "");
          journalMap.set("nutrition", document.querySelector('input[name="nutrition"]:checked')?.value);
          journalMap.set("productiveHabits", document.getElementById("good-habits")?.value || "");
          journalMap.set("slippedHabits", document.getElementById("bad-habits")?.value || "");
        }

        // Section Reflections (si activée)
        if (enabledSections.includes('reflections')) {
          journalMap.set("challenges", document.getElementById("challenges")?.value || "");
          journalMap.set("reaction", document.getElementById("reaction")?.value || "");
          journalMap.set("differentApproach", document.getElementById("approach")?.value || "");
          journalMap.set("patterns", document.getElementById("patterns")?.value || "");
          journalMap.set("lessons", document.getElementById("lessons")?.value || "");
          journalMap.set("energyGivers", document.getElementById("energyGivers")?.value || "");
          journalMap.set("energyDrainers", document.getElementById("energyDrainers")?.value || "");
        }

        // Section Learnings (si activée)
        if (enabledSections.includes('learnings')) {
          journalMap.set("learnings", document.getElementById("learnings")?.value || "");
          journalMap.set("newKnowledge", document.getElementById("new-knowledge")?.value || "");
        }

        // Section Tomorrow (si activée)
        if (enabledSections.includes('tomorrow')) {
          journalMap.set("improvement", document.getElementById("improve")?.value || "");
          journalMap.set("affirmation", document.getElementById("affirmation")?.value || "");
        }

        // Notes supplémentaires (toujours incluses)
        journalMap.set("extraNotes", document.getElementById("extra-notes")?.value || "");

        // Convertir en objet pour la compatibilité (si besoin d'envoyer en JSON)
        const journalData = Object.fromEntries(journalMap);
        
        // Stocker dans document ou ailleurs
        document.journalData = journalData;

        // ✅ Affichage ORDONNÉ dans la console
        console.log("Journal data (ordonné):", journalData);

        // Optionnel : afficher sous forme de tableau
        console.table(Object.fromEntries(journalMap));

        // Envoyer au serveur
        const response = await fetch("/api/save-journal", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: 'same-origin',
          body: JSON.stringify(journalData),
        });

        if (response.ok) {
          console.log("✅ Journal envoyé et sauvegardé !");
          info_popup();
        } else {
          console.error("❌ Échec de l'envoi");
          const error = await response.json();
          console.error("Erreur:", error);
        }

      } catch (err) {
        console.error("❌ Erreur lors de la sauvegarde:", err);
      }
    });




// Initialisation de l'effet visuel au chargement de la page
// Initialisation de la page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Vérifier la session
        await checkSession();
        
        // Charger les paramètres utilisateur
        const userSettings = await loadUserSettings();
        
        // Appliquer les paramètres utilisateur
        applyUserSettings(userSettings);
        
        // Initialiser l'interface
        initializeUI();
        
        // Définir la date du jour
        const today = new Date().toISOString().split("T")[0];
        const dateInput = document.getElementById("journal-date");
        if (dateInput) {
            dateInput.value = today;
        }
        
        console.log('✅ Journal initialisé avec les paramètres utilisateur');
        
    } catch (err) {
        console.error('Erreur d\'initialisation:', err);
        console.log('Erreur lors du chargement de la page:', err);
    }
});
