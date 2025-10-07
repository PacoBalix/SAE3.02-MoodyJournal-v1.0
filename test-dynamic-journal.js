// Script de test pour le système de journal dynamique
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testDynamicJournal() {
    console.log('🧪 Test du système de journal dynamique...\n');
    
    try {
        // Test 1: Vérifier que les routes API fonctionnent
        console.log('📡 Test 1: Routes API');
        const testResponse = await fetch(`${BASE_URL}/api/test`);
        if (testResponse.ok) {
            console.log('✅ API de test fonctionne');
        } else {
            console.error('❌ API de test échouée');
        }
        
        // Test 2: Vérifier la session
        console.log('\n📡 Test 2: Vérification de session');
        const sessionResponse = await fetch(`${BASE_URL}/api/session`);
        if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            console.log('✅ Session:', sessionData);
        } else {
            console.error('❌ Erreur de session');
        }
        
        // Test 3: Vérifier les paramètres utilisateur
        console.log('\n📡 Test 3: Paramètres utilisateur');
        const settingsResponse = await fetch(`${BASE_URL}/api/user-settings`);
        if (settingsResponse.ok) {
            const settings = await settingsResponse.json();
            console.log('✅ Paramètres chargés:', settings);
        } else {
            console.log('📁 Aucun paramètre trouvé (normal si pas encore configuré)');
        }
        
        // Test 4: Vérifier les entrées du journal
        console.log('\n📡 Test 4: Entrées du journal');
        const entriesResponse = await fetch(`${BASE_URL}/api/journal-entries`);
        if (entriesResponse.ok) {
            const entries = await entriesResponse.json();
            console.log(`✅ ${entries.length} entrées trouvées`);
        } else {
            console.error('❌ Erreur lors du chargement des entrées');
        }
        
        console.log('\n🎯 Tests terminés !');
        console.log('\n📋 Instructions pour tester manuellement :');
        console.log('1. Connectez-vous via http://localhost:3000');
        console.log('2. Allez dans Paramètres et configurez vos sections préférées');
        console.log('3. Allez dans le Journal - seules vos sections activées devraient être visibles');
        console.log('4. Écrivez une entrée et sauvegardez');
        console.log('5. Allez dans Consulter et testez l\'export filtré');
        
    } catch (err) {
        console.error('❌ Erreur lors du test:', err);
    }
}

// Exécuter le test
testDynamicJournal();
