# QG Cia Paulista Jiu-Jitsu — Sistema de Gestão de Academia

Sistema completo para gestão de academia de jiu-jitsu, **em produção** e usado no dia a dia pela equipe Cia Paulista Jiu-Jitsu (várias unidades). São três aplicativos PWA que se instalam no celular ou no computador sem loja de aplicativos, todos ligados ao mesmo banco de dados:

| App | Quem usa | Para quê |
|---|---|---|
| **Painel administrativo** | Dono / administração | Alunos, professores, turmas, unidades, financeiro e relatórios |
| **App do professor** | Professores | Chamada, alunos da própria unidade, vídeos de técnicas, fotos do treino |
| **App do aluno** | Alunos | Check-in, graduação, mensalidades, avisos e conteúdo da academia |

🔗 **Em produção:** https://qgciapaulistabjjbrasil.netlify.app  
_O acesso exige login: os dados são de alunos reais. Posso apresentar o sistema funcionando em uma chamada._

---

## Funcionalidades

**Gestão de alunos e graduação**
- Cadastro completo com faixa, grau, unidade, professor responsável e plano
- Histórico de faixas e de treinos (a graduação anterior fica registrada)
- Anamnese preenchida pelo próprio aluno no app; o professor abre em PDF
- Termo de responsabilidade com assinatura digital

**Presença e turmas**
- Check-in do aluno pelo app, com validação por localização
- Controle de presença por turma e contagem de aulas pelo histórico
- Cada unidade com suas próprias turmas, horários e professores

**Financeiro**
- Planos por professor, inclusive personal com valor por hora-aula
- Baixa de pagamento com data retroativa e chave PIX por unidade
- Relatórios mensais e anual de pagamentos confirmados e pendentes, exportados em PDF com marca d'água da academia
- Aviso automático de mensalidade vencendo

**Comunicação**
- Notificações push (Web Push / VAPID) para avisos, aulas novas e vencimentos
- Mensagem automática de aniversário
- Vídeo-recado do mestre e avisos por unidade
- Professor publica foto do treino, os alunos são notificados e a foto some sozinha em 5 dias

**Conteúdo**
- Biblioteca de vídeos de técnicas publicada pelos professores
- Regras de tatame, golpes proibidos (PDF) e tabela de pesos e categorias
- Cronômetro de treino (rounds e descanso)
- Loja de produtos da academia com fotos

**Segurança e LGPD**
- Autenticação com Supabase Auth e três papéis: admin, professor e aluno
- **Row Level Security** no Postgres: cada papel só lê e altera o que é seu (o aluno vê só os próprios dados, o professor só a própria unidade)
- Storage restrito a usuários autenticados
- Consentimento LGPD no primeiro acesso, política de privacidade, exportação e exclusão dos dados do aluno
- Operações privilegiadas (criar e remover contas) feitas só no servidor, por Edge Functions

---

## Tecnologias

- **Front-end:** React 18, Vite 5, Recharts (dashboards), Lucide Icons
- **PWA:** Service Worker próprio, três manifests (admin, professor e aluno), notificações push
- **Back-end:** Supabase — Postgres com RLS, Auth, Storage e Edge Functions (Deno/TypeScript)
- **Edge Functions:** `send-push`, `check-vencimentos`, `check-aniversarios`, `gerenciar-contas`, `gerenciar-sessoes`, `limpar-fotos-treino`
- **Deploy:** Netlify com deploy contínuo a partir do GitHub

## Arquitetura

```
┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
│ Painel admin (PWA) │   │ App professor (PWA)│   │  App aluno (PWA)   │
└─────────┬──────────┘   └─────────┬──────────┘   └─────────┬──────────┘
          └────────────────────────┼────────────────────────┘
                                   │ HTTPS + JWT da sessão
                    ┌──────────────▼───────────────┐
                    │           Supabase           │
                    │  Auth · Postgres (RLS)       │
                    │  Storage · Edge Functions    │
                    └──────────────────────────────┘
```

**Multi-academia (white-label):** o mesmo código atende academias diferentes. Cada uma tem seu projeto Supabase e sua identidade visual (nome, logo, cores e ícones) em `marcas/<academia>`, escolhida pela variável `VITE_MARCA`. A segunda academia em produção é a [Bushi Defense](https://github.com/tecbmtecnologia-dot/bushidefense).

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha a URL e a chave publishable do seu projeto Supabase
npm run dev
```

As migrações SQL (tabelas e políticas de RLS) ficam em `supabase/sql/`, e as Edge Functions em `supabase/functions/`.

---

Desenvolvido por **Bruno Martins da Silva** — [TEC BM Tecnologia](https://github.com/tecbmtecnologia-dot)
