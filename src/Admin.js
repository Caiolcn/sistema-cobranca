/* ============================================================
   /app/admin — CRM Mensalli

   O painel virou quatro abas em src/admin/. Este arquivo só reexporta o shell
   para a rota em App.js não precisar mudar.

     src/admin/AdminShell.js       header, abas, carga e modais compartilhados
     src/admin/useAdminContas.js   carga (uma query na vw_admin_contas)
     src/admin/ciclo.js            taxonomia do ciclo de vida, espelho do SQL
     src/admin/AbaVisaoGeral.js    KPIs, "precisa de atenção", funil, conversão
     src/admin/AbaContas.js        tabela + filtros + drawer de detalhe
     src/admin/AbaFinanceiro.js    MRR real × estimado, série, planos
     src/admin/AbaRetencao.js      buckets de lembrete e recuperação
     src/admin/ModalEditarConta.js edição de plano/vencimento e ciclo de vida
     src/admin/ModalDisparo.js     disparo em lote (direto e via n8n)
   ============================================================ */

export { default } from './admin/AdminShell'
