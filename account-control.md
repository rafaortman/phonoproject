# Projeto — Controle de Projetos Fonográficos

## Objetivo

Transformar o app atual, que hoje salva os dados em `Web Storage`, em um aplicativo com **persistência online e contas individuais**, mantendo a estrutura JSON atual.

## Arquitetura

```text
┌─────────────────────┐
│    GitHub Pages     │
│                     │
│ HTML / CSS / JS     │
│ Interface do app    │
└──────────┬──────────┘
           │
           │ fetch()
           ▼
┌─────────────────────┐
│   Google Apps       │
│      Script         │
│                     │
│ • autenticação      │
│ • criação de contas │
│ • sessões           │
│ • leitura/escrita   │
│ • validações        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Google Sheets    │
│                     │
│ Accounts            │
│ Data                │
└─────────────────────┘
```

**Sem Firebase, Supabase ou qualquer outro middleware.**

## Contas

O sistema terá um número máximo fixo de contas.

Exemplo:

```js
MAX_ACCOUNTS = 10
```

A criação de conta será aberta no próprio GitHub Pages, mas exigirá um **cupom global**.

Exemplo:

```text
BLAGUE2026
```

O cupom:

* é único para todas as contas;
* fica armazenado/verificado no Apps Script;
* não fica exposto no JavaScript do GitHub Pages;
* permite a criação de contas enquanto houver vagas;
* deixa de permitir novas contas quando o limite for atingido.

### Criação de conta

```text
┌─────────────────────────────┐
│       Criar conta           │
│                             │
│ Nome                        │
│ [________________________]  │
│                             │
│ Usuário                     │
│ [________________________]  │
│                             │
│ Senha                       │
│ [________________________]  │
│                             │
│ Cupom                       │
│ [________________________]  │
│                             │
│        CRIAR CONTA          │
└─────────────────────────────┘
```

O Apps Script valida:

1. cupom correto;
2. limite de contas;
3. username disponível;
4. dados válidos.

Se tudo estiver correto, cria a conta e um JSON inicial vazio.

## Login

```text
┌─────────────────────────────┐
│           Entrar            │
│                             │
│ Usuário                     │
│ [________________________]  │
│                             │
│ Senha                       │
│ [________________________]  │
│                             │
│           ENTRAR            │
│                             │
│       Criar conta           │
└─────────────────────────────┘
```

O Apps Script valida as credenciais e cria uma **sessão/token temporário**.

O frontend não armazena senhas de outras contas nem possui as credenciais hardcoded.

## Dados de cada conta

Cada usuário terá seu próprio JSON.

Exemplo:

```text
Rafa
└── { version: 2, projects: [...] }

Olivia
└── { version: 2, projects: [...] }

Melão
└── { version: 2, projects: [...] }
```

O JSON continua exatamente no modelo atual.

Não haverá necessidade de transformar:

```text
projects
tracks
people
instruments
stageState
stages
```

em tabelas relacionais.

O **JSON continua sendo o modelo de dados do aplicativo**.

## Google Sheets

### Aba `Accounts`

| id  | username | passwordHash | createdAt  |
| --- | -------- | ------------ | ---------- |
| 001 | rafa     | ...          | 2026-08-12 |
| 002 | olivia   | ...          | 2026-08-12 |
| 003 | melao    | ...          | 2026-08-13 |

### Aba `Data`

| accountId | json                                  |
| --------- | ------------------------------------- |
| 001       | `{ "version": 2, "projects": [...] }` |
| 002       | `{ "version": 2, "projects": [...] }` |
| 003       | `{ "version": 2, "projects": [...] }` |

As senhas não precisam ficar no Sheets. O ideal é armazenar o segredo/configuração no **Script Properties** do Apps Script e trabalhar com hash de senha.

## API do Apps Script

O frontend terá uma pequena camada de API:

```js
api.login(username, password)
api.createAccount(name, username, password, coupon)

api.load()
api.save(data)

api.logout()
```

Internamente:

```text
POST /exec
{
  "action": "login",
  "username": "rafa",
  "password": "..."
}
```

ou:

```text
POST /exec
{
  "action": "save",
  "token": "...",
  "data": { ... }
}
```

O Apps Script determina qual conta está associada ao token e **só acessa o JSON daquela conta**.

## Web Storage

O `localStorage` deixa de ser o armazenamento principal.

### Antes

```text
App
 ↓
localStorage
 ↓
JSON
```

### Depois

```text
App
 ↓
Apps Script
 ↓
Google Sheets
 ↓
JSON
```

O Web Storage pode continuar sendo usado como **cache local**, se for conveniente.

Por exemplo:

```text
login
  ↓
carrega JSON do servidor
  ↓
cache local
  ↓
usuário trabalha normalmente
  ↓
salva no servidor
```

## Salvamento

O app poderá manter a lógica atual de alteração do objeto:

```js
data.projects[0].tracks[0].stageState.gravacao.signedOff = true;
```

E substituir apenas a persistência:

```js
await api.save(data);
```

Em vez de:

```js
localStorage.setItem('data', JSON.stringify(data));
```

Também pode ser implementado **autosave com debounce**, para evitar uma requisição a cada pequena alteração.

## Imagens de capa

O campo atual:

```json
"cover": "data:image/jpeg;base64,..."
```

não é ideal para ser armazenado dentro do JSON no Sheets.

As capas deverão ser tratadas separadamente, porque imagens em Base64 podem fazer o JSON crescer muito e existe limite de tamanho por célula no Google Sheets.

Uma possibilidade futura:

```text
Google Drive
    ↓
URL da imagem
    ↓
JSON
```

ficando:

```json
"cover": "https://..."
```

Isso pode ser resolvido depois da implementação básica.

## Fluxo completo

### Primeiro acesso

```text
GitHub Pages
     ↓
Não há sessão
     ↓
Tela de login
     ↓
Criar conta
     ↓
Nome + usuário + senha + cupom
     ↓
Apps Script
     ↓
Valida cupom
     ↓
Valida limite
     ↓
Cria conta
     ↓
Cria JSON inicial
     ↓
Login automático
     ↓
App
```

### Usuário existente

```text
GitHub Pages
     ↓
Login
     ↓
Apps Script
     ↓
Valida credenciais
     ↓
Cria sessão
     ↓
Carrega JSON daquela conta
     ↓
App
```

### Salvamento

```text
Usuário altera projeto
        ↓
JSON em memória é atualizado
        ↓
api.save(data)
        ↓
Apps Script
        ↓
identifica conta pelo token
        ↓
atualiza JSON daquela conta
        ↓
Google Sheets
```

## Princípios do projeto

* **GitHub Pages** continua hospedando o app.
* **Apps Script** é o único backend.
* **Google Sheets** é o armazenamento.
* Não usar Firebase/Supabase.
* Cada conta possui seu **próprio JSON independente**.
* O JSON atual não precisa ser remodelado.
* Criação de conta ocorre pelo próprio app.
* Criação exige um **cupom global**.
* Existe um número máximo de contas.
* Senhas não ficam hardcoded no frontend.
* Login gera uma sessão/token.
* Web Storage pode continuar existindo apenas como cache local.
* Capas/imagens serão tratadas separadamente do JSON principal.
