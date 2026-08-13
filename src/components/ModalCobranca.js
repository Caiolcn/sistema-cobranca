import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';
import whatsappService from '../services/whatsappService';
import { rotuloUltimoEnvio } from '../utils/logsCobranca';
import './ModalCobranca.css';

const formatarMoeda = (valor) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(valor) || 0);

// "5 dias em atraso · R$ 79,90" / "Vence hoje · R$ 79,90" / "Vence em 3 dias · R$ 79,90"
const montarSubtitulo = (item) => {
  const valor = formatarMoeda(item.valor);
  const dias = item.dias;
  if (dias == null) return { texto: valor, atrasado: false };
  if (dias > 0) return { texto: `${dias} ${dias === 1 ? 'dia' : 'dias'} em atraso · ${valor}`, atrasado: true };
  if (dias === 0) return { texto: `Vence hoje · ${valor}`, atrasado: true };
  const faltam = Math.abs(dias);
  return { texto: `Vence em ${faltam} ${faltam === 1 ? 'dia' : 'dias'} · ${valor}`, atrasado: false };
};

/**
 * Modal de cobrança rápida pelo WhatsApp, com prévia editável do template.
 * Usado na fila da Home e na listagem de mensalidades do Financeiro.
 *
 * @param {Object}   item      { id, nome, valor, dias } — id é o da mensalidade
 * @param {Object}   envio     opcional, { total, ultimoISO } de logsCobranca — mostra aviso de reenvio
 * @param {Function} onFechar  fecha o modal
 * @param {Function} onEnviado (item) => void, chamado só quando o envio dá certo
 */
function ModalCobranca({ item, envio, onFechar, onEnviado }) {
  const [mensagem, setMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const carregarPreview = useCallback(async () => {
    setCarregando(true);
    try {
      const { mensagem: texto } = await whatsappService.gerarPreviewMensagem(item.id);
      setMensagem(texto || '');
    } catch {
      setMensagem('');
    } finally {
      setCarregando(false);
    }
  }, [item.id]);

  useEffect(() => {
    carregarPreview();
  }, [carregarPreview]);

  const fechar = () => {
    if (!enviando) onFechar();
  };

  const enviar = async () => {
    if (!mensagem.trim() || enviando) return;
    setEnviando(true);
    setErro('');
    try {
      const resultado = await whatsappService.enviarCobranca(item.id, mensagem);
      if (resultado.sucesso) {
        onEnviado(item);
      } else {
        setErro(resultado.erro || 'Não foi possível enviar a cobrança');
        setEnviando(false);
      }
    } catch (e) {
      setErro('Erro ao enviar: ' + e.message);
      setEnviando(false);
    }
  };

  const subtitulo = montarSubtitulo(item);
  // Avisa que já houve cobrança, mas não bloqueia: reforçar na mão depois do
  // envio automático é caso legítimo.
  const avisoReenvio = rotuloUltimoEnvio(envio);

  return (
    <div className="modal-cobranca-overlay" onClick={fechar}>
      <div className="modal-cobranca-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-cobranca-header">
          <div className="modal-cobranca-titulo">
            <div className="modal-cobranca-avatar">
              <Icon icon="ic:baseline-whatsapp" width="22" />
            </div>
            <div>
              <h3>Cobrar {item.nome}</h3>
              <span className={`modal-cobranca-sub${subtitulo.atrasado ? '' : ' neutro'}`}>
                {subtitulo.texto}
              </span>
            </div>
          </div>
          <button className="modal-cobranca-fechar" onClick={fechar} aria-label="Fechar">
            <Icon icon="mdi:close" width="20" />
          </button>
        </div>

        {avisoReenvio && (
          <div className="modal-cobranca-aviso">
            <Icon icon="mdi:information-outline" width="18" />
            <span>
              {avisoReenvio}
              {envio.total > 1 ? ` · ${envio.total} envios no total` : ''}. Você pode enviar de novo se quiser reforçar.
            </span>
          </div>
        )}

        <div className="modal-cobranca-body">
          <div className="modal-cobranca-label-row">
            <label>Mensagem</label>
            <button
              className="modal-cobranca-restaurar"
              onClick={carregarPreview}
              disabled={carregando || enviando}
            >
              <Icon icon="mdi:restore" width="14" /> Restaurar texto padrão
            </button>
          </div>

          {carregando ? (
            <div className="modal-cobranca-loading">
              <Icon icon="mdi:loading" className="spin" width="22" />
              <span>Montando a mensagem…</span>
            </div>
          ) : (
            <textarea
              className="modal-cobranca-textarea"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={10}
              placeholder="Escreva a mensagem da cobrança…"
              disabled={enviando}
            />
          )}

          {erro ? (
            <span className="modal-cobranca-dica" style={{ color: '#dc2626' }}>{erro}</span>
          ) : (
            <span className="modal-cobranca-dica">
              Edite à vontade. O link de pagamento é inserido automaticamente no envio.
            </span>
          )}
        </div>

        <div className="modal-cobranca-footer">
          <button className="modal-cobranca-btn cancelar" onClick={fechar} disabled={enviando}>
            Cancelar
          </button>
          <button
            className="modal-cobranca-btn enviar"
            onClick={enviar}
            disabled={carregando || enviando || !mensagem.trim()}
          >
            {enviando ? (
              <><Icon icon="mdi:loading" className="spin" width="18" /> Enviando…</>
            ) : (
              <><Icon icon="ic:baseline-whatsapp" width="18" /> Enviar pelo WhatsApp</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModalCobranca;
