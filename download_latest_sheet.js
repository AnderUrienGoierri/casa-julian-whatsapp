const https = require('https');
const fs = require('fs');

const sheetId = '14dnUK5jNs53cReSwzBvPJkUK8OlhFkdNCG8iPaustLE';
const url = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/export?format=xlsx';

console.log('Descargando último Excel desde Google Drive...');
const file = fs.createWriteStream('tarjetas_regalo/OPARI TXARTELAK.xlsx');

function download(downloadUrl) {
    https.get(downloadUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            download(response.headers.location);
        } else {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log('✅ Archivo OPARI TXARTELAK.xlsx descargado con éxito.');
            });
        }
    }).on('error', (err) => {
        console.error('Error descargando:', err.message);
    });
}

download(url);
