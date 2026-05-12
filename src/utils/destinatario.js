/**
 * Resolve o destinatário de uma mensagem WhatsApp para um devedor/aluno.
 *
 * Regra: quando o aluno tem responsável cadastrado (responsavel_nome),
 * a mensagem vai para o telefone do responsável e o {{nomeCliente}}
 * é substituído pelo primeiro nome do responsável.
 *
 * O telefone segue a mesma regra que já era aplicada manualmente:
 * responsavel_telefone || telefone.
 *
 * @param {object} devedor - registro de devedores com nome, telefone,
 *                           responsavel_nome, responsavel_telefone
 * @returns {{ nome: string, primeiroNome: string, nomeAluno: string,
 *             primeiroNomeAluno: string, telefone: string,
 *             ehResponsavel: boolean }}
 */
export function resolverDestinatario(devedor) {
  const nomeAluno = devedor?.nome || ''
  const primeiroNomeAluno = nomeAluno.split(' ')[0] || ''

  const respNome = (devedor?.responsavel_nome || '').trim()
  const respTelefone = (devedor?.responsavel_telefone || '').trim()
  const ehResponsavel = Boolean(respNome)

  const nome = ehResponsavel ? respNome : nomeAluno
  const primeiroNome = ehResponsavel ? (respNome.split(' ')[0] || '') : primeiroNomeAluno
  const telefone = respTelefone || devedor?.telefone || ''

  return {
    nome,
    primeiroNome,
    nomeAluno,
    primeiroNomeAluno,
    telefone,
    ehResponsavel
  }
}
