-- ESQUEMA DE BASE DE DATOS PROFESIONAL POSTGRESQL PARA CASA JULIAN

CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20) NOT NULL,
    dni VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(100) NOT NULL,
    idioma VARCHAR(10) DEFAULT 'es',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservas (
    id VARCHAR(30) PRIMARY KEY,
    cliente_dni VARCHAR(20) REFERENCES clientes(dni) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20) NOT NULL,
    dni VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL,
    fecha VARCHAR(20),
    hora VARCHAR(10),
    comensales INT NOT NULL,
    estado VARCHAR(30) DEFAULT 'CONFIRMADA',
    idioma VARCHAR(10) DEFAULT 'es',
    dias_preferencia VARCHAR(100) DEFAULT 'Sin preferencia',
    tipo_reserva VARCHAR(50) DEFAULT 'online',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lista_espera (
    id VARCHAR(30) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20) NOT NULL,
    dni VARCHAR(20) DEFAULT 'N/A',
    email VARCHAR(100) DEFAULT 'N/A',
    dias_preferencia VARCHAR(100) DEFAULT 'Sin preferencia',
    hora VARCHAR(10),
    comensales INT NOT NULL,
    ninos VARCHAR(50) DEFAULT '0',
    alergias TEXT DEFAULT 'Ninguna',
    estado VARCHAR(30) DEFAULT 'Pendiente confirmar',
    idioma VARCHAR(10) DEFAULT 'es',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tarjetas_regalo (
    id VARCHAR(50) PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    comprador_nombre VARCHAR(100),
    comprador_telefono VARCHAR(20),
    fecha_compra VARCHAR(20),
    fecha_caducidad VARCHAR(20),
    estado VARCHAR(20) DEFAULT 'ACTIVA',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ÍNDICES DE ALTO RENDIMIENTO PARA CONSULTAS RÁPIDAS
CREATE INDEX IF NOT EXISTS idx_reservas_fecha_hora ON reservas(fecha, hora, estado);
CREATE INDEX IF NOT EXISTS idx_reservas_dni ON reservas(dni);
CREATE INDEX IF NOT EXISTS idx_reservas_tipo ON reservas(tipo_reserva);
CREATE INDEX IF NOT EXISTS idx_lista_espera_estado ON lista_espera(estado);
CREATE INDEX IF NOT EXISTS idx_tarjetas_codigo ON tarjetas_regalo(codigo);
