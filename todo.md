# Alliance Dance Studio - TODO

## Fase 1: Configuração Base
- [x] Configurar tema e paleta de cores (Preto, Dourado #D4AF37, Burgundy #800020)
- [x] Adicionar logo Alliance aos assets
- [ ] Configurar fontes personalizadas
- [x] Criar estrutura de navegação principal

## Fase 2: Database e Sistema de Reservas
- [x] Criar schema de banco de dados (studios, bookings, time_slots)
- [x] Implementar procedures tRPC para reservas
- [x] Criar interface de calendário para visualização de disponibilidade
- [x] Implementar formulário de reserva
- [x] Adicionar validação de disponibilidade em tempo real
- [ ] Configurar confirmação por email
- [x] Prevenir reservas duplicadas

## Fase 3: Navegação e Multi-idiomas
- [x] Implementar navbar responsiva com design especificado
- [x] Configurar react-i18next
- [x] Adicionar traduções para Inglês, Espanhol e Francês
- [x] Implementar seletor de idiomas com bandeiras
- [x] Persistir preferência de idioma em localStorage

## Fase 4: Páginas Principais
- [x] Página Home com hero section
- [x] Seção de overview do estúdio
- [x] Featured classes/instructors
- [x] CTAs (Book Studio, View Classes)
- [ ] Integração feed Instagram (últimos 9-12 posts)
- [x] Página About (história, missão, equipe)
- [x] Página Classes (horários, descrições, instrutores)
- [x] Página Gallery (fotos/vídeos com lightbox)
- [x] Página Contact (formulário + mapa + detalhes)

## Fase 5: Admin e Otimizações
- [x] Painel administrativo de login
- [x] Dashboard para visualizar reservas
- [x] Gerenciar reservas (aprovar, cancelar)
- [ ] Bloquear horários
- [ ] Lazy loading de imagens e componentes
- [ ] Code splitting
- [ ] Otimização de imagens (WebP)
- [ ] Implementar SEO (meta tags, semantic HTML)
- [ ] Garantir acessibilidade WCAG 2.1 AA
- [x] Configurar ESLint e Prettier
- [x] Adicionar error boundaries
- [x] Implementar loading states

## Documentação
- [ ] README com instruções de setup
- [ ] Guia de configuração Supabase
- [ ] Guia de setup Instagram API
- [ ] Guia de deployment
- [ ] Guia de tradução
- [ ] .env.example com variáveis necessárias
