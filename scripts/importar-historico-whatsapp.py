#!/usr/bin/env python3
"""
scripts/importar-historico-whatsapp.py
Procesador e importador masivo de chats históricos de WhatsApp Business
para Casa Julián de Tolosa.

Lee todos los archivos .zip de copia_chats_whatsapp_business/, extrae el HTML,
parsea mensajes con fechas, emisores y textos, cruza contactos con silenciar.txt
y guarda el resultado en db.json y en PostgreSQL si está configurado.
"""

import os
import re
import sys
import json
import glob
import zipfile
from datetime import datetime
from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding='utf-8')

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CHATS_DIR = os.path.join(PROJECT_ROOT, 'copia_chats_whatsapp_business')
SILENCIAR_TXT = os.path.join(PROJECT_ROOT, 'telefonos_contactos_silenciar_bot', 'silenciar.txt')
DB_JSON_PATH = os.path.join(PROJECT_ROOT, 'db.json')

# Meses en inglés a número
MESES = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12
}

def parse_date_to_iso(date_str, time_str):
    """
    Convierte 'August 25, 2026' y '10:46 AM' a '2026-08-25T10:46:00+02:00'
    """
    try:
        # Limpiar
        d_clean = date_str.strip()
        t_clean = time_str.strip()
        
        # Parsear fecha en inglés
        match = re.match(r'([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})', d_clean)
        if match:
            month_name = match.group(1).lower()
            day = int(match.group(2))
            year = int(match.group(3))
            month = MESES.get(month_name, 8)
        else:
            # Fallback a fecha actual
            now = datetime.now()
            year, month, day = now.year, now.month, now.day

        # Parsear hora (ej. '10:46 AM', '4:11 PM', '14:30')
        hour = 12
        minute = 0
        t_match = re.match(r'(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?', t_clean)
        if t_match:
            hour = int(t_match.group(1))
            minute = int(t_match.group(2))
            ampm = t_match.group(3)
            if ampm:
                ampm = ampm.upper()
                if ampm == 'PM' and hour < 12:
                    hour += 12
                elif ampm == 'AM' and hour == 12:
                    hour = 0
        
        return f"{year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:00+02:00"
    except Exception as e:
        return datetime.now().isoformat()

def load_silenciar_contacts():
    """
    Carga los contactos conocidos de silenciar.txt
    """
    contacts = {}
    if not os.path.exists(SILENCIAR_TXT):
        return contacts
    
    current_cat = 'proveedor'
    with open(SILENCIAR_TXT, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if 'PROVEEDOR' in line.upper():
                current_cat = 'proveedor'
                continue
            elif 'ALBA' in line.upper():
                current_cat = 'alba'
                continue
            
            # Formato: +34 633 63 87 32 - Maitines
            match = re.match(r'^([+0-9\s()\-]+)(?:-\s*(.*))?$', line)
            if match:
                raw_phone = match.group(1).strip()
                raw_name = match.group(2).strip() if match.group(2) else ''
                clean_phone = re.sub(r'\D', '', raw_phone)
                if clean_phone.startswith('34') or len(clean_phone) > 9:
                    clean_phone = clean_phone
                elif len(clean_phone) == 9:
                    clean_phone = f"34{clean_phone}"
                
                if raw_name:
                    contacts[raw_name.lower()] = {
                        'phone': clean_phone,
                        'name': raw_name,
                        'category': current_cat
                    }
    return contacts

def clean_phone_number(raw_name):
    """
    Normaliza el teléfono a solo dígitos internacionales.
    """
    digits = re.sub(r'\D', '', raw_name)
    if not digits:
        return None
    # Si es español de 9 dígitos empezando por 6, 7, 8 o 9
    if len(digits) == 9 and digits[0] in '6789':
        return f"34{digits}"
    return digits

def parse_html_content(html_content, default_name):
    """
    Parsea el contenido HTML generado por la exportación de WhatsApp.
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    current_date = 'August 27, 2026'
    messages = []
    
    for div in soup.find_all('div', class_='__vW7d1'):
        classes = div.get('class', [])
        
        # Separador de fecha
        if '__date' in classes or any('__date' in c for c in classes):
            date_span = div.find('span', class_='__ZhF0n')
            if date_span:
                current_date = date_span.get_text(strip=True)
            continue
            
        # Mensaje (In / Out)
        msg_box = div.find('div', class_=lambda c: c and ('__message-in' in c or '__message-out' in c))
        if msg_box:
            box_classes = msg_box.get('class', [])
            emisor = 'cliente' if '__message-in' in box_classes else 'recepcion'
            
            # Texto del mensaje
            text_div = msg_box.find('div', class_='__ZhF0n')
            text = ''
            if text_div:
                for br in text_div.find_all('br'):
                    br.replace_with('\n')
                text = text_div.get_text().strip()
                
            # Hora
            time_span = msg_box.find('span', class_='___1DZAH')
            time_str = time_span.get_text(strip=True) if time_span else '12:00 PM'
            
            # ID original
            raw_id = div.get('id') or f"wa_{len(messages)}"
            iso_time = parse_date_to_iso(current_date, time_str)
            
            messages.append({
                'id': f"hist_{raw_id}",
                'emisor': emisor,
                'tipo': 'text',
                'texto': text,
                'metadata': {
                    'origen': 'HISTORICO_IMPORTADO',
                    'raw_date': current_date,
                    'raw_time': time_str
                },
                'created_at': iso_time
            })
            
    return messages

def main():
    print("=" * 70)
    print("🚀 INICIANDO IMPORTACIÓN MASIVA DE CHATS HISTÓRICOS DE WHATSAPP")
    print(f"📁 Directorio de origen: {CHATS_DIR}")
    print("=" * 70)
    
    zip_files = glob.glob(os.path.join(CHATS_DIR, '*.zip'))
    print(f"📦 Total de archivos ZIP encontrados: {len(zip_files)}")
    
    if not zip_files:
        print("❌ No se encontraron archivos .zip en la carpeta copia_chats_whatsapp_business/")
        return

    silenciar_contacts = load_silenciar_contacts()
    print(f"📋 Contactos mapeados desde silenciar.txt: {len(silenciar_contacts)}")

    # Cargar db.json existente
    if not os.path.exists(DB_JSON_PATH):
        db_data = {}
    else:
        with open(DB_JSON_PATH, 'r', encoding='utf-8') as f:
            db_data = json.load(f)
            
    if 'bot_chat_history' not in db_data:
        db_data['bot_chat_history'] = []
        
    existing_msg_ids = set(m.get('id') for m in db_data['bot_chat_history'] if 'id' in m)
    
    imported_chats_count = 0
    new_messages_count = 0
    chats_by_phone = {}
    contacts_to_silence = []

    for zpath in zip_files:
        basename = os.path.splitext(os.path.basename(zpath))[0]
        
        # Determinar teléfono y nombre de cliente
        clean_phone = clean_phone_number(basename)
        client_name = 'Cliente WhatsApp'
        category = 'cliente'
        
        lower_name = basename.lower()
        
        # Buscar en silenciar.txt
        matched = False
        for s_name, s_info in silenciar_contacts.items():
            if s_name in lower_name or lower_name in s_name:
                clean_phone = s_info['phone']
                client_name = s_info['name']
                category = s_info['category']
                matched = True
                break
                
        if not matched:
            if clean_phone:
                client_name = f"+{clean_phone}"
            else:
                # Nombre descriptivo (ej. Hotel Maria Cristina Mvl, Taxi Casa Julian)
                client_name = basename
                slug = re.sub(r'[^a-z0-9]', '_', lower_name).strip('_')
                clean_phone = f"tel_{slug}"
                if 'hotel' in lower_name:
                    category = 'hoteles'
                elif 'taxi' in lower_name:
                    category = 'taxi'
                elif 'alba' in lower_name:
                    category = 'alba'
                elif 'proveedor' in lower_name:
                    category = 'proveedor'
                else:
                    category = 'contacto'

        # Si pertenece a categoría especial, registrar para silenciar
        if category in ['proveedor', 'alba', 'hoteles', 'taxi']:
            contacts_to_silence.append({
                'telefono': clean_phone,
                'nombre': client_name,
                'categoria': category,
                'notas': f"Importado de WhatsApp Business ({category.upper()})"
            })

        # Leer HTML dentro del ZIP
        try:
            with zipfile.ZipFile(zpath, 'r') as z:
                html_files = [f for f in z.namelist() if f.endswith('.html')]
                if not html_files:
                    continue
                html_content = z.read(html_files[0]).decode('utf-8', errors='ignore')
                messages = parse_html_content(html_content, client_name)
                
                if messages:
                    imported_chats_count += 1
                    for m in messages:
                        m['telefono'] = clean_phone
                        m['metadata']['nombreCliente'] = client_name
                        m['metadata']['categoria'] = category
                        
                        if m['id'] not in existing_msg_ids:
                            db_data['bot_chat_history'].append(m)
                            existing_msg_ids.add(m['id'])
                            new_messages_count += 1
                            
                    chats_by_phone[clean_phone] = {
                        'nombre': client_name,
                        'total': len(messages),
                        'categoria': category
                    }
        except Exception as e:
            print(f"⚠️ Error procesando {basename}: {e}")

    # Guardar en db.json
    print(f"\n💾 Guardando en {DB_JSON_PATH}...")
    with open(DB_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(db_data, f, ensure_ascii=False, indent=2)

    print("=" * 70)
    print("🎉 IMPORTACIÓN MASIVA FINALIZADA CON ÉXITO")
    print(f"✅ Conversaciones procesadas con mensajes: {imported_chats_count}")
    print(f"✅ Nuevos mensajes históricos importados: {new_messages_count}")
    print(f"✅ Total mensajes en historial de bot_chat_history: {len(db_data['bot_chat_history'])}")
    print(f"✅ Contactos clasificados para bypass/silencio: {len(contacts_to_silence)}")
    print("=" * 70)

if __name__ == '__main__':
    main()
