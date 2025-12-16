DROP DATABASE IF EXISTS estudio_ultrasonido;
CREATE DATABASE estudio_ultrasonido;
USE estudio_ultrasonido;

CREATE TABLE IF NOT EXISTS usuarios(
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    contrasena VARCHAR(255) NOT NULL,
    rol ENUM('ADMIN','INVESTIGADOR','ASISTENTE') NOT NULL DEFAULT 'INVESTIGADOR'
);

CREATE TABLE IF NOT EXISTS codigos_usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    tipo_usuario ENUM('ADMIN','ASISTENTE','INVESTIGADOR') NOT NULL
);

INSERT INTO codigos_usuarios (codigo, tipo_usuario) VALUES ('ADMIN123', 'ADMIN');
INSERT INTO codigos_usuarios (codigo, tipo_usuario) VALUES ('ASIS789', 'ASISTENTE');
INSERT INTO codigos_usuarios (codigo, tipo_usuario) VALUES ('INV456', 'INVESTIGADOR');

CREATE TABLE IF NOT EXISTS pacientes(
    id_paciente INT AUTO_INCREMENT PRIMARY KEY,
    edad INT NOT NULL,
    genero ENUM('MASCULINO','FEMENINO','OTRO') NOT NULL DEFAULT 'OTRO',
    notas_generales TEXT
);


CREATE TABLE IF NOT EXISTS patologias(
    id_patologia INT AUTO_INCREMENT PRIMARY KEY,
    nombre_patologia VARCHAR(100) NOT NULL,
    codigo_cie VARCHAR(10),
    descripcion TEXT
);


CREATE TABLE IF NOT EXISTS estudios(
    id_estudio INT AUTO_INCREMENT PRIMARY KEY,
    id_paciente INT NOT NULL,
    fecha_estudio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archivo_ruta VARCHAR(500) NOT NULL,
    perspectiva ENUM('TRANSTEMPORAL', 'TRANSORBITARIO', 'TRANSFORAMINAL', 'OTRO') NOT NULL,
    vaso_evaluado ENUM('ACM','ACA','ACP','BASILAR','VERTEBRAL','OTRO') NOT NULL,
    lado ENUM('DERECHO','IZQUIERDO','BILATERAL') NOT NULL,
    
    FOREIGN KEY (id_paciente) REFERENCES pacientes(id_paciente) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS estudios_patologias (
    id_estudio INT NOT NULL,
    id_patologia INT NOT NULL,
    grado_severidad ENUM('LEVE', 'MODERADO', 'SEVERO', 'CRITICO'),
    nota_especifica TEXT,
    
    PRIMARY KEY (id_estudio, id_patologia),
    
    FOREIGN KEY (id_estudio) REFERENCES estudios(id_estudio) ON DELETE CASCADE,
    FOREIGN KEY (id_patologia) REFERENCES patologias(id_patologia) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS imagenes_estudio (
    id_imagen INT AUTO_INCREMENT PRIMARY KEY,
    id_estudio INT NOT NULL,
    ruta_archivo VARCHAR(500) NOT NULL,
    tipo ENUM('IMAGEN','VIDEO')
        NOT NULL DEFAULT 'IMAGEN',
    descripcion TEXT,

    FOREIGN KEY (id_estudio) REFERENCES estudios(id_estudio) ON DELETE CASCADE
);

CREATE USER IF NOT EXISTS 'lab_user'@'localhost' IDENTIFIED BY 'lab_pass';
GRANT ALL PRIVILEGES ON estudio_ultrasonido.* TO 'lab_user'@'localhost';
FLUSH PRIVILEGES;