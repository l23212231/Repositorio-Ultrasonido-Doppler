const express = require('express');
const app = express();
const path = require('path');
const mysql = require('mysql2/promise'); 
const bcrypt = require('bcrypt');
const session = require('express-session');
const fs = require('fs');
require('dotenv').config();
const PORT = process.env.PORT || 3000;

// Importar Multer
const multer = require('multer'); 

/* =========================
   CONFIGURACIÓN MULTER
========================= */
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const ULTRASONIDOS_SUBDIR = path.join(UPLOAD_DIR, 'ultrasonidos');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(ULTRASONIDOS_SUBDIR)) {
    fs.mkdirSync(ULTRASONIDOS_SUBDIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, ULTRASONIDOS_SUBDIR); 
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
});

const upload = multer({ storage: storage });

/* =========================
   CONFIGURACIÓN DB Y EXPRESS
========================= */
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, 
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 20000, 
    multipleStatements: true 
});

pool.getConnection()
    .then(connection => {
        console.log('Conexión exitosa a la base de datos:', process.env.DB_NAME);
        connection.release();
    })
    .catch(err => {
        console.error('Error al conectar a la base de datos. Verifica el .env', err.stack);
    });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'secreto_super_secreto',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 horas
}));

/* =========================
   MIDDLEWARES DE AUTENTICACIÓN
========================= */
// Requerir inicio de sesión
const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

// Requerir un rol específico
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.session.rol || !roles.includes(req.session.rol)) {
            return res.status(403).send(renderPage('Acceso Denegado', 
                `<div class="alert alert-danger">Su rol (${req.session.rol || 'No logueado'}) no tiene permiso para acceder a esta página.</div>`));
        }
        next();
    };
};

/* =========================
   FUNCIÓN DE RENDERIZADO GLOBAL
========================= */
const renderPage = (title, content, includeNavbar = true) => {
    const navbarScript = includeNavbar ? `
        <div id="navbar"></div>
        <script>
            fetch('/navbar')
                .then(r => {
                    if (r.ok) return r.text();
                    throw new Error('Error cargando navbar');
                })
                .then(d => {
                    const navContainer = document.getElementById('navbar');
                    if(navContainer) navContainer.innerHTML = d;
                })
                .catch(err => console.error('Error al cargar el navbar:', err));
        </script>` : '';

    const containerClass = includeNavbar ? 'container mt-4' : 'container mt-5';

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <link rel="stylesheet" href="/bootstrap/bootstrap.css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    </head>
    <body class="bg-light">
        ${navbarScript}
        <div class="${containerClass}">
            ${content}
        </div>
        <script src="/bootstrap/bootstrap.bundle.min.js"></script>
    </body>
    </html>
    `;
};

/* =========================
   RUTA RAÍZ - GESTIONAR ESTUDIOS
========================= */
/* =========================
   RUTA RAÍZ - GESTIONAR ESTUDIOS CON FILTROS
========================= */
app.get('/', requireLogin, async (req, res) => {
    try {
        // Obtener parámetros de filtro de la URL
        const {
            q, // Búsqueda por palabras clave
            edad_min,
            edad_max,
            vaso_evaluado,
            lado,
            genero,
            perspectiva
        } = req.query;

        // Construir la consulta SQL dinámicamente
        let sql = `
            SELECT 
                e.id_estudio, e.fecha_estudio, e.perspectiva, e.vaso_evaluado, e.lado, e.archivo_ruta,
                p.edad, p.genero,
                pat.nombre_patologia, ep.grado_severidad
            FROM estudios e
            JOIN pacientes p ON e.id_paciente = p.id_paciente
            LEFT JOIN estudios_patologias ep ON e.id_estudio = ep.id_estudio
            LEFT JOIN patologias pat ON ep.id_patologia = pat.id_patologia
            WHERE 1=1
        `;
        
        const params = [];

        // Filtro por palabras clave (búsqueda en patología o vaso)
        if (q && q.trim() !== '') {
            sql += ` AND (
                pat.nombre_patologia LIKE ? OR 
                e.vaso_evaluado LIKE ? OR
                e.perspectiva LIKE ?
            )`;
            const searchTerm = `%${q}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        // Filtro por rango de edad
        if (edad_min) {
            sql += ` AND p.edad >= ?`;
            params.push(parseInt(edad_min));
        }
        if (edad_max) {
            sql += ` AND p.edad <= ?`;
            params.push(parseInt(edad_max));
        }

        // Filtro por vaso evaluado
        if (vaso_evaluado && vaso_evaluado !== 'TODOS') {
            sql += ` AND e.vaso_evaluado = ?`;
            params.push(vaso_evaluado);
        }

        // Filtro por lado
        if (lado && lado !== 'TODOS') {
            sql += ` AND e.lado = ?`;
            params.push(lado);
        }

        // Filtro por género
        if (genero && genero !== 'TODOS') {
            sql += ` AND p.genero = ?`;
            params.push(genero);
        }

        // Filtro por perspectiva
        if (perspectiva && perspectiva !== 'TODOS') {
            sql += ` AND e.perspectiva = ?`;
            params.push(perspectiva);
        }

        sql += ` ORDER BY e.fecha_estudio DESC`;

        const [estudios] = await pool.query(sql, params);

        // Construir el HTML de filtros
        const filtrosHtml = `
            <div class="card mb-4">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0"><i class="fas fa-filter"></i> Filtros de Búsqueda</h5>
                </div>
                <div class="card-body">
                    <form id="filtrosForm" method="GET" action="/">
                        
                        <!-- Barra de búsqueda por palabras clave -->
                        <div class="mb-3">
                            <label class="form-label">Palabras clave</label>
                            <div class="input-group">
                                <input type="text" 
                                       class="form-control" 
                                       name="q" 
                                       placeholder="Buscar por patología, vaso, perspectiva..." 
                                       value="${q || ''}">
                                <button class="btn btn-outline-primary" type="submit">
                                    <i class="fas fa-search"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Filtro por rango de edad -->
                        <div class="mb-3">
                            <label class="form-label">Rango de Edad</label>
                            <div class="row">
                                <div class="col">
                                    <input type="number" 
                                           class="form-control" 
                                           name="edad_min" 
                                           placeholder="Mín" 
                                           value="${edad_min || ''}"
                                           min="0" max="120">
                                </div>
                                <div class="col">
                                    <input type="number" 
                                           class="form-control" 
                                           name="edad_max" 
                                           placeholder="Máx" 
                                           value="${edad_max || ''}"
                                           min="0" max="120">
                                </div>
                            </div>
                        </div>

                        <!-- Filtro por género -->
                        <div class="mb-3">
                            <label class="form-label">Género</label>
                            <select class="form-select" name="genero">
                                <option value="TODOS" ${(!genero || genero === 'TODOS') ? 'selected' : ''}>Todos</option>
                                <option value="MASCULINO" ${genero === 'MASCULINO' ? 'selected' : ''}>Masculino</option>
                                <option value="FEMENINO" ${genero === 'FEMENINO' ? 'selected' : ''}>Femenino</option>
                                <option value="OTRO" ${genero === 'OTRO' ? 'selected' : ''}>Otro</option>
                            </select>
                        </div>

                        <!-- Filtro por perspectiva -->
                        <div class="mb-3">
                            <label class="form-label">Perspectiva</label>
                            <select class="form-select" name="perspectiva">
                                <option value="TODOS" ${(!perspectiva || perspectiva === 'TODOS') ? 'selected' : ''}>Todas</option>
                                <option value="TRANSTEMPORAL" ${perspectiva === 'TRANSTEMPORAL' ? 'selected' : ''}>Transtemporal</option>
                                <option value="TRANSORBITARIO" ${perspectiva === 'TRANSORBITARIO' ? 'selected' : ''}>Transorbitario</option>
                                <option value="TRANSFORAMINAL" ${perspectiva === 'TRANSFORAMINAL' ? 'selected' : ''}>Transforaminal</option>
                            </select>
                        </div>

                        <!-- Filtro por vaso evaluado -->
                        <div class="mb-3">
                            <label class="form-label">Vaso Evaluado</label>
                            <select class="form-select" name="vaso_evaluado">
                                <option value="TODOS" ${(!vaso_evaluado || vaso_evaluado === 'TODOS') ? 'selected' : ''}>Todos</option>
                                <option value="ACM" ${vaso_evaluado === 'ACM' ? 'selected' : ''}>ACM</option>
                                <option value="ACA" ${vaso_evaluado === 'ACA' ? 'selected' : ''}>ACA</option>
                                <option value="ACP" ${vaso_evaluado === 'ACP' ? 'selected' : ''}>ACP</option>
                                <option value="BASILAR" ${vaso_evaluado === 'BASILAR' ? 'selected' : ''}>Basilar</option>
                                <option value="VERTEBRAL" ${vaso_evaluado === 'VERTEBRAL' ? 'selected' : ''}>Vertebral</option>
                                <option value="OTRO" ${vaso_evaluado === 'OTRO' ? 'selected' : ''}>Otro</option>
                            </select>
                        </div>

                        <!-- Filtro por lado -->
                        <div class="mb-3">
                            <label class="form-label">Lado</label>
                            <select class="form-select" name="lado">
                                <option value="TODOS" ${(!lado || lado === 'TODOS') ? 'selected' : ''}>Todos</option>
                                <option value="DERECHO" ${lado === 'DERECHO' ? 'selected' : ''}>Derecho</option>
                                <option value="IZQUIERDO" ${lado === 'IZQUIERDO' ? 'selected' : ''}>Izquierdo</option>
                                <option value="BILATERAL" ${lado === 'BILATERAL' ? 'selected' : ''}>Bilateral</option>
                            </select>
                        </div>

                        <!-- Botones de acción -->
                        <div class="d-grid gap-2">
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-filter"></i> Aplicar Filtros
                            </button>
                            <a href="/" class="btn btn-secondary">
                                <i class="fas fa-times"></i> Limpiar Filtros
                            </a>
                        </div>

                    </form>
                </div>
            </div>
        `;

        // Construir la tabla de estudios
        let estudiosHtml = `
            <div class="row">
                <!-- Columna de filtros -->
                <div class="col-md-3">
                    ${filtrosHtml}
                </div>

                <!-- Columna de resultados -->
                <div class="col-md-9">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h3>Estudios Registrados ${estudios.length > 0 ? `(${estudios.length})` : ''}</h3>
                        ${['ADMIN','INVESTIGADOR'].includes(req.session.rol) ? 
                            '<a href="/subir-imagen" class="btn btn-primary"><i class="fas fa-upload"></i> Subir Nuevo Estudio</a>' : 
                            ''}
                    </div>
        `;

        if (estudios.length > 0) {
            estudiosHtml += `
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Imagen</th>
                                <th>Fecha</th>
                                <th>Edad/Género</th>
                                <th>Perspectiva</th>
                                <th>Patología</th>
                                <th>Severidad</th>
                                <th>Vaso/Lado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            estudios.forEach(e => {
                const thumbnailHtml = e.archivo_ruta 
                    ? `<img src="${e.archivo_ruta}" style="height: 50px; width: auto; object-fit: cover; border-radius: 4px;" alt="Miniatura" class="img-thumbnail">` 
                    : '<span class="text-muted">N/A</span>';
                    
                estudiosHtml += `
                    <tr>
                        <td>${e.id_estudio}</td>
                        <td>${thumbnailHtml}</td>
                        <td>${new Date(e.fecha_estudio).toLocaleDateString()}</td>
                        <td>${e.edad} / ${e.genero}</td>
                        <td><span class="badge bg-info">${e.perspectiva}</span></td>
                        <td>${e.nombre_patologia || '<span class="text-muted">N/A</span>'}</td>
                        <td>
                            ${e.grado_severidad ? 
                                `<span class="badge ${e.grado_severidad === 'LEVE' ? 'bg-success' : 
                                                  e.grado_severidad === 'MODERADO' ? 'bg-warning' : 
                                                  e.grado_severidad === 'SEVERO' ? 'bg-danger' : 
                                                  'bg-dark'}">${e.grado_severidad}</span>` : 
                                '<span class="text-muted">N/A</span>'}
                        </td>
                        <td>${e.vaso_evaluado} <br><small class="text-muted">(${e.lado})</small></td>
                        <td>
                            <a href="/imagen/${e.id_estudio}" class="btn btn-sm btn-info" title="Ver detalles">
                                <i class="fas fa-eye"></i>
                            </a>
                        </td>
                    </tr>
                `;
            });

            estudiosHtml += `
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            estudiosHtml += `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> 
                    ${Object.keys(req.query).length > 0 ? 
                        'No se encontraron estudios con los filtros aplicados.' : 
                        'No hay estudios registrados en el sistema.'}
                </div>
            `;
        }

        estudiosHtml += `
                </div>
            </div>
        `;

        res.send(renderPage('Gestionar Estudios', estudiosHtml));
    } catch (err) {
        console.error('Error al cargar la lista de estudios:', err);
        res.send(renderPage('Error', `<div class="alert alert-danger">Error al cargar datos: ${err.message}</div>`));
    }
});

// Ruta para index.html que redirige a la raíz dinámica
app.get('/index.html', (req, res) => {
    if (req.session.userId) {
        res.redirect('/');
    } else {
        res.redirect('/login');
    }
});

/* =========================
   RUTA DINÁMICA DEL NAVBAR
========================= */
app.get('/navbar', requireLogin, async (req, res) => {
    try {
        let menuItems = '';
        
        // Elementos para TODOS los usuarios logueados
        menuItems += `
            <li class="nav-item">
                <a class="nav-link" href="/">Gestionar Estudios</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="/perfil">Mi Perfil</a>
            </li>
        `;
        
        // Solo ADMIN puede ver gestión de usuarios
        if (req.session.rol === 'ADMIN') {
            menuItems += `
                <li class="nav-item">
                    <a class="nav-link" href="/usuarios">Gestionar Usuarios</a>
                </li>
            `;
        }
        
        // Solo ADMIN e INVESTIGADOR pueden subir estudios
        if (['ADMIN', 'INVESTIGADOR'].includes(req.session.rol)) {
            menuItems += `
                <li class="nav-item">
                    <a class="nav-link" href="/subir-imagen">Subir Estudio</a>
                </li>
            `;
        }
        
        // Elemento para cerrar sesión (todos los usuarios)
        menuItems += `
            <li class="nav-item">
                <a class="nav-link" href="/logout">Cerrar Sesión (${req.session.nombre || 'Usuario'})</a>
            </li>
        `;
        
        // Crear el HTML completo del navbar
        const navbarHtml = `
<nav class="navbar navbar-expand-lg bg-dark navbar-dark">
  <div class="container-fluid">
    <a class="navbar-brand" href="/">Inicio</a>
    
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>
    
    <div class="collapse navbar-collapse" id="navbarNav">
      <ul class="navbar-nav me-auto">
        ${menuItems}
      </ul>
    </div>
  </div>
</nav>`;
        
        res.send(navbarHtml);
    } catch (err) {
        console.error('Error generando navbar:', err);
        res.status(500).send('Error cargando navegación');
    }
});

/* =========================
   ARCHIVOS ESTÁTICOS - DEBE IR DESPUÉS DE LAS RUTAS DINÁMICAS
========================= */
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads/ultrasonidos', express.static(ULTRASONIDOS_SUBDIR));

/* =========================
   AUTENTICACIÓN
========================= */

// GET: Formulario de inicio de sesión
app.get('/login', (req, res) => {
    res.send(renderPage('Iniciar Sesión', `
        <div class="row justify-content-center">
            <div class="col-md-5">
                <div class="card shadow p-4">
                    <h3 class="text-center">Iniciar Sesión</h3>
                    <form method="POST" action="/login">
                        <div class="mb-3">
                            <label class="form-label">Nombre de Usuario</label>
                            <input type="text" name="nombre" class="form-control" required>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Contraseña</label>
                            <input type="password" name="contrasena" class="form-control" required>
                        </div>
                        <button class="btn btn-primary w-100">Ingresar</button>
                        <p class="mt-3 text-center"><a href="/registro">Registrarse</a></p>
                    </form>
                </div>
            </div>
        </div>
    `, false));
});

// POST: Manejo de inicio de sesión
app.post('/login', async (req, res) => {
    const { nombre, contrasena } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM usuarios WHERE nombre = ?', [nombre]);
        if (users.length === 0) {
            return res.send(renderPage('Login Error', `<div class="alert alert-danger">Usuario o contraseña incorrectos.</div>`, false));
        }
        
        const user = users[0];
        const match = await bcrypt.compare(contrasena, user.contrasena);

        if (match) {
            req.session.userId = user.id;
            req.session.rol = user.rol;
            req.session.nombre = user.nombre;
            res.redirect('/');
        } else {
            res.send(renderPage('Login Error', `<div class="alert alert-danger">Usuario o contraseña incorrectos.</div>`, false));
        }
    } catch (err) {
        console.error(err);
        res.status(500).send(renderPage('Error', `<div class="alert alert-danger">Error interno del servidor.</div>`, false));
    }
});

// GET: Cerrar sesión
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error(err);
        res.redirect('/login');
    });
});

// GET: Formulario de registro
app.get('/registro', (req, res) => {
    res.send(renderPage('Registro de Usuario', `
        <div class="row justify-content-center">
            <div class="col-md-5">
                <div class="card shadow p-4">
                    <h3 class="text-center">Registro de Usuario</h3>
                    <form method="POST">
                        <div class="mb-3">
                            <label class="form-label">Nombre de Usuario</label>
                            <input type="text" name="nombre" class="form-control" required>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Email</label>
                            <input type="email" name="email" class="form-control" required>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Contraseña</label>
                            <input type="password" name="contrasena" class="form-control" required>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Código de Registro</label>
                            <input type="text" name="codigo" class="form-control" required>
                        </div>
                        <button class="btn btn-success w-100">Registrar</button>
                        <p class="mt-3 text-center"><a href="/login">Ya tengo cuenta</a></p>
                    </form>
                </div>
            </div>
        </div>
    `, false));
});

// POST: Manejo de registro
app.post('/registro', async (req, res) => {
    const { nombre, email, contrasena, codigo } = req.body;
    try {
        const [codes] = await pool.query('SELECT tipo_usuario FROM codigos_usuarios WHERE codigo = ?', [codigo]);
        if (codes.length === 0) {
            return res.send(renderPage('Error', `<div class="alert alert-danger">Código de registro inválido.</div>`, false));
        }
        
        const rol = codes[0].tipo_usuario;
        const hashedPassword = await bcrypt.hash(contrasena, 10);
        
        await pool.query(
            'INSERT INTO usuarios (nombre, email, contrasena, rol) VALUES (?, ?, ?, ?)',
            [nombre, email, hashedPassword, rol]
        );

        res.redirect('/login');
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.send(renderPage('Error', `<div class="alert alert-danger">El nombre de usuario o email ya existe.</div>`, false));
        }
        console.error(err);
        res.status(500).send(renderPage('Error', `<div class="alert alert-danger">Error interno del servidor durante el registro.</div>`, false));
    }
});

/* =========================
   RUTAS DE GESTIÓN DE USUARIOS (SOLO ADMIN)
========================= */

// GET: Listar Usuarios
app.get('/usuarios', requireLogin, requireRole('ADMIN'), async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, nombre, email, rol FROM usuarios ORDER BY rol, nombre');
        
        let usersHtml = `
            <h3>Gestionar Usuarios (Solo Admin)</h3>
            <table class="table table-striped table-hover">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Email</th>
                        <th>Rol</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (users.length > 0) {
            users.forEach(u => {
                usersHtml += `
                    <tr>
                        <td>${u.id}</td>
                        <td>${u.nombre}</td>
                        <td>${u.email}</td>
                        <td>${u.rol}</td>
                        <td>
                            <a href="/usuarios/editar/${u.id}" class="btn btn-sm btn-warning me-2">Editar</a>
                            <a href="/usuarios/eliminar/${u.id}" class="btn btn-sm btn-danger">Eliminar</a>
                        </td>
                    </tr>
                `;
            });
        } else {
             usersHtml += `<tr><td colspan="5" class="text-center">No hay usuarios registrados.</td></tr>`;
        }

        usersHtml += `
                </tbody>
            </table>
        `;

        res.send(renderPage('Gestionar Usuarios', usersHtml));
    } catch (err) {
        console.error('Error al cargar la lista de usuarios:', err);
        res.status(500).send(renderPage('Error', `<div class="alert alert-danger">Error al cargar datos de usuarios.</div>`));
    }
});

// GET: Formulario Editar Usuario
app.get('/usuarios/editar/:id', requireLogin, requireRole('ADMIN'), async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, nombre, email, rol FROM usuarios WHERE id = ?', [req.params.id]);
        if (users.length === 0) {
            return res.send(renderPage('Error', `<div class="alert alert-warning">Usuario no encontrado.</div>`));
        }
        const u = users[0];
        const roles = ['ADMIN', 'INVESTIGADOR', 'ASISTENTE']; 
        const roleOptions = roles.map(r => `<option value="${r}" ${r === u.rol ? 'selected' : ''}>${r}</option>`).join('');

        res.send(renderPage(`Editar Usuario ${u.nombre}`, `
            <div class="row justify-content-center">
                <div class="col-md-6">
                    <div class="card shadow p-4">
                        <h3 class="card-title">Editar Usuario #${u.id}</h3>
                        <form method="POST">
                            <div class="mb-3">
                                <label class="form-label">Nombre de Usuario</label>
                                <input type="text" name="nombre" class="form-control" value="${u.nombre}" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Email</label>
                                <input type="email" name="email" class="form-control" value="${u.email}" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Rol</label>
                                <select name="rol" class="form-select">
                                    ${roleOptions}
                                </select>
                            </div>
                            <button class="btn btn-warning w-100">Actualizar Usuario</button>
                            <a href="/usuarios" class="btn btn-secondary mt-2 w-100">Cancelar</a>
                        </form>
                    </div>
                </div>
            </div>
        `));
    } catch (err) {
        console.error(err);
        res.status(500).send(renderPage('Error', `<div class="alert alert-danger">Error al cargar el usuario.</div>`));
    }
});

// POST: Actualizar Usuario
app.post('/usuarios/editar/:id', requireLogin, requireRole('ADMIN'), async (req, res) => {
    const { nombre, email, rol } = req.body;
    try {
        await pool.query(
            'UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?',
            [nombre, email, rol, req.params.id]
        );
        if (req.params.id == req.session.userId) {
            req.session.nombre = nombre;
            req.session.rol = rol;
        }
        res.send(renderPage('Éxito', `<div class="alert alert-success">Usuario actualizado con éxito. <a href="/usuarios">Volver a la lista</a></div>`));
    } catch (err) {
        console.error(err);
        let errorMessage = 'Error al actualizar el usuario.';
        if (err.code === 'ER_DUP_ENTRY') {
            errorMessage = 'El nombre de usuario o email ya están en uso.';
        }
        res.status(500).send(renderPage('Error', `<div class="alert alert-danger">${errorMessage}</div>`));
    }
});

// GET: Confirmación Eliminar Usuario
app.get('/usuarios/eliminar/:id', requireLogin, requireRole('ADMIN'), async (req,res)=>{
    if (req.params.id == req.session.userId) {
        return res.send(renderPage('Error', `<div class="alert alert-danger">No puedes eliminar tu propia cuenta desde este panel.</div>`));
    }
    res.send(renderPage('Confirmar Eliminación', 
        `<div class="alert alert-danger">
            ¿Está seguro que desea eliminar al usuario #${req.params.id}? 
            <form method="POST" action="/usuarios/eliminar/${req.params.id}">
                <button class="btn btn-danger mt-3">Confirmar Eliminación</button>
                <a href="/usuarios" class="btn btn-secondary mt-3">Cancelar</a>
            </form>
        </div>`
    ));
});

// POST: Eliminar Usuario
app.post('/usuarios/eliminar/:id', requireLogin, requireRole('ADMIN'), async (req, res) => {
    if (req.params.id == req.session.userId) {
        return res.send(renderPage('Error', `<div class="alert alert-danger">Error: No se puede eliminar el usuario logueado.</div>`));
    }
    try {
        const [result] = await pool.query('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
        
        if (result.affectedRows > 0) {
            res.send(renderPage('Éxito', `<div class="alert alert-success">Usuario #${req.params.id} eliminado con éxito. <a href="/usuarios">Volver a la lista</a></div>`));
        } else {
             res.send(renderPage('Error', `<div class="alert alert-warning">Usuario no encontrado o ya eliminado.</div>`));
        }
    } catch (err) {
        console.error(err);
        res.status(500).send(renderPage('Error', `<div class="alert alert-danger">Error al eliminar el usuario.</div>`));
    }
});

/* =========================
   RUTAS DE PERFIL DE USUARIO (TODOS)
========================= */

// GET: Mostrar Perfil
app.get('/perfil', requireLogin, async (req, res) => {
    try {
        const [user] = await pool.query('SELECT nombre, email, rol FROM usuarios WHERE id = ?', [req.session.userId]);
        if (user.length === 0) {
            req.session.destroy();
            return res.redirect('/login');
        }

        const u = user[0];

        res.send(renderPage('Mi Perfil', `
            <div class="row justify-content-center">
                <div class="col-md-6">
                    <div class="card shadow p-4">
                        <h3 class="card-title">Mi Perfil (${u.rol})</h3>
                        <form method="POST">
                            <div class="mb-3">
                                <label class="form-label">Nombre de Usuario</label>
                                <input type="text" name="nombre" class="form-control" value="${u.nombre}" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Email</label>
                                <input type="email" name="email" class="form-control" value="${u.email}" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Nueva Contraseña (Dejar vacío para no cambiar)</label>
                                <input type="password" name="contrasena" class="form-control">
                            </div>
                            <button class="btn btn-primary w-100">Actualizar Perfil</button>
                        </form>
                    </div>
                </div>
            </div>
        `));
    } catch (err) {
        console.error(err);
        res.status(500).send(renderPage('Error', `<div class="alert alert-danger">Error al cargar el perfil.</div>`));
    }
});

// POST: Actualizar Perfil
app.post('/perfil', requireLogin, async (req, res) => {
    const { nombre, email, contrasena } = req.body;
    let updateQuery = 'UPDATE usuarios SET nombre = ?, email = ?';
    let updateParams = [nombre, email];

    try {
        if (contrasena) {
            const hashedPassword = await bcrypt.hash(contrasena, 10);
            updateQuery += ', contrasena = ?';
            updateParams.push(hashedPassword);
        }

        updateQuery += ' WHERE id = ?';
        updateParams.push(req.session.userId);

        await pool.query(updateQuery, updateParams);
        
        req.session.nombre = nombre;

        res.send(renderPage('Éxito', `<div class="alert alert-success">Perfil actualizado con éxito.</div>`));

    } catch (err) {
        console.error(err);
        let errorMessage = 'Error al actualizar el perfil.';
        if (err.code === 'ER_DUP_ENTRY') {
            errorMessage = 'El nombre de usuario o email ya están en uso.';
        }
        res.status(500).send(renderPage('Error', `<div class="alert alert-danger">${errorMessage}</div>`));
    }
});

/* =========================
   RUTAS DE ESTUDIOS (Subida)
========================= */

// GET: Ruta para subir imágenes (FORMULARIO)
app.get('/subir-imagen',
  requireLogin,
  requireRole('ADMIN','INVESTIGADOR'),
  (req,res)=>{

    res.send(renderPage(
      'Subir estudio',
      `
      <div class="card shadow">
        <div class="card-body">
          <h3 class="card-title mb-3">Nuevo estudio Doppler Transcraneal</h3>

          <form method="POST" action="/subir-imagen" enctype="multipart/form-data">

            <div class="mb-3">
              <label class="form-label">Archivo de imagen / video</label>
              <input type="file" name="imagen_estudio" class="form-control" required>
            </div>
            
            <div class="row">
              <div class="col-md-4 mb-3">
                <label class="form-label">Edad</label>
                <input type="number" name="edad" class="form-control" required>
              </div>

              <div class="col-md-4 mb-3">
                <label class="form-label">Género</label>
                <select name="genero" class="form-select">
                  <option>MASCULINO</option>
                  <option>FEMENINO</option>
                  <option>OTRO</option>
                </select>
              </div>

              <div class="col-md-4 mb-3">
                <label class="form-label">Perspectiva</label>
                <select name="perspectiva" class="form-select">
                  <option>TRANSTEMPORAL</option>
                  <option>TRANSORBITARIO</option>
                  <option>TRANSFORAMINAL</option>
                </select>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Vaso evaluado</label>
                <select name="vaso_evaluado" class="form-select">
                  <option>ACM</option>
                  <option>ACA</option>
                  <option>ACP</option>
                  <option>BASILAR</option>
                  <option>VERTEBRAL</option>
                  <option>OTRO</option>
                </select>
              </div>

              <div class="col-md-6 mb-3">
                <label class="form-label">Lado</label>
                <select name="lado" class="form-select">
                  <option>DERECHO</option>
                  <option>IZQUIERDO</option>
                  <option>BILATERAL</option>
                </select>
              </div>
            </div>

            <hr>

            <h5>Hallazgos clínicos</h5>

            <div class="mb-3 position-relative">
              <label class="form-label">Patología</label>
              <input type="text" name="nombre_patologia_display" id="nombre_patologia_input" class="form-control" required placeholder="Escriba el nombre de la patología">
              <input type="hidden" name="id_patologia" id="id_patologia_hidden" value="">
              <div id="patologia_suggestions" class="list-group position-absolute w-100 shadow" style="z-index: 1000;">
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label">Grado de severidad</label>
              <select name="grado_severidad" class="form-select" required>
                <option>LEVE</option>
                <option>MODERADO</option>
                <option>SEVERO</option>
                <option>CRITICO</option>
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label">Comentarios / Nota clínica</label>
              <textarea name="nota_especifica" class="form-control" rows="3"></textarea>
            </div>
            
            <button class="btn btn-primary">Guardar estudio</button>
            <a href="/" class="btn btn-secondary ms-2">Cancelar</a>

          </form>
        </div>
      </div>
      
      <script>
          const patologiaInput = document.getElementById('nombre_patologia_input');
          const patologiaHidden = document.getElementById('id_patologia_hidden');
          const suggestionsContainer = document.getElementById('patologia_suggestions');
          let timeout = null;

          patologiaInput.addEventListener('input', function() {
              const query = this.value.trim();

              patologiaHidden.value = ''; 

              clearTimeout(timeout);

              if (query.length < 3) {
                  suggestionsContainer.innerHTML = '';
                  return;
              }

              timeout = setTimeout(() => {
                  fetch(\`/api/patologias?q=\${encodeURIComponent(query)}\`)
                      .then(response => response.json())
                      .then(data => {
                          suggestionsContainer.innerHTML = '';
                          
                          if (data.length > 0) {
                              data.forEach(patologia => {
                                  const item = document.createElement('button');
                                  item.className = 'list-group-item list-group-item-action';
                                  item.type = 'button';
                                  item.textContent = patologia.nombre_patologia;
                                  item.setAttribute('data-id', patologia.id_patologia);
                                  
                                  item.addEventListener('click', function() {
                                      patologiaInput.value = this.textContent;
                                      patologiaHidden.value = this.getAttribute('data-id');
                                      suggestionsContainer.innerHTML = '';
                                  });

                                  suggestionsContainer.appendChild(item);
                              });
                          }
                      })
                      .catch(error => {
                          console.error('Error fetching patologias:', error);
                          suggestionsContainer.innerHTML = '';
                      });
              }, 300);
          });
          
          document.addEventListener('click', (event) => {
              if (!patologiaInput.contains(event.target) && !suggestionsContainer.contains(event.target)) {
                  suggestionsContainer.innerHTML = '';
              }
          });
      </script>
      `
    ));
});

// POST: Ruta para manejar la subida de archivos y datos
app.post('/subir-imagen',
  requireLogin,
  requireRole('ADMIN','INVESTIGADOR'),
  upload.single('imagen_estudio'),
  async (req,res)=>{

    if (!req.file) {
      return res.send(renderPage(
        'Error',
        `<div class="alert alert-danger">No se adjuntó ningún archivo.</div>`
      ));
    }

    const archivo_ruta = `/uploads/ultrasonidos/${path.basename(req.file.path)}`; 

    const {
      edad, genero,
      perspectiva, vaso_evaluado, lado,
      
      id_patologia, 
      nombre_patologia_display, 
      
      grado_severidad, nota_especifica
    } = req.body;

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();
      
      let id_paciente;
      
      const [pac] = await conn.query(
          'INSERT INTO pacientes (edad, genero) VALUES (?,?)', 
          [edad, genero]
      );
      id_paciente = pac.insertId;
      
      let final_id_patologia = id_patologia; 

      if (!final_id_patologia) {
          const nombre_patologia = nombre_patologia_display; 
          
          if (!nombre_patologia || nombre_patologia.trim() === '') {
              throw new Error("El nombre de la patología no puede estar vacío.");
          }
          
          const normalized_patologia = nombre_patologia.toUpperCase().trim();
          
          const [existingPat] = await conn.query('SELECT id_patologia FROM patologias WHERE nombre_patologia = ?', [normalized_patologia]);
          
          if (existingPat.length > 0) {
            final_id_patologia = existingPat[0].id_patologia;
          } else {
            const [newPat] = await conn.query(
              'INSERT INTO patologias (nombre_patologia) VALUES (?)',
              [normalized_patologia]
            );
            final_id_patologia = newPat.insertId;
          }
      }

      const [est] = await conn.query(`
        INSERT INTO estudios
        (id_paciente, archivo_ruta, perspectiva, vaso_evaluado, lado) 
        VALUES (?, ?, ?, ?, ?)
      `, [
        id_paciente,
        archivo_ruta,
        perspectiva,
        vaso_evaluado,
        lado
      ]);
      const id_estudio = est.insertId;

      await conn.query(`
        INSERT INTO imagenes_estudio (id_estudio, ruta_archivo)
        VALUES (?, ?)
      `, [id_estudio, archivo_ruta]);

      await conn.query(`
        INSERT INTO estudios_patologias
        (id_estudio, id_patologia, grado_severidad, nota_especifica)
        VALUES (?,?,?,?)
      `, [
        id_estudio,
        final_id_patologia,
        grado_severidad,
        nota_especifica
      ]);

      await conn.commit();
      conn.release();

      res.redirect(`/imagen/${id_estudio}`); 

    } catch (err) {
      if (conn) {
        await conn.rollback();
        conn.release();
      }
      
      if (req.file) {
        fs.unlink(req.file.path, (unlinkErr) => { 
          if (unlinkErr) console.error('Error al eliminar archivo fallido:', unlinkErr);
        });
      }

      console.error(err);

      res.send(renderPage(
        'Error',
        `<div class="alert alert-danger">
          Error al guardar el estudio<br>
          <small>${err.message}</small>
        </div>`
      ));
    }
});

// API: Ruta para autocompletado de patologías
app.get('/api/patologias', async (req, res) => {
    const q = req.query.q;
    if (!q) return res.json([]);
    try {
        const [rows] = await pool.query(
            'SELECT id_patologia, nombre_patologia FROM patologias WHERE nombre_patologia LIKE ? LIMIT 10',
            [`%${q}%`]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

/* =========================
   DETALLE IMAGEN (VISUALIZACIÓN)
========================= */
app.get('/imagen/:id', requireLogin, async (req, res) => {
    try {
        const [r] = await pool.query(`
            SELECT 
                e.*, 
                p.edad, p.genero, p.notas_generales,
                pat.nombre_patologia, ep.grado_severidad, ep.nota_especifica
            FROM estudios e 
            JOIN pacientes p ON e.id_paciente = p.id_paciente
            LEFT JOIN estudios_patologias ep ON e.id_estudio = ep.id_estudio
            LEFT JOIN patologias pat ON ep.id_patologia = pat.id_patologia
            WHERE e.id_estudio = ?
        `, [req.params.id]);

        if (r.length === 0) return res.send('Estudio no encontrado');

        const estudio = r[0];
        const editar = ['ADMIN','INVESTIGADOR'].includes(req.session.rol);
        const eliminar = req.session.rol === 'ADMIN';

        res.send(`
          <html><head>
          <link rel="stylesheet" href="/bootstrap/bootstrap.css">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
          </head><body>
          <div id="navbar"></div>
          <div class="container mt-4">
            
            <div class="card shadow">
                <div class="card-header bg-dark text-white">
                    <h5>Estudio Doppler #${estudio.id_estudio}</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-7 mb-4">
                            <img src="${estudio.archivo_ruta}" class="img-fluid rounded shadow" style="max-height: 500px; width: auto;"> 
                            <small class="text-muted mt-2 d-block">Fecha de registro: ${new Date(estudio.fecha_estudio).toLocaleDateString()}</small>
                        </div>
                        <div class="col-md-5">
                            <h6>Datos Básicos</h6>
                            <ul class="list-group list-group-flush mb-4">
                                <li class="list-group-item"><strong>ID Paciente:</strong> ${estudio.id_paciente}</li>
                                <li class="list-group-item"><strong>Edad:</strong> ${estudio.edad}</li>
                                <li class="list-group-item"><strong>Género:</strong> ${estudio.genero}</li>
                            </ul>
                            
                            <h6>Parámetros del Estudio</h6>
                            <ul class="list-group list-group-flush mb-4">
                                <li class="list-group-item"><strong>Perspectiva:</strong> ${estudio.perspectiva}</li>
                                <li class="list-group-item"><strong>Vaso Evaluado:</strong> ${estudio.vaso_evaluado}</li>
                                <li class="list-group-item"><strong>Lado:</strong> ${estudio.lado}</li>
                            </ul>
                            
                            <h6>Hallazgos</h6>
                            <ul class="list-group list-group-flush mb-4">
                                <li class="list-group-item"><strong>Patología:</strong> ${estudio.nombre_patologia || 'N/A'}</li>
                                <li class="list-group-item"><strong>Grado de Severidad:</strong> ${estudio.grado_severidad || 'N/A'}</li>
                                <li class="list-group-item"><strong>Nota Clínica:</strong> ${estudio.nota_especifica || 'Sin nota'}</li>
                            </ul>
                            
                            <h6 class="mt-4">Notas Generales del Paciente (No editable aquí)</h6>
                            <p class="card-text border p-2 bg-light rounded">${estudio.notas_generales || 'N/A'}</p>
                            
                        </div>
                    </div>
                </div>
                <div class="card-footer d-flex justify-content-end">
                    ${editar ? `<a href="/imagen/${estudio.id_estudio}/editar" class="btn btn-warning me-2">Editar Estudio</a>` : ``}
                    ${eliminar ? `<a href="/imagen/${estudio.id_estudio}/eliminar" class="btn btn-danger">Eliminar Estudio</a>` : ``}
                    <a href="/" class="btn btn-secondary ms-2">Volver a Estudios</a>
                </div>
            </div>
          </div>
          <script src="/bootstrap/bootstrap.bundle.min.js"></script>
          <script>
            fetch('/navbar')
                .then(r => {
                    if (r.ok) return r.text();
                    throw new Error('Error cargando navbar');
                })
                .then(d => document.getElementById('navbar').innerHTML = d)
                .catch(err => console.error('Error:', err));
          </script>
          </body></html>
        `);
    } catch (err) {
        console.error('Error al cargar detalle:', err);
        res.status(500).send('Error interno.');
    }
});

// GET: Ruta para editar imagen (FORMULARIO)
app.get('/imagen/:id/editar', requireLogin, requireRole('ADMIN','INVESTIGADOR'), async (req,res)=>{
    const [e] = await pool.query(
        'SELECT perspectiva, vaso_evaluado, lado FROM estudios WHERE id_estudio=?',
        [req.params.id]
    );
    if (e.length === 0) return res.send(renderPage('Error', '<div class="alert alert-warning">Estudio no encontrado.</div>'));
    const estudio = e[0];

    const selectOption = (value, current) => value === current ? 'selected' : '';

    res.send(renderPage(
        'Editar estudio',
        `
        <div class="card shadow">
            <div class="card-body">
                <h3>Editar estudio #${req.params.id}</h3>

                <form method="POST">
                    <label class="form-label">Perspectiva</label>
                    <select name="perspectiva" class="form-select mb-3">
                        <option ${selectOption('TRANSTEMPORAL', estudio.perspectiva)}>TRANSTEMPORAL</option>
                        <option ${selectOption('TRANSORBITARIO', estudio.perspectiva)}>TRANSORBITARIO</option>
                        <option ${selectOption('TRANSFORAMINAL', estudio.perspectiva)}>TRANSFORAMINAL</option>
                        <option ${selectOption('OTRO', estudio.perspectiva)}>OTRO</option>
                    </select>

                    <label class="form-label">Vaso evaluado</label>
                    <select name="vaso_evaluado" class="form-select mb-3">
                        <option ${selectOption('ACM', estudio.vaso_evaluado)}>ACM</option>
                        <option ${selectOption('ACA', estudio.vaso_evaluado)}>ACA</option>
                        <option ${selectOption('ACP', estudio.vaso_evaluado)}>ACP</option>
                        <option ${selectOption('BASILAR', estudio.vaso_evaluado)}>BASILAR</option>
                        <option ${selectOption('VERTEBRAL', estudio.vaso_evaluado)}>VERTEBRAL</option>
                        <option ${selectOption('OTRO', estudio.vaso_evaluado)}>OTRO</option>
                    </select>

                    <label class="form-label">Lado</label>
                    <select name="lado" class="form-select mb-3">
                        <option ${selectOption('DERECHO', estudio.lado)}>DERECHO</option>
                        <option ${selectOption('IZQUIERDO', estudio.lado)}>IZQUIERDO</option>
                        <option ${selectOption('BILATERAL', estudio.lado)}>BILATERAL</option>
                    </select>

                    <button class="btn btn-warning">Guardar cambios</button>
                    <a href="/imagen/${req.params.id}" class="btn btn-secondary ms-2">Cancelar</a>
                </form>
            </div>
        </div>
        `
    ));
});

// POST: Ruta para editar imagen (UPDATE)
app.post('/imagen/:id/editar', requireLogin, requireRole('ADMIN','INVESTIGADOR'), async (req,res)=>{
    const { perspectiva, vaso_evaluado, lado } = req.body; 

    await pool.query(`
        UPDATE estudios
        SET perspectiva=?, vaso_evaluado=?, lado=?
        WHERE id_estudio=?
    `, [perspectiva, vaso_evaluado, lado, req.params.id]);

    res.redirect(`/imagen/${req.params.id}`);
});

/* =========================
   ELIMINAR IMAGEN
========================= */

// GET: Confirmación de eliminación
app.get('/imagen/:id/eliminar', requireLogin, requireRole('ADMIN'), async (req,res)=>{
    res.send(renderPage('Confirmar Eliminación', 
        `<div class="alert alert-danger">
            ¿Está seguro que desea eliminar el estudio #${req.params.id}? 
            <form method="POST">
                <button class="btn btn-danger mt-3">Confirmar Eliminación</button>
                <a href="/imagen/${req.params.id}" class="btn btn-secondary mt-3">Cancelar</a>
            </form>
        </div>`
    ));
});

// POST: Lógica de eliminación
app.post('/imagen/:id/eliminar', requireLogin, requireRole('ADMIN'), async (req,res)=>{
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // 1. Obtener la ruta del archivo
        const [rows] = await pool.query('SELECT archivo_ruta FROM estudios WHERE id_estudio=?', [req.params.id]);
        
        if (rows.length > 0) {
            const archivo_ruta_fisica = path.join(ULTRASONIDOS_SUBDIR, path.basename(rows[0].archivo_ruta));
            
            // 2. Eliminar el registro del estudio 
            await conn.query('DELETE FROM estudios WHERE id_estudio=?',[req.params.id]);
            
            // 3. Eliminar el archivo físico (si existe)
            fs.unlink(archivo_ruta_fisica, (unlinkErr) => {
                if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                    console.error('Advertencia: No se pudo eliminar el archivo físico:', unlinkErr);
                }
            });
        }
        
        await conn.commit();
        conn.release();
        res.redirect('/');
    } catch (err) {
        if (conn) {
            await conn.rollback();
            conn.release();
        }
        console.error('Error al eliminar:', err);
        res.status(500).send('Error al eliminar estudio.');
    }
});

/* =========================
   INICIO DEL SERVIDOR
========================= */
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});


