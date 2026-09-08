/* ============================================================
   /app/admin/leads — inbox de leads

   O componente virou src/admin/leads/. Este arquivo só reexporta o shell
   para a rota em App.js não precisar mudar (mesmo padrão de Admin.js).

   NOTA: reconstruído em 03/09/2026. O original era uma alteração ainda não
   commitada e foi perdido num `git reset --hard` — a pasta src/admin/leads/
   sobreviveu porque estava untracked. Se o shim original tinha algo além
   deste reexport, precisa voltar aqui.
   ============================================================ */

export { default } from './admin/leads/LeadsShell'
