/**
 * Registro, inicio y cierre de sesión, y "Mi cuenta" con historial de pedidos.
 * Las contraseñas se guardan con bcrypt (costo configurable con BCRYPT_ROUNDS).
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const { encolarEvento, flash } = require('../lib/utilidades');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Middleware: exige sesión iniciada; si no, redirige al login y vuelve después. */
function requiereLogin(req, res, next) {
  if (req.session.usuario) return next();
  req.session.volverA = req.originalUrl;
  flash(req, 'info', 'Inicia sesión o crea una cuenta para continuar.');
  res.redirect('/login');
}

/** Ruta segura de retorno: solo rutas internas. */
const destino = (req) => {
  const v = req.session.volverA;
  delete req.session.volverA;
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : '/cuenta';
};

router.get('/registro', (req, res) => res.render('registro', { titulo: 'Crear cuenta', datos: {}, error: null }));

router.post('/registro', async (req, res) => {
  const nombre = String(req.body.nombre || '').trim().slice(0, 80);
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 120);
  const password = String(req.body.password || '');
  let error = null;
  if (nombre.length < 2) error = 'Ingresa tu nombre.';
  else if (!EMAIL_RE.test(email)) error = 'Ingresa un correo válido.';
  else if (password.length < 6) error = 'La contraseña debe tener al menos 6 caracteres.';
  else if (await db.obtenerUsuarioPorEmail(email)) error = 'Ya existe una cuenta con ese correo.';
  if (error) return res.status(422).render('registro', { titulo: 'Crear cuenta', datos: { nombre, email }, error });

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const id = await db.crearUsuario({ nombre, email, passwordHash });
  req.session.usuario = { id, nombre, email };
  encolarEvento(req, 'sign_up', { method: 'email' });
  flash(req, 'ok', `¡Bienvenido/a, ${nombre}!`);
  res.redirect(destino(req));
});

router.get('/login', (req, res) => res.render('login', { titulo: 'Iniciar sesión', email: '', error: null }));

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const usuario = await db.obtenerUsuarioPorEmail(email);
  if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
    return res.status(401).render('login', { titulo: 'Iniciar sesión', email, error: 'Correo o contraseña incorrectos.' });
  }
  req.session.usuario = { id: Number(usuario.id), nombre: usuario.nombre, email: usuario.email };
  encolarEvento(req, 'login', { method: 'email' });
  flash(req, 'ok', `Hola de nuevo, ${usuario.nombre}.`);
  res.redirect(destino(req));
});

router.post('/logout', (req, res) => {
  const carrito = req.session.carrito;
  req.session = { carrito }; // se conserva el carrito
  res.redirect('/');
});

router.get('/cuenta', requiereLogin, async (req, res) => {
  const pedidos = await db.obtenerPedidosDeUsuario(req.session.usuario.id);
  res.render('cuenta', { titulo: 'Mi cuenta', pedidos });
});

module.exports = { router, requiereLogin };
