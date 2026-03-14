# PRD — GPExport (Gerente de Projetos → ClickUp)

**Data:** 2026-03-14
**Autor:** Carlos Viana / IT Valley
**Status:** Draft
**Prioridade:** Urgente

---

## 1. Problema

A Gerente de Projetos (GP) da IT Valley usa **ClickUp** para acompanhar entregas. Os devs usam **GitHub Projects** e a esteira de agentes IT Valley. O Agente 08-b gera um documento de gestão completo com domínios, casos de uso e dependências — mas esse documento fica em Markdown e a GP:

- Não sabe GitHub
- Não sabe programar
- Precisa cobrar os devs no ClickUp

**Hoje:** O dev precisa manualmente criar Spaces, Folders, Lists e Tasks no ClickUp — processo demorado, propenso a erros e que ninguém faz direito.

**Desejado:** Subir o doc do Agente 08-b e ter o projeto inteiro criado automaticamente no ClickUp.

---

## 2. Solução

Sistema web **GPExport** que:

1. Recebe o documento Markdown do Agente 08-b (upload ou paste)
2. Usa um agente IA (Claude Opus) para parsear o doc e extrair a estrutura
3. Mapeia para a hierarquia do ClickUp da GP
4. Cria tudo automaticamente via ClickUp API

---

## 3. Mapeamento 08-b → ClickUp

| Doc 08-b (Agente) | ClickUp (GP) | Exemplo |
|-------------------|--------------|---------|
| Nome do Projeto | **Space** | TCC - Traffic Command Center |
| Nível (1, 2, 3...) | **Folder** | "Nível 1 - Base (sem dependências)" |
| Domínio | **List** | "Produto", "Funil", "Campanha" |
| Dev Feature (caso de uso) | **Task** | "CriarProduto — POST /api/products" |
| Camadas (Back/Front/QA) | **Checklist** na Task | ☐ Back ☐ Front ☐ QA |
| Dependência entre dev features | **Dependency** entre Tasks | CriarProduto → ListarProdutos |
| Status (⬜/🔨/✅/🔴) | **Status** do ClickUp | A FAZER / EM ANDAMENTO / FEITO / BLOQUEADO |

### Hierarquia visual no ClickUp:

```
Space: TCC - Traffic Command Center
├── Folder: Nível 1 — Base (sem dependências)
│   ├── List: Produto (4 tarefas)
│   │   ├── Task: CriarProduto — POST /api/products
│   │   │   └── Checklist: ☐ Back  ☐ Front  ☐ QA
│   │   ├── Task: ListarProdutos — GET /api/products
│   │   ├── Task: BuscarProduto — GET /api/products/:id
│   │   └── Task: AtualizarProduto — PUT /api/products/:id
│   ├── List: Pixel (5 tarefas)
│   ├── List: Criativo (4 tarefas)
│   ├── List: StapeConfig (2 tarefas)
│   └── List: OAuthConnection (4 tarefas)
├── Folder: Nível 2 — Depende do Nível 1
│   ├── List: Funil (4 tarefas)
│   ├── List: Público (4 tarefas)
│   ├── List: TrackingPage (4 tarefas)
│   └── List: Drive (3 tarefas)
├── Folder: Nível 3 — Depende do Nível 2
│   ├── List: Campanha (5 tarefas)
│   └── List: SyncPlatform (4 tarefas)
└── Folder: Nível 4 — Depende do Nível 3
    └── List: Dashboard (3 tarefas)
```

---

## 4. Funcionalidades

### 4.1 — Página de Configuração (Settings)

- Campo: **ClickUp API Token** (texto, mascarado)
- Campo: **Team ID** (auto-detectado após inserir token, ou manual)
- Botão: **Testar Conexão** → valida token e mostra workspaces
- Campo: **Anthropic API Key** (para o agente Claude Opus)
- Salva em localStorage ou backend (`.env`)

### 4.2 — Página Principal (Upload & Export)

- **Área de upload**: drag & drop ou paste do Markdown do 08-b
- **Preview**: mostra a estrutura parseada em árvore (Space → Folder → List → Task)
- **Mapeamento de status**: traduz ⬜→A FAZER, 🔨→EM ANDAMENTO, ✅→FEITO, 🔴→BLOQUEADO
- **Botão "Exportar para ClickUp"**: cria tudo via API
- **Progress bar**: mostra progresso (criando Space... Folders... Lists... Tasks...)
- **Log de resultado**: "✅ 12 domínios, 58 tasks criadas no ClickUp"

### 4.3 — Agente IA (Parser do 08-b)

O agente Claude Opus recebe o Markdown e retorna um JSON estruturado:

```json
{
  "projectName": "TCC - Traffic Command Center",
  "levels": [
    {
      "level": 1,
      "name": "Nível 1 — Base (sem dependências)",
      "domains": [
        {
          "name": "Produto",
          "dependsOn": [],
          "devFeatures": [
            {
              "name": "CriarProduto",
              "description": "POST /api/products — cadastra novo produto",
              "dependsOn": [],
              "status": "todo",
              "checklist": ["Back", "Front", "QA"]
            }
          ]
        }
      ]
    }
  ]
}
```

**Prompt do agente** (embutido no sistema):

```
Você é um parser de documentos de gestão de projetos IT Valley (Agente 08-b).

Receba um documento Markdown no formato do Agente 08-b e extraia:
1. Nome do projeto
2. Níveis de implementação (com dependências)
3. Domínios por nível
4. Dev features por domínio (nome, descrição, dependências, status)
5. Checklist por dev feature (Back, Front, QA)

Mapeie os status:
- ⬜ → "todo"
- 🔨 → "in_progress"
- ✅ → "done"
- 🔴 → "blocked"
- ⏳ → "review"

Retorne APENAS um JSON válido, sem texto adicional.
```

### 4.4 — Integração ClickUp API

Endpoints utilizados (ClickUp API v2):

| Ação | Endpoint | Método |
|------|----------|--------|
| Listar Teams | `/api/v2/team` | GET |
| Criar Space | `/api/v2/team/{team_id}/space` | POST |
| Criar Folder | `/api/v2/space/{space_id}/folder` | POST |
| Criar List | `/api/v2/folder/{folder_id}/list` | POST |
| Criar Task | `/api/v2/list/{list_id}/task` | POST |
| Criar Checklist | `/api/v2/task/{task_id}/checklist` | POST |
| Criar Checklist Item | `/api/v2/checklist/{checklist_id}/checklist_item` | POST |

**Fluxo:**
1. Criar Space com nome do projeto
2. Para cada nível: criar Folder
3. Para cada domínio: criar List dentro do Folder
4. Para cada dev feature: criar Task dentro da List
5. Para cada task: criar Checklist "Camadas" com items Back/Front/QA
6. Mapear status da task

---

## 5. Stack Técnico

| Camada | Tecnologia |
|--------|-----------|
| Frontend | SvelteKit (consistente com TCC) |
| Backend | Python/FastAPI (consistente com TCC) |
| IA | Anthropic Claude Opus via API |
| Integração | ClickUp API v2 |
| Persistência | Mínima — localStorage para config, sem banco |

---

## 6. Telas

### Tela 1: Settings
```
┌─────────────────────────────────────────┐
│  GPExport — Configuração                │
├─────────────────────────────────────────┤
│                                         │
│  ClickUp API Token                      │
│  ┌─────────────────────────────┐        │
│  │ pk_**********************   │        │
│  └─────────────────────────────┘        │
│                                         │
│  Team / Workspace                       │
│  ┌─────────────────────────────┐        │
│  │ IT Valley School ▼          │        │
│  └─────────────────────────────┘        │
│                                         │
│  Anthropic API Key                      │
│  ┌─────────────────────────────┐        │
│  │ sk-ant-**********************│       │
│  └─────────────────────────────┘        │
│                                         │
│  [Testar Conexão]  [Salvar]             │
│                                         │
└─────────────────────────────────────────┘
```

### Tela 2: Upload & Export
```
┌─────────────────────────────────────────┐
│  GPExport — Upload                      │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │   Arraste o doc 08-b aqui      │    │
│  │   ou cole o Markdown           │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── Preview da Estrutura ──             │
│                                         │
│  📁 TCC - Traffic Command Center        │
│  ├── 📂 Nível 1 — Base                 │
│  │   ├── 📋 Produto (4)                │
│  │   │   ├── ⬜ CriarProduto           │
│  │   │   ├── ⬜ ListarProdutos         │
│  │   │   ├── ⬜ BuscarProduto          │
│  │   │   └── ⬜ AtualizarProduto       │
│  │   ├── 📋 Pixel (5)                  │
│  │   └── ...                            │
│  ├── 📂 Nível 2 — Dependentes          │
│  └── ...                                │
│                                         │
│  Total: 12 domínios, 58 tasks           │
│                                         │
│  [Exportar para ClickUp]                │
│                                         │
│  ── Log ──                              │
│  ✅ Space "TCC" criado                  │
│  ✅ Folder "Nível 1" criado            │
│  ✅ List "Produto" criado (4 tasks)     │
│  ...                                    │
│                                         │
└─────────────────────────────────────────┘
```

---

## 7. Casos de Uso

| # | Caso de Uso | Descrição |
|---|------------|-----------|
| 1 | ConfigurarChaves | Salvar API tokens (ClickUp + Anthropic) |
| 2 | TestarConexao | Validar tokens e listar workspaces |
| 3 | UploadDocumento | Receber Markdown do 08-b (drag/drop ou paste) |
| 4 | ParsearDocumento | Agente Claude extrai estrutura JSON do Markdown |
| 5 | PreviewEstrutura | Mostrar árvore da estrutura parseada |
| 6 | ExportarClickUp | Criar Space/Folders/Lists/Tasks via API |
| 7 | ExibirProgresso | Mostrar progresso e log da exportação |

---

## 8. Fluxo Principal

```
Usuário abre GPExport
  → Configura API keys (1x)
  → Cola/sobe Markdown do 08-b
  → Sistema chama Claude Opus → parseia → JSON
  → Preview em árvore
  → Clica "Exportar para ClickUp"
  → Sistema cria via API: Space → Folders → Lists → Tasks → Checklists
  → Log mostra resultado
  → GP abre ClickUp e vê tudo pronto
```

---

## 9. Critérios de Aceite

- [ ] Upload de Markdown funciona (paste e drag & drop)
- [ ] Claude Opus parseia corretamente qualquer doc 08-b
- [ ] Preview mostra árvore fidedigna antes de exportar
- [ ] ClickUp API cria toda a hierarquia sem erros
- [ ] Status são mapeados corretamente (⬜→A FAZER, etc.)
- [ ] Checklists Back/Front/QA criados em cada task
- [ ] Log de progresso mostra cada item criado
- [ ] Funciona com qualquer projeto IT Valley (não só TCC)

---

## 10. Fora de Escopo (v1)

- Sincronização bidirecional ClickUp ↔ GitHub
- Atualização de projetos existentes (apenas criação)
- Gestão de membros/assignees (GP atribui manualmente)
- Notificações
- Autenticação de usuários (sistema local, single-user)
