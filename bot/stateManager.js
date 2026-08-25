const path = require('path');
const fs = require('fs');

const userStates = new Map();
const userLanguages = new Map();
const userLocations = new Map();

const statesFilePath = path.join(__dirname, '..', 'user_states.json');

function loadPersistentStates() {
    try {
        if (fs.existsSync(statesFilePath)) {
            const raw = fs.readFileSync(statesFilePath, 'utf8');
            const data = JSON.parse(raw);
            if (data.states) {
                Object.keys(data.states).forEach(k => userStates.set(k, data.states[k]));
            }
            if (data.languages) {
                Object.keys(data.languages).forEach(k => userLanguages.set(k, data.languages[k]));
            }
            if (data.locations) {
                Object.keys(data.locations).forEach(k => userLocations.set(k, data.locations[k]));
            }
            console.log(`✅ Cargados ${userStates.size} estados de usuario de persistencia.`);
        }
    } catch (err) {
        console.error("⚠️ Error cargando estados persistentes:", err.message);
    }
}

let isSavingState = false;
function savePersistentStates() {
    if (isSavingState) return;
    isSavingState = true;
    try {
        const objStates = {};
        const objLangs = {};
        const objLocs = {};
        userStates.forEach((val, key) => { objStates[key] = val; });
        userLanguages.forEach((val, key) => { objLangs[key] = val; });
        userLocations.forEach((val, key) => { objLocs[key] = val; });
        fs.writeFileSync(statesFilePath, JSON.stringify({ states: objStates, languages: objLangs, locations: objLocs }, null, 2), 'utf8');
    } catch (err) {
        console.error("⚠️ Error guardando estados persistentes:", err.message);
    } finally {
        isSavingState = false;
    }
}

loadPersistentStates();

const rawStateSet = userStates.set.bind(userStates);
const rawStateDelete = userStates.delete.bind(userStates);
const rawLangSet = userLanguages.set.bind(userLanguages);
const rawLangDelete = userLanguages.delete.bind(userLanguages);
const rawLocSet = userLocations.set.bind(userLocations);
const rawLocDelete = userLocations.delete.bind(userLocations);

userStates.set = function(key, value) {
    const res = rawStateSet(key, value);
    savePersistentStates();
    return res;
};

userStates.delete = function(key) {
    const res = rawStateDelete(key);
    savePersistentStates();
    return res;
};

userLanguages.set = function(key, value) {
    const res = rawLangSet(key, value);
    savePersistentStates();
    return res;
};

userLanguages.delete = function(key) {
    const res = rawLangDelete(key);
    savePersistentStates();
    return res;
};

userLocations.set = function(key, value) {
    const res = rawLocSet(key, value);
    savePersistentStates();
    return res;
};

userLocations.delete = function(key) {
    const res = rawLocDelete(key);
    savePersistentStates();
    return res;
};

module.exports = {
    userStates,
    userLanguages,
    userLocations
};
