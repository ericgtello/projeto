# FitJourney — PRD

## Objetivo
App mobile (Expo React Native) para clientes de personal trainers / nutricionistas em pt-BR. Permite receber treinos personalizados por grupamento muscular considerando os equipamentos disponíveis, acompanhar progressão semanal de cargas/repetições e peso, seguir plano alimentar com lista de substituições e visualizar caminho até a meta (emagrecimento/hipertrofia).

## Público
- Cliente/paciente/aluno (autenticado via Google OAuth gerenciado pela Emergent).

## Fluxo principal
1. Login com Google → `POST /api/auth/google` → salva `session_token`.
2. Onboarding em 4 passos: objetivo (emagrecimento/hipertrofia), dados (sexo/idade/altura/peso), meta (peso alvo/prazo/atividade), equipamentos.
3. Tabs: Início · Treinos · Nutrição · Progresso.
4. Perfil acessível pelo ícone no topo do Início — registrar peso, editar meta e equipamentos, sair.

## Funcionalidades
- **Treinos**: 6 grupamentos (peito, costas, pernas, ombros, braços, abdômen). Gerar treino via IA (Claude Sonnet 4.5) baseado em equipamentos + perfil. Dicas de execução em texto. Registrar séries (carga/reps/série).
- **Progresso**: Gráficos de linha (react-native-gifted-charts) de carga máxima/dia e reps totais/dia por exercício, além de peso corporal ao longo do tempo. Histórico das últimas séries.
- **Nutrição**: Gerar plano alimentar via IA baseado no objetivo/perfil. Macros totais + refeições com alimentos, quantidades e substituições clicáveis (troca inline).
- **Meta**: Barra de progresso na Home mostrando peso atual → alvo com % concluído e prazo.

## Integrações
- Emergent-managed Google Auth (mobile + web).
- Claude Sonnet 4.5 via `emergentintegrations` + `EMERGENT_LLM_KEY`.

## Stack técnico
- Frontend: Expo SDK 54, expo-router (file-based), react-native-gifted-charts, react-native-svg.
- Backend: FastAPI + Motor (MongoDB), httpx.
- Storage: MongoDB (users, user_sessions, workout_plans, workout_logs, weight_logs, diet_plans).

## Enhancement de negócio
- Retenção de clientes via **plano alimentar com substituições** — reduz abandono de dieta permitindo trocas equivalentes por refeição, maior aderência = maior LTV para o profissional.
