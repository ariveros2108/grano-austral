#!/usr/bin/env node
/**
 * Hook UserPromptSubmit de Claude Code.
 * Recibe por stdin un JSON con el prompt del usuario y lo agrega COMPLETO a LogFile.txt
 * con fecha y hora de Chile. El agente luego agrega RESULTADO y MODELO (ver CLAUDE.md).
 * Nunca bloquea el prompt: ante cualquier error termina con código 0.
 */
const fs = require('fs');
const path = require('path');

let entrada = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (entrada += c));
process.stdin.on('end', () => {
  try {
    const datos = JSON.parse(entrada || '{}');
    const prompt = (datos.prompt || '').trim();
    if (!prompt) return;
    const raiz = process.env.CLAUDE_PROJECT_DIR || datos.cwd || process.cwd();
    const fecha = new Date().toLocaleString('sv-SE', { timeZone: 'America/Santiago' }); // AAAA-MM-DD HH:MM:SS
    const bloque = [
      '',
      '================================================================================',
      `[${fecha} America/Santiago] Agente: Claude Code · sesión ${String(datos.session_id || '').slice(0, 8)}`,
      'PROMPT:',
      prompt,
      '',
    ].join('\n');
    fs.appendFileSync(path.join(raiz, 'LogFile.txt'), bloque + '\n', 'utf8');
  } catch {
    // no interrumpir al usuario
  }
});
