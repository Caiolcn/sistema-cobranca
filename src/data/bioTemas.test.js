import {
  resolverBio, resolverTema, temaDaMarca, todosOsTemas, tipoDaMidia, youtubeId, luminancia, textoSobre, TEMAS_FIXOS
} from './bioTemas'

// Empresa no formato que a edge landing-dados devolve
const empresa = (extra = {}) => ({
  nome_empresa: 'Academia X', cor_primaria: '#344848', telefone: '11999998888',
  instagram_url: 'instagram.com/x', tiktok_url: '', facebook_url: null, youtube_url: 'youtube.com/@x', site: 'x.com.br',
  hero_subtitulo: 'Aulas para todos', descricao: 'Descrição longa', foto_capa_url: 'https://img/capa.jpg',
  galeria: ['https://img/1.jpg', 'https://img/2.jpg'], ...extra
})

describe('resolverBio: quem nunca abriu a bio herda tudo do site', () => {
  test('sem configuração, usa redes, frase, capa e galeria do site', () => {
    const c = resolverBio(empresa(), null)
    expect(c.tema).toBe('marca')
    expect(c.fonte).toBe('inter')
    expect(c.frase).toBe('Aulas para todos')
    expect(c.capa).toBe('https://img/capa.jpg')
    expect(c.redes.instagram).toBe('instagram.com/x')
    expect(c.redes.tiktok).toBe('')
    expect(c.midias).toEqual([{ tipo: 'foto', url: 'https://img/1.jpg' }, { tipo: 'foto', url: 'https://img/2.jpg' }])
    expect(c.mostrar).toEqual({ agendar: true, whatsapp: true, mapa: true })
  })

  test('a frase cai na descrição quando não há subtítulo', () => {
    expect(resolverBio(empresa({ hero_subtitulo: '' }), null).frase).toBe('Descrição longa')
  })

  test('o que o cliente configurou na bio vale mais que o site', () => {
    const c = resolverBio(empresa(), {
      tema: 'fogo', fonte: 'oswald', frase: 'Minha frase',
      redes: { instagram: 'instagram.com/novo', youtube: '' },
      midias: [{ tipo: 'video', url: 'https://v/a.mp4' }],
      mostrar: { whatsapp: false }
    })
    expect(c.tema).toBe('fogo')
    expect(c.fonte).toBe('oswald')
    expect(c.frase).toBe('Minha frase')
    expect(c.redes.instagram).toBe('instagram.com/novo')
    expect(c.redes.youtube).toBe('') // apagou: o botão some
    expect(c.redes.site).toBe('x.com.br') // não mexeu: herda
    expect(c.midias).toEqual([{ tipo: 'video', url: 'https://v/a.mp4' }])
    expect(c.mostrar.whatsapp).toBe(false)
    expect(c.mostrar.agendar).toBe(true)
  })

  test('frase apagada de propósito continua vazia (não volta a do site)', () => {
    expect(resolverBio(empresa(), { frase: '' }).frase).toBe('')
  })

  test('capa removida na bio fica sem capa; sem escolha, herda a do site ou a 1ª foto', () => {
    expect(resolverBio(empresa(), { capa: '' }).capa).toBe('')
    expect(resolverBio(empresa(), { capa: 'https://img/nova.jpg' }).capa).toBe('https://img/nova.jpg')
    expect(resolverBio(empresa({ foto_capa_url: null }), null).capa).toBe('https://img/1.jpg')
    expect(resolverBio(empresa({ foto_capa_url: null, galeria: [] }), null).capa).toBe('')
  })

  test('links extras incompletos são descartados', () => {
    const c = resolverBio(empresa(), { links: [{ titulo: 'Loja', url: 'loja.com' }, { titulo: '', url: 'x' }, { titulo: 'Sem url', url: '' }] })
    expect(c.links).toEqual([{ titulo: 'Loja', url: 'loja.com' }])
  })
})

describe('temas', () => {
  test('o tema "marca" deriva da cor do cliente e tem botão legível', () => {
    const escura = temaDaMarca('#344848')
    expect(escura.destaque).toBe('#ffffff') // marca escura vira botão branco
    expect(luminancia(escura.destaqueTexto)).toBeLessThan(120)
    const viva = temaDaMarca('#4CAF50')
    expect(viva.destaque.toLowerCase()).toBe('#4caf50')
    expect(textoSobre(viva.destaque)).toBeTruthy()
  })

  test('todos os temas têm contraste entre botão de destaque e o texto dele', () => {
    todosOsTemas('#344848').forEach(t => {
      const dif = Math.abs(luminancia(t.destaque) - luminancia(t.destaqueTexto))
      expect(dif).toBeGreaterThan(90)
    })
  })

  test('são 7 opções: Minha cor mais 6 fixas', () => {
    expect(todosOsTemas('#123456')).toHaveLength(7)
    expect(TEMAS_FIXOS).toHaveLength(6)
  })

  test('tema desconhecido cai na cor da marca', () => {
    expect(resolverTema('naoexiste', '#344848').id).toBe('marca')
    expect(resolverTema('fogo', '#344848').id).toBe('fogo')
  })
})

describe('mídia', () => {
  test('detecta foto, vídeo e YouTube', () => {
    expect(tipoDaMidia('https://x/foto.jpg')).toBe('foto')
    expect(tipoDaMidia('https://x/video.mp4')).toBe('video')
    expect(tipoDaMidia('https://x/video.MOV?x=1')).toBe('video')
    expect(tipoDaMidia('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube')
  })

  test('extrai o id do YouTube dos formatos comuns', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://example.com')).toBeNull()
  })
})
