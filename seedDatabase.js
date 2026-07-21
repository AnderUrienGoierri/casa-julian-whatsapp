const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

const nombresDemo = [
    "Carlos Argiñano", "Miren Gorrotxategi", "Iñaki Zabala", "Jon Ander Elorza", 
    "Elena Arzak", "Patxi Subijana", "Maite Urrutia", "Aitor Goikoetxea", 
    "Beatriz Mendizabal", "Xabier Ezkurdia", "Lucia Bengoetxea", "Kepa Salaberria"
];

const turnos = ["13:30", "14:00", "14:30", "15:00", "20:30", "21:00", "21:30", "22:00"];

function generateRealisticData() {
    const reservas = [];
    const listaEspera = [];

    // Reservas de prueba preexistentes para probar consultas
    reservas.push({
        id: "RES-889900",
        nombre: "Ander Urien Telleria",
        telefono: "664037707",
        dni: "72484472H",
        email: "anurte@gmail.com",
        fecha: "25/10/2026",
        hora: "14:30",
        comensales: 4,
        estado: "CONFIRMADA",
        fechaCreacion: new Date().toISOString()
    });

    // Generar reservas llenas para fines de semana hasta el 31 de Octubre de 2026
    const startDate = new Date('2026-07-21');
    const endDate = new Date('2026-10-31');

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay(); // 0 = Domingo, 5 = Viernes, 6 = Sábado
        const dayStr = String(d.getDate()).padStart(2, '0');
        const monthStr = String(d.getMonth() + 1).padStart(2, '0');
        const yearStr = d.getFullYear();
        const fechaFormatted = `${dayStr}/${monthStr}/${yearStr}`;

        // Si es fin de semana (Viernes cena, Sábado comida/cena, Domingo comida), llenar la capacidad
        if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
            turnos.forEach((hora, idx) => {
                // Llenar al 100% (20 comensales) las horas punta: 14:00, 14:30 y 21:00, 21:30
                if (hora === "14:00" || hora === "14:30" || hora === "21:00" || hora === "21:30") {
                    reservas.push({
                        id: `RES-FULL-${yearStr}${monthStr}${dayStr}-${idx}`,
                        nombre: nombresDemo[idx % nombresDemo.length],
                        telefono: `6001122${idx}`,
                        dni: `1122334${idx}A`,
                        email: `cliente${idx}@ejemplo.com`,
                        fecha: fechaFormatted,
                        hora: hora,
                        comensales: 20, // Llena la capacidad de 20 personas
                        estado: "CONFIRMADA",
                        fechaCreacion: new Date().toISOString()
                    });
                }
            });
        }
    }

    // Agregar un par de registros de prueba a la lista de espera
    listaEspera.push({
        id: "ESP-100200",
        nombre: "Iker Casillas",
        telefono: "611223344",
        dni: "88776655B",
        email: "iker@ejemplo.com",
        fecha: "24/10/2026",
        hora: "14:30",
        comensales: 2,
        fechaRegistro: new Date().toISOString()
    });

    const dbData = {
        capacidadMaximaPorTurno: 20,
        reservas,
        listaEspera
    };

    fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2), 'utf8');
    console.log(`✅ Base de datos simulada y realista creada con ${reservas.length} reservas registradas hasta finales de Octubre 2026.`);
}

generateRealisticData();
