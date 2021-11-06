require("dotenv").config();
require("./config/database").connect();

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("./model/user");
const Curso = require("./model/cursosAsignados");
const Cursos = require("./model/cursos");
const auth = require("./middleware/auth");

const app = express();
app.use(express.json({ limit: "50mb" }));

var cors = require('cors');
app.options('*', cors());
app.use(cors());

const fileUpload = require('express-fileupload');
app.use(fileUpload({
    createParentPath: true
}));

//#region Bot Telegram
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
    ctx.reply('Hola Bienvenido a Asistente BOT ' + ctx.from.first_name + ' ¿Qué deseas hacer?');
    ctx.reply('/VerCursosAsignados');
    ctx.reply('/CursosDisponibles');
});

bot.command(['VerCursosAsignados'], (ctx) => ctx.reply('Escribe tu numero de carné'));
bot.command(['CursosDisponibles'], (ctx) => {
    cursosArray = [];
    ctx.reply('Los cursos disponibles son: ');

    try {
        Cursos.find({}, async function(err, cursos) {
            cursos.forEach(async function(item) {
                cursosArray.push(item);
            });

            if (cursosArray.length === 0) {
                ctx.reply('Lo siento, no hay cursos disponibles... :(');
            } else {
                cursosArray.forEach(curso => {
                    ctx.reply(curso.nombre_curso);
                });
            }
        });

    } catch (error) {
        console.log(`Ocurrio un error en la busqueda ${error}`)
    }
});
bot.on('text', (ctx) => {
    var id_estudiante = ctx.message.text;
    cursosList = [];
    ctx.reply('Tus cursos asignados son: ');

    try {
        Curso.find({ id_estudiante }, async function(err, cursos) {
            cursos.forEach(async function(item) {
                cursosList.push(item);
            });

            if (cursosList.length === 0) {
                ctx.reply('Lo siento, no tienes cursos asignados... :(');
            } else {
                cursosList.forEach(curso => {
                    ctx.reply(curso.curso_asignado);
                });
            }
        });

    } catch (error) {
        console.log(`Ocurrio un error en la busqueda ${error}`)
    }
});

bot.hears(['hola', 'Hola', "HOLA"], (ctx) => ctx.reply('Hey hola, mucho gusto!!!'));
bot.on('sticker', (ctx) => ctx.reply('👍'));
bot.launch();

console.log("Bot de Telegram Actualizado");
//#endregion

//#region Login
class UsuarioInfo {
    constructor() {}

    set Nombres(Nombres) {
        this._Nombres = Nombres;
    }

    set Apellidos(Apellidos) {
        this._Apellidos = Apellidos;
    }

    set Email(Email) {
        this._Email = Email;
    }

    set ID_Estudiante(ID_Estudiante) {
        this._ID_Estudiante = ID_Estudiante;
    }

    set Ultima_conexion(Ultima_conexion) {
        this._Ultima_conexion = Ultima_conexion;
    }

    set Disponibilidad(Disponibilidad) {
        this._Disponibilidad = Disponibilidad;
    }

    get Nombre() {
        return this._Nombre;
    }

    get Apellidos() {
        return this._Apellidos;
    }

    get Email() {
        return this.Email;
    }

    get ID_Estudiante() {
        return this.ID_Estudiante;
    }

    get Ultima_conexion() {
        return this.Ultima_conexion;
    }

    get Disponibilidad() {
        return this._Disponibilidad;
    }
}
var usuariosList = [];

app.post("/registro", async(req, res) => {
    try {
        const { id_estudiante, nombre, apellido, email, password, disponibilidad } = req.body;

        if (!(email && password && nombre && apellido)) {
            res.status(400).send("Todos los campos son requeridos");
        }

        const oldUser = await User.findOne({ email });

        if (oldUser) {
            return res.status(409).send("El usuario ya existe, intenta con otro");
        }

        encryptedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            id_estudiante: id_estudiante,
            nombre: nombre,
            apellido: apellido,
            email: email.toLowerCase(),
            password: encryptedPassword,
            disponibilidad: disponibilidad
        });

        const token = jwt.sign({ user_id: user._id, email },
            process.env.TOKEN_KEY, {
                expiresIn: process.env.TOKEN_TIME,
            }
        );
        user.token = token;

        res.status(201).json(user);
    } catch (err) {
        console.log(err);
    }
});

app.post("/login", async(req, res) => {
    try {
        const { email, password } = req.body;

        if (!(email && password)) {
            res.status(400).send("todos los campos son requeridos");
        }

        const user = await User.findOne({ email });

        if (user && (await bcrypt.compare(password, user.password))) {
            const token = jwt.sign({ user_id: user._id, email },
                process.env.TOKEN_KEY, {
                    expiresIn: process.env.TOKEN_TIME
                }
            );

            const filter = { email: email.toLowerCase() };
            const update = { ultima_conexion: new Date() };
            const userUpdate = await User.findOneAndUpdate(filter, update, {
                new: true
            });

            userUpdate.token = token;
            res.status(200).json(userUpdate);
            return;
        }

        res.status(400).send("Credenciales Incorrectas");

    } catch (error) {
        console.log(`Ocurrio un error en el login ${error}`)
    }
});
//#endregion

//#region Cargar Informacion
class CursoInfo {
    constructor() {}

    set ID_estudiante(ID_estudiante) {
        this._ID_estudiante = ID_estudiante;
    }

    get ID_estudiante() {
        return this._ID_estudiante;
    }

    set Curso_asignado(Curso_asignado) {
        this.Curso_asignado = Curso_asignado;
    }

    get Curso_asignado() {
        return this.Curso_asignado;
    }

    set Descripcion(Descripcion) {
        this._Descripcion = Descripcion;
    }

    get Descripcion() {
        return this._Descripcion;
    }
}
var cursosList = [];

app.post("/cargarEstudiantes", async(req, res) => {
    try {
        if (!req.files) {
            res.send({
                status: false,
                message: 'No hay archivos que cargar'
            });
        } else {
            let uploadFile = req.files.file;

            uploadFile.mv('asserts/Carga_Estudiantes.csv', function(err) {
                if (err)
                    return res.status(500).send(err);
            });

            const csv = require('csvtojson');
            const converter = csv()
                .fromFile('asserts/Carga_Estudiantes.csv')
                .then(async(json) => {
                    let usuarioItem;
                    json.forEach((row) => {
                        usuarioItem = new UsuarioInfo();

                        Object.assign(usuarioItem, row);
                        usuariosList.push(usuarioItem);
                    });
                }).then(async() => {
                    usuariosList.forEach(async(usuarioRow) => {
                        let email = usuarioRow._Email;
                        const oldUser = await User.findOne({ email: email });

                        if (oldUser) {
                            console.log("El usuario " + email + " ya existe en la base de datos");
                        } else {
                            if (usuarioRow._ID_Estudiante != null) {
                                const user = User.create({
                                    id_estudiante: usuarioRow._ID_Estudiante,
                                    nombre: usuarioRow._Nombres,
                                    apellido: usuarioRow._Apellidos,
                                    email: email
                                })
                            }

                        }
                    });
                    usuariosList = [];
                    res.status(200).send(usuariosList.length + " Usuarios Creados Satisfactoriamente");
                });
        }
    } catch (err) {
        res.status(500).send(err);
    }
});

app.post("/cargarCursos", async(req, res) => {
    try {
        if (!req.files) {
            res.send({
                status: false,
                message: 'No hay archivos que cargar'
            });
        } else {
            let uploadFile = req.files.file;

            uploadFile.mv('asserts/Carga_Cursos.csv', function(err) {
                if (err)
                    return res.status(500).send(err);
            });

            const csv = require('csvtojson');
            const converter = csv()
                .fromFile('asserts/Carga_Cursos.csv')
                .then(async(json) => {
                    let cursoItem;
                    json.forEach((row) => {
                        cursoItem = new CursoInfo();

                        Object.assign(cursoItem, row);
                        cursosList.push(cursoItem);
                    });
                }).then(async() => {
                    cursosList.forEach(async(cursoRow) => {
                        const curso = Curso.create({
                            id_estudiante: cursoRow.ID_Estudiante,
                            curso_asignado: cursoRow.Curso_Asignado,
                            descripcion: cursoRow.Descripcion,
                        })

                        let nombreCurso = cursoRow.Curso_Asignado;
                        const filter = { nombre_curso: nombreCurso };

                        const oldCurso = await Cursos.findOne({ filter });

                        if (!oldCurso) {
                            const curso = await Cursos.create({
                                id_curso: 1000,
                                nombre_curso: nombreCurso,
                                descripcion: ""
                            });
                        } else {
                            console.log("el curso " + nombreCurso + " ya existe")
                        }
                    });

                    res.status(200).send(cursosList.length + " Cursos asignados satisfactoriamente");
                    cursosList = [];
                });
        }
    } catch (err) {
        res.status(500).send(err);
    }
});
//#endregion

//#region Usuarios
app.post("/getEstudiantes", auth, async(req, res) => {
    try {
        usuariosList = [];
        User.find({}, async function(err, users) {
            users.forEach(async function(user) {
                usuariosList.push(user);
            });

            res.status(200).json(usuariosList)
        });

    } catch (error) {
        console.log(`Ocurrio un error en el login ${error}`)
    }
});

app.post("/getEstudianteById", auth, async(req, res) => {
    try {
        const { id_estudiante, email } = req.body;

        const userEncontrado = await User.findOne({ id_estudiante });
        res.status(200).json(userEncontrado);

    } catch (error) {
        console.log(`Ocurrio un error en la busqueda ${error}`)
    }
});

app.post("/updateEstudiante", auth, async(req, res) => {
    try {
        const { id_estudiante, nombre, apellido, email, password, disponibilidad } = req.body;

        if (!(email && password)) {
            res.status(400).send("Todos los campos son requeridos");
        }

        const oldUser = await User.findOne({ email });

        if (!oldUser) {
            return res.status(404).send("El no existe");
        }

        encryptedPassword = await bcrypt.hash(password, 10);

        const filter = { email: email.toLowerCase() };
        const update = {
            id_estudiante: id_estudiante,
            nombre: nombre,
            apellido: apellido,
            email: email.toLowerCase(),
            password: encryptedPassword,
            disponibilidad: disponibilidad
        };
        const userUpdate = await User.findOneAndUpdate(filter, update, {
            new: true
        });

        res.status(201).json(userUpdate);
    } catch (err) {
        console.log(err);
    }
});

app.post("/deleteEstudiante", auth, async(req, res) => {
    try {
        const { id_estudiante, email } = req.body;

        if (!(email)) {
            res.status(400).send("El email es requerido");
        }

        const oldUser = await User.findOne({ email });

        if (!oldUser) {
            return res.status(404).send("El usuario no existe");
        }

        const filter = { email: email };
        const usuarioBorrado = await User.findOneAndRemove(filter, {
            new: true
        });

        res.status(201).json(usuarioBorrado);
    } catch (err) {
        return res.status(409).send("Valide si el usuario existe");
    }
});

app.post("/getCursosAsignados", auth, async(req, res) => {
    try {
        cursosList = [];
        const { id_estudiante, email } = req.body;

        Curso.find({ id_estudiante }, async function(err, cursos) {
            cursos.forEach(async function(item) {
                cursosList.push(item);
            });

            res.status(200).json(cursosList)
        });

    } catch (error) {
        console.log(`Ocurrio un error en la busqueda ${error}`)
    }
});
//#endregion

//#region Cursos
var cursosArray = [];
app.post("/getCursos", auth, async(req, res) => {
    try {
        cursosArray = [];
        Cursos.find({}, async function(err, cursos) {
            cursos.forEach(async function(item) {
                cursosArray.push(item);
            });

            res.status(200).json(cursosArray)
        });

    } catch (error) {
        console.log(`Ocurrio un error en la obtecion de cursos ${error}`)
    }
});

app.post("/getCursoById", auth, async(req, res) => {
    try {
        const { id_curso } = req.body;

        const cursoEncontrado = await Cursos.findOne({ id_curso });
        res.status(200).json(cursoEncontrado);

    } catch (error) {
        console.log(`Ocurrio un error en la busqueda ${error}`)
    }
});

app.post("/registroCurso", auth, async(req, res) => {
    try {
        const { id_curso, nombre_curso, descripcion } = req.body;

        if (!(nombre_curso && descripcion && id_curso)) {
            res.status(400).send("Todos los campos son requeridos");
        }

        const oldCurso = await Cursos.findOne({ id_curso });

        if (oldCurso) {
            return res.status(409).send("El curso ya existe, intenta con otro");
        }

        const curso = await Cursos.create({
            id_curso: id_curso,
            nombre_curso: nombre_curso,
            descripcion: descripcion
        });

        res.status(201).json(curso);
    } catch (err) {
        console.log(err);
    }
});

app.post("/updateCurso", auth, async(req, res) => {
    try {
        const { id_curso, nombre_curso, descripcion } = req.body;

        if (!(nombre_curso && descripcion && id_curso)) {
            res.status(400).send("Todos los campos son requeridos");
        }

        const oldCurso = await Cursos.findOne({ id_curso });

        if (!oldCurso) {
            return res.status(404).send("El curso no existe");
        }

        const filter = { id_curso: id_curso };
        const update = {
            id_curso: id_curso,
            nombre_curso: nombre_curso,
            descripcion: descripcion
        };
        const cursoUpdate = await Cursos.findOneAndUpdate(filter, update, {
            new: true
        });

        res.status(201).json(cursoUpdate);
    } catch (err) {
        console.log(err);
    }
});

app.post("/deleteCurso", auth, async(req, res) => {
    try {
        const { id_curso } = req.body;

        if (!(id_curso)) {
            res.status(400).send("El email es requerido");
        }

        const oldCurso = await User.findOne({ id_curso });

        if (!oldCurso) {
            return res.status(404).send("El curso no existe");
        }

        const filter = { id_curso: id_curso };
        const cursoBorrado = await Cursos.findOneAndRemove(filter, {
            new: true
        });

        res.status(201).json(cursoBorrado);
    } catch (err) {
        return res.status(409).send("Valide si el curso existe");
    }
});
//#endregion

//#region Metodos Varios
app.use("*", (req, res) => {
    res.status(404).json({
        success: "false",
        message: "Not Found",
        error: {
            statusCode: 404,
            message: "La ruta buscada no esta definida en el servidor, lo sentimos...",
        },
    });
});

app.post("/bienvenido", auth, (req, res) => {

    res.status(200).send("Bienvenido a AB Asistent!");
})

//#endregion

module.exports = app;