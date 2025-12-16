# Repositorio Ultrasonido Doppler Transcraneal (TCD)

## Descripción del proyecto
Este proyecto consiste en el desarrollo de una aplicación web para la **administración y consulta de información clínica asociada a estudios de ultrasonido Doppler transcraneal (TCD)**.  
El sistema permite gestionar usuarios con distintos roles, almacenar imágenes de estudios, organizar información relevante y facilitar la búsqueda de registros de manera estructurada.

El proyecto fue desarrollado como parte de un **trabajo académico**, siguiendo buenas prácticas de organización de código, control de versiones y separación de responsabilidades.

---

## Objetivo
Desarrollar una plataforma que permita:
- Administrar resultados de estudios Doppler TCD.
- Gestionar usuarios con distintos niveles de acceso.
- Almacenar y visualizar imágenes asociadas a estudios clínicos.
- Facilitar la consulta y organización de información médica de forma ordenada.

---

## Tecnologías utilizadas
- **Node.js**
- **Express.js**
- **MySQL**
- **HTML**
- **CSS**
- **Bootstrap**
- **JavaScript**
- **Nodemon**
- **Git & GitHub**

---

## Estructura del proyecto

```bash
PROYECTO FINAL/
│
├── BaseDatos/
│   └── schema.sql
│
├── Public/
│   ├── bootstrap/
│   ├── index.html
│   ├── login.html
│   ├── registro.html
│   ├── navbar.html
│   └── error-login.html
│
├── uploads/
│   └── ultrasonidos/
│
├── server.js
├── styles.css
├── nodemon.json
├── package.json
├── package-lock.json
├── .gitignore
```
---

## Gestión de usuarios
El sistema maneja autenticación y autorización mediante sesiones, permitiendo distintos **roles de usuario**, tales como:
- Administrador
- Investigador
- Asistente

Cada rol tiene permisos específicos para acceder a distintas funcionalidades del sistema.

---

## Seguridad
- Contraseñas cifradas mediante **bcrypt**.
- Uso de **sesiones** para control de acceso.
- Variables sensibles gestionadas mediante archivo `.env` (no incluido en el repositorio).

---

## Instalación y ejecución
1. Clonar el repositorio:
   ```bash
   git clone https://github.com/l23212231/Repositorio-Ultrasonido-Doppler.git
2. Instalar dependencias:
   ```bash
   npm install
3. Configurar variables de entorno en un archivo .env
4. Ejecutar el Servidor:
  ```bash
node server.js
```
---
## Contexto académico
Este proyecto fue desarrollado como parte de una actividad académica, aplicando conocimientos de:
- Desarrollo web
- Bases de datos
- Seguridad informática
- Ingeniería de software
---
## Autor
 - Judith Soriano
 - Ingeniería Biomédica
 - Instituto Tecnológico de Tijuana
---
## Notas finales
- Este repositorio tiene fines educativos y académicos.
- El sistema no sustituye plataformas clínicas certificadas y no está destinado a uso médico real.
