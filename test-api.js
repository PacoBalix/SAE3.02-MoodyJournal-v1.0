// Script de test pour vérifier les API
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testAPI() {
    console.log('🧪 Test des API MoodyJournal...\n');
    
    try {
        // Test 1: Route de test basique
        console.log('📡 Test 1: Route /api/test');
        const testResponse = await fetch(`${BASE_URL}/api/test`);
        console.log('Status:', testResponse.status, testResponse.statusText);
        
        if (testResponse.ok) {
            const testData = await testResponse.json();
            console.log('✅ Test API réussi:', testData);
        } else {
            console.error('❌ Test API échoué:', testResponse.status);
        }
        
        // Test 2: Vérification de session (sans authentification)
        console.log('\n📡 Test 2: Route /api/session (sans auth)');
        const sessionResponse = await fetch(`${BASE_URL}/api/session`);
        console.log('Status:', sessionResponse.status, sessionResponse.statusText);
        
        if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            console.log('✅ Session:', sessionData);
        } else {
            console.error('❌ Session échouée:', sessionResponse.status);
        }
        
        // Test 3: Test des routes protégées (devrait retourner 401)
        console.log('\n📡 Test 3: Route /api/user-settings (sans auth)');
        const settingsResponse = await fetch(`${BASE_URL}/api/user-settings`);
        console.log('Status:', settingsResponse.status, settingsResponse.statusText);
        
        if (settingsResponse.status === 401) {
            console.log('✅ Protection d\'authentification fonctionne');
        } else {
            console.error('❌ Protection d\'authentification échouée:', settingsResponse.status);
        }
        
    } catch (err) {
        console.error('❌ Erreur lors du test API:', err);
    }
}

// Exécuter le test
testAPI();
