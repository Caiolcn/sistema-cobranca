# Repaginada de dezembro/2026 — backlog

Quatro baldes: **crítico** (segurança, dinheiro, dados), **importante** (fluxo quebrado, tela errada no celular), **cosmético** e **cortar**. Cada item tem quem faz e quem revisa. Detalhe das falhas de segurança fica em `docs/security-audit/` (fora do Git); aqui entra só o código do achado.

| # | Balde | Item | Faz | Revisa | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Crítico | Achado S1 (webhook de pagamento) | corretor-seguranca | revisor-seguranca | Aberto |
| 2 | Crítico | Achado S3 (função de envio aberta; corrigir antes do S1) | corretor-seguranca | revisor-seguranca | Aberto, confirmado em 27/11 |
| 3 | Crítico | Backup automático com restauração testada | banco-dados + dono | revisor-codigo | A fazer |
| 4 | Crítico | Ambiente de teste separado da produção | dev-funcionalidades + dono | — | A fazer |
| 5 | Crítico | Auditoria completa de segurança (roteiro do revisor-seguranca) | revisor-seguranca | dono | A fazer, 1 a 7/12 |
| 6 | Importante | Achado S2 (segundo webhook de pagamento) | corretor-seguranca | revisor-seguranca | Aberto |
| 7 | Importante | Varredura de todas as telas no celular | qa-mobile | dono | A fazer, 1 a 7/12 |
| 8 | Importante | Revisão de layout tela por tela contra o design system | revisor-layout | dono | A fazer, 1 a 7/12 |
| 9 | Importante | Retrato do banco e histórico de migrações | banco-dados | revisor-codigo | A fazer |
| 10 | Importante | Migrar para o design system: Configuracao, Clientes, WhatsAppConexao, Financeiro | dev-funcionalidades | revisor-layout + qa-mobile | A fazer, 15 a 21/12 |
| 11 | Importante | Cobrança da assinatura no Asaas e tabela nova de preços | dev-funcionalidades | revisor-codigo + qa-mobile + dono | A fazer |
| 12 | Importante | Multiusuário (fases 0 e 1 já escritas) | dev-funcionalidades | revisor-codigo + revisor-seguranca | A fazer, 22 a 28/12 |
| 13 | Importante | Testes automáticos dos fluxos de dinheiro (Cypress instalado, sem testes) | dev-funcionalidades | revisor-codigo | A decidir |
| 14 | Cosmético | Organizar os SQLs soltos da raiz em pastas | banco-dados | dono | A fazer |
| 15 | Cosmético | Levar a branch dev para a main e limpar os 46 arquivos pendentes | dono + dev-funcionalidades | revisor-codigo | A fazer |
| 16 | A decidir | Sair do Create React App para o Vite | dev-funcionalidades | revisor-codigo + qa-mobile | Só depois da segurança |
| 17 | Cortar | Funcionalidades pouco usadas (decidir com o relatório de adoção) | dono | — | A decidir |
| 18 | Importante | Achado S4 (recebimento de eventos do WhatsApp) | corretor-seguranca | revisor-seguranca | Aberto |
| 19 | Importante | Achado S5 (funções do banco chamáveis sem login) | banco-dados | revisor-seguranca | Aberto |
| 20 | Importante | Achado S7 (cancelamento de boleto no Asaas chama função que não existe) | qa-mobile confirma, dev-funcionalidades corrige | revisor-codigo | A confirmar |
| 21 | Cosmético | Achado S6 (senha vazada, funções órfãs, tabelas de backup no schema público) | dono + banco-dados | revisor-seguranca | A fazer |
