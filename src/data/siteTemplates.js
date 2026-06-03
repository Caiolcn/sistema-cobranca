// Templates prontos para o gerador de site (landing da empresa).
// Cada modelo preenche cores, textos, FAQ, depoimentos e imagens de exemplo.
// Imagens: Unsplash (uso livre). URLs verificadas (HTTP 200).

const img = (id, w = 1400) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`

export const SITE_TEMPLATES = [
  {
    id: 'academia',
    nome: 'Academia',
    icon: 'mdi:dumbbell',
    cor: '#e11d48',
    capaUrl: img('1534438327276-14e5300c3a48', 1600),
    galeria: [
      img('1534438327276-14e5300c3a48', 900),
      img('1517836357463-d25dfeac3438', 900),
      img('1571019613454-1cb2f99b2d8b', 900)
    ],
    heroTitulo: 'Treine forte. Viva melhor.',
    heroSubtitulo: 'Estrutura completa, equipe que acompanha de perto e planos que cabem na sua rotina. Dê o primeiro passo hoje.',
    descricao: 'Somos mais que uma academia: somos um espaço pensado para a sua evolução. Com equipamentos modernos, ambiente agradável e profissionais qualificados, oferecemos o suporte que você precisa para alcançar seus objetivos — seja emagrecimento, ganho de massa ou mais qualidade de vida. Aqui cada aluno é acompanhado de perto e tratado pelo nome. Venha treinar com a gente e sinta a diferença.',
    ctaTexto: 'Começar agora',
    ctaFinalTitulo: 'Bora treinar?',
    ctaFinalSubtitulo: 'Fale com a gente e agende sua aula experimental gratuita.',
    faq: [
      { pergunta: 'Preciso agendar para conhecer?', resposta: 'Não! Você pode passar aqui dentro do nosso horário de funcionamento para conhecer a estrutura quando quiser.' },
      { pergunta: 'Tem aula experimental?', resposta: 'Sim, a primeira aula é por nossa conta. Fale no WhatsApp e a gente agenda para você.' },
      { pergunta: 'Quais as formas de pagamento?', resposta: 'Aceitamos Pix, cartão de crédito e débito. Os planos podem ser mensais, trimestrais ou anuais.' },
      { pergunta: 'Tenho acompanhamento de professor?', resposta: 'Sim! Nossa equipe monta um treino personalizado e acompanha sua evolução de perto.' }
    ],
    depoimentosManuais: [
      { nome: 'Carla M.', comentario: 'Em 3 meses mudei completamente minha disposição. A equipe é atenciosa e o ambiente é ótimo.' },
      { nome: 'Rafael S.', comentario: 'Melhor academia que já treinei. Estrutura nova e professores que realmente acompanham.' }
    ]
  },
  {
    id: 'pilates',
    nome: 'Estúdio de Pilates',
    icon: 'mdi:yoga',
    cor: '#0d9488',
    capaUrl: img('1518611012118-696072aa579a', 1600),
    galeria: [
      img('1518611012118-696072aa579a', 900),
      img('1599901860904-17e6ed7083a0', 900),
      img('1506126613408-eca07ce68773', 900)
    ],
    heroTitulo: 'Equilíbrio, força e bem-estar no seu tempo.',
    heroSubtitulo: 'Aulas em grupos reduzidos, com atenção individual. Cuide da sua postura e da sua qualidade de vida.',
    descricao: 'Nosso estúdio nasceu da paixão por movimento e bem-estar. Trabalhamos com o método Pilates em turmas reduzidas, garantindo atenção individual e segurança em cada exercício. Nossa equipe é formada por instrutores certificados que adaptam o treino à sua realidade, respeitando seus limites e celebrando cada conquista. Aqui você cuida do corpo e da mente em um ambiente acolhedor e tranquilo.',
    ctaTexto: 'Agendar aula',
    ctaFinalTitulo: 'Vamos começar?',
    ctaFinalSubtitulo: 'Agende sua aula experimental e sinta a diferença já na primeira sessão.',
    faq: [
      { pergunta: 'Nunca fiz Pilates, posso começar?', resposta: 'Claro! Nossas aulas são adaptadas para todos os níveis, do iniciante ao avançado.' },
      { pergunta: 'Quantos alunos por turma?', resposta: 'Trabalhamos com grupos reduzidos para garantir atenção individual e segurança em cada exercício.' },
      { pergunta: 'Pilates ajuda com dores nas costas?', resposta: 'Sim. O método fortalece a musculatura profunda e melhora a postura, aliviando dores crônicas.' }
    ],
    depoimentosManuais: [
      { nome: 'Juliana P.', comentario: 'Minhas dores nas costas praticamente sumiram. As instrutoras são maravilhosas.' },
      { nome: 'Marina L.', comentario: 'Ambiente acolhedor e aulas que respeitam o meu ritmo. Recomendo demais.' }
    ]
  },
  {
    id: 'crossfit',
    nome: 'Crossfit',
    icon: 'mdi:weight-lifter',
    cor: '#f97316',
    capaUrl: img('1534258936925-c58bed479fcb', 1600),
    galeria: [
      img('1534258936925-c58bed479fcb', 900),
      img('1517963879433-6ad2b056d712', 900),
      img('1541534741688-6078c6bfb5c5', 900)
    ],
    heroTitulo: 'Supere seus limites todos os dias.',
    heroSubtitulo: 'Treinos funcionais de alta intensidade, uma comunidade que te motiva e resultados que você sente. Vem com a gente.',
    descricao: 'Mais que um box, somos uma comunidade. Aqui o Crossfit é levado a sério, mas sem perder a leveza e o espírito de equipe que tornam cada treino especial. Nossos coaches são certificados e acompanham de perto a execução de cada movimento, garantindo evolução com segurança — do iniciante ao atleta avançado. Venha fazer parte de um time que treina junto, supera junto e comemora junto.',
    ctaTexto: 'Fazer aula experimental',
    ctaFinalTitulo: 'Pronto pro desafio?',
    ctaFinalSubtitulo: 'Agende seu primeiro WOD gratuito e descubra do que você é capaz.',
    faq: [
      { pergunta: 'Preciso ter preparo físico?', resposta: 'Não! Todos os movimentos são escalados para o seu nível. Começamos do básico, com segurança.' },
      { pergunta: 'O que é um WOD?', resposta: 'É o "Workout of the Day" — o treino do dia, sempre variado para trabalhar o corpo todo.' },
      { pergunta: 'Tem turma para iniciantes?', resposta: 'Sim, temos turmas e acompanhamento específicos para quem está começando do zero.' }
    ],
    depoimentosManuais: [
      { nome: 'Bruno A.', comentario: 'A comunidade aqui é surreal. Nunca me senti tão motivado a treinar.' },
      { nome: 'Pedro H.', comentario: 'Evoluí mais em 6 meses de Crossfit do que em anos de musculação.' }
    ]
  },
  {
    id: 'ct-luta',
    nome: 'CT de Luta',
    icon: 'mdi:boxing-glove',
    cor: '#dc2626',
    capaUrl: img('1549719386-74dfcbf7dbed', 1600),
    galeria: [
      img('1549719386-74dfcbf7dbed', 900),
      img('1517438476312-10d79c077509', 900),
      img('1599058917765-a780eda07a3e', 900)
    ],
    heroTitulo: 'Disciplina, técnica e superação.',
    heroSubtitulo: 'Aulas de luta para todos os níveis, com professores experientes e uma equipe que treina junto. Vista a faixa e evolua com a gente.',
    descricao: 'Nosso centro de treinamento é mais que um tatame: é onde corpo e mente se fortalecem juntos. Oferecemos aulas para todas as idades e níveis, do iniciante ao competidor, com professores graduados que acompanham de perto a sua evolução. Aqui você ganha condicionamento, disciplina, autoconfiança e faz parte de uma equipe que apoia cada conquista. Vista o kimono e descubra do que você é capaz.',
    ctaTexto: 'Fazer aula experimental',
    ctaFinalTitulo: 'Pronto pro tatame?',
    ctaFinalSubtitulo: 'Agende sua aula experimental gratuita e venha sentir a energia do nosso CT.',
    faq: [
      { pergunta: 'Nunca treinei luta, posso começar?', resposta: 'Com certeza! Temos turmas e acompanhamento específicos para iniciantes. Você aprende do zero, com segurança e no seu ritmo.' },
      { pergunta: 'Quais modalidades vocês oferecem?', resposta: 'Trabalhamos com diferentes modalidades de luta. Fale com a gente pelo WhatsApp para saber os horários de cada turma.' },
      { pergunta: 'Tem aula experimental?', resposta: 'Sim, a primeira aula é por nossa conta. Agende pelo WhatsApp e venha conhecer o CT e a equipe.' },
      { pergunta: 'Preciso de equipamento para começar?', resposta: 'Para a primeira aula, não. Conforme você evolui, orientamos sobre os equipamentos ideais para cada modalidade.' }
    ],
    depoimentosManuais: [
      { nome: 'Diego M.', comentario: 'Entrei sem nunca ter treinado e hoje não largo mais. Ganhei condicionamento e confiança que levo pra vida.' },
      { nome: 'Thiago R.', comentario: 'Professores excelentes e uma equipe que te puxa pra cima. Melhor decisão que tomei pela minha saúde.' }
    ]
  },
  {
    id: 'escola',
    nome: 'Escola',
    icon: 'mdi:school-outline',
    cor: '#7c3aed',
    capaUrl: img('1503676260728-1c00da094a0b', 1600),
    galeria: [
      img('1503676260728-1c00da094a0b', 900),
      img('1497633762265-9d179a990aa6', 900),
      img('1522202176988-66273c2fd55f', 900)
    ],
    heroTitulo: 'Onde aprender é uma experiência.',
    heroSubtitulo: 'Ensino de qualidade, ambiente acolhedor e uma equipe dedicada a desenvolver o potencial de cada aluno.',
    descricao: 'Transformamos o aprendizado em uma experiência marcante. Nossa proposta pedagógica une ensino de qualidade, valores sólidos e um olhar atento para o desenvolvimento integral de cada aluno. Contamos com uma equipe dedicada, ambiente acolhedor e uma estrutura preparada para estimular a curiosidade e o crescimento. Aqui, cada aluno é incentivado a aprender, criar e sonhar.',
    ctaTexto: 'Falar com a escola',
    ctaFinalTitulo: 'Faça parte',
    ctaFinalSubtitulo: 'Agende uma visita e conheça de perto a nossa proposta pedagógica.',
    faq: [
      { pergunta: 'Como funciona a matrícula?', resposta: 'Fale com a gente pelo WhatsApp para agendar uma visita e conhecer todo o processo.' },
      { pergunta: 'Quais turmas estão disponíveis?', resposta: 'Temos turmas para diferentes idades e níveis. Entre em contato para verificar as vagas.' },
      { pergunta: 'Posso visitar antes de matricular?', resposta: 'Com certeza! Agende uma visita e conheça nossa estrutura e equipe pessoalmente.' }
    ],
    depoimentosManuais: [
      { nome: 'Família Souza', comentario: 'Nossa filha evoluiu muito e ama ir para a escola todos os dias.' },
      { nome: 'Patrícia M.', comentario: 'Equipe dedicada e atenta. Sentimos a diferença no desenvolvimento do nosso filho.' }
    ]
  },
  {
    id: 'clinica',
    nome: 'Clínica',
    icon: 'mdi:medical-bag',
    cor: '#2563eb',
    capaUrl: img('1538108149393-fbbd81895907', 1600),
    galeria: [
      img('1538108149393-fbbd81895907', 900),
      img('1576091160550-2173dba999ef', 900),
      img('1631217868264-e5b90bb7e133', 900)
    ],
    heroTitulo: 'Cuidado de verdade com a sua saúde.',
    heroSubtitulo: 'Profissionais especializados, atendimento humanizado e estrutura completa para cuidar de você e da sua família.',
    descricao: 'Nossa clínica foi criada para oferecer um atendimento de saúde próximo, humano e de qualidade. Contamos com profissionais especializados, equipamentos modernos e uma estrutura pensada para o seu conforto e bem-estar. Acreditamos que cuidar da saúde vai além de tratar sintomas: é ouvir, acolher e construir uma relação de confiança com cada paciente. Estamos aqui para cuidar de você e de quem você ama.',
    ctaTexto: 'Agendar consulta',
    ctaFinalTitulo: 'Cuide-se hoje',
    ctaFinalSubtitulo: 'Agende sua consulta pelo WhatsApp de forma rápida e sem burocracia.',
    faq: [
      { pergunta: 'Como faço para agendar?', resposta: 'É só falar com a gente pelo WhatsApp e escolher o melhor horário para você.' },
      { pergunta: 'Atendem convênios?', resposta: 'Atendemos os principais convênios e também consultas particulares. Consulte a disponibilidade.' },
      { pergunta: 'Qual o horário de atendimento?', resposta: 'Funcionamos de segunda a sábado. Confira os horários detalhados na seção de contato.' }
    ],
    depoimentosManuais: [
      { nome: 'Sandra R.', comentario: 'Atendimento atencioso do começo ao fim. Me senti realmente cuidada.' },
      { nome: 'Antônio C.', comentario: 'Profissionais excelentes e ambiente muito acolhedor. Recomendo.' }
    ]
  }
]
