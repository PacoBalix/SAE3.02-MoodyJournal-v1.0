// Utilitaires
const Toast = {
    show(message, type = 'success') {
        const toaster = document.getElementById("snackbar");
        toaster.textContent = message;
        toaster.className = `show ${type}`;
        setTimeout(() => {
            toaster.className = toaster.className.replace("show", "");
        }, 3000);
    }
};

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
    
    /*if (!data.authenticated) {
      window.location.href = '/login?redirect=journal.html';
    } else {*/
      console.log(`✅ Connecté en tant que: ${data.user}`);/*
    }*/
  } catch (err) {
    console.error('Erreur de vérification de session:', err);
    window.location.href = '/login?redirect=journal.html';
  }
}

  // Save journal function
  document
    .getElementById("save-journal")
    .addEventListener("click", function () {
      // Création d'une Map pour préserver l'ordre d'insertion
      const journalMap = new Map();

      // On ajoute chaque donnée dans l'ordre souhaité
      journalMap.set("date", document.getElementById("journal-date").value);
      journalMap.set(
        "day",
        document.querySelector('input[name="day"]:checked')?.value
      );
      journalMap.set(
        "mood",
        document.querySelector('input[name="mood"]:checked')?.value
      );
      journalMap.set(
        "feelingWords",
        Array.from(document.querySelectorAll(".mood-checkin")).map(
          (input) => input.value
        )
      );
      journalMap.set(
        "gratitude",
        Array.from(document.querySelectorAll(".gratitude-input")).map(
          (input) => input.value
        )
      );
      journalMap.set(
        "bestMoment",
        document.getElementById("bestmoment")?.value || ""
      );
      journalMap.set("sleep", document.querySelector("#sleep")?.value || "");
      journalMap.set(
        "exercise",
        document.getElementById("exercice")?.value || ""
      );
      journalMap.set(
        "nutrition",
        document.querySelector('input[name="nutrition"]:checked')?.value
      );
      journalMap.set(
        "productiveHabits",
        document.getElementById("good-habits")?.value || ""
      );
      journalMap.set(
        "slippedHabits",
        document.getElementById("bad-habits")?.value || ""
      );
      journalMap.set(
        "challenges",
        document.getElementById("challenges")?.value || ""
      );
      journalMap.set(
        "reaction",
        document.getElementById("reaction")?.value || ""
      );
      journalMap.set(
        "differentApproach",
        document.getElementById("approach")?.value || ""
      );
      journalMap.set(
        "patterns",
        document.getElementById("patterns")?.value || ""
      );
      journalMap.set(
        "lessons",
        document.getElementById("lessons")?.value || ""
      );
      journalMap.set(
        "energyGivers",
        document.getElementById("energyGivers")?.value || ""
      );
      journalMap.set(
        "energyDrainers",
        document.getElementById("energyDrainers")?.value || ""
      );
      journalMap.set(
        "improvement",
        document.getElementById("improve")?.value || ""
      );
      journalMap.set(
        "affirmation",
        document.getElementById("affirmation")?.value || ""
      );
      journalMap.set(
        "extraNotes",
        document.getElementById("extra-notes")?.value || ""
      );

      // Convertir en objet pour la compatibilité (si besoin d'envoyer en JSON)
      const journalData = Object.fromEntries(journalMap);
      
      // Stocker dans document ou ailleurs
      document.journalData = journalData;

      // ✅ Affichage ORDONNÉ dans la console
      console.log("Journal data (ordonné):", journalData);

      // Optionnel : afficher sous forme de tableau
      console.table(Object.fromEntries(journalMap));



      // Ici tu peux envoyer journalData à un serveur
      // ex: fetch('/api/save-journal', { method: 'POST', body: JSON.stringify(journalData) })
   
      fetch("http://localhost:3000/api/save-journal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(journalData),
      })
        .then((response) => {
          if (response.ok) {
            console.log("✅ Journal envoyé et sauvegardé !");
          } else {
            console.error("❌ Échec de l’envoi");
          }
        })
        .catch((err) => {
          console.error("Erreur réseau :", err);
        });


      // For demo purposes, we'll just show an alert
      Toast();

      // alert('Journal entry saved successfully!');

      // In a real app, you would:
      // 1. Send data to your backend API
      // 2. Handle the response
      // 3. Maybe redirect or show success message
    });


// Initialisation de l'effet visuel au chargement de la page
// Initialisation de la page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Vérifier la session
        await checkSession();
        
        // Charger les préférences utilisateur
        const response = await fetch('/api/user-preferences');
        const preferences = await response.json();
        window.VANTA_ENABLED = preferences.enableVanta;
        
        // Initialiser l'interface et les effets visuels
        initializeUI();
        if (window.VANTA_ENABLED) {
            await initVanta();
        }
        
        // Définir la date du jour
        const today = new Date().toISOString().split("T")[0];
        const dateInput = document.getElementById("journal-date");
        if (dateInput) {
            dateInput.value = today;
        }
        
    } catch (err) {
        console.error('Erreur d\'initialisation:', err);
        Toast.show('Erreur lors du chargement de la page', 'error');
    }
});
