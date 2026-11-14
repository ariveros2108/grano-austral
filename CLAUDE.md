# CLAUDE.md

Este proyecto usa `AGENTS.md` como fuente única de instrucciones. Léelo y síguelo:

@AGENTS.md

## Específico de Claude Code

- El hook `UserPromptSubmit` (`.claude/settings.json` → `.claude/hooks/registrar-prompt.js`) ya escribe en `LogFile.txt` cada prompt completo con fecha y hora. **No lo dupliques.**
  Respaldo: si al responder ves que el último prompt del usuario NO quedó en `LogFile.txt` (el hook no se ejecutó, por ejemplo en Windows sin Node en el PATH), agrégalo tú con el mismo formato (`[AAAA-MM-DD HH:MM:SS America/Santiago] Agente: Claude Code` + `PROMPT:` + texto completo) antes del `RESULTADO`.
- Al terminar cada respuesta en la que hayas hecho algo, agrega al final de `LogFile.txt` (debajo del último prompt registrado):

  ```
  RESULTADO: <resumen de lo generado: archivos creados/modificados, paquetes instalados, decisiones de diseño>
  MODELO: <modelo que usaste en esta respuesta>
  ```

- Al iniciar la sesión, lee las últimas ~80 líneas de `LogFile.txt` y `git log --oneline -15`.
- Antes de editar, explica el plan y espera confirmación. Al final, pregunta si hacer commit y si hacer deploy (Render despliega automáticamente al hacer `git push` a `main`).
- Ejecuta `npm test` antes de dar por terminada una tarea.
