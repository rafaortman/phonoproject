# PhonoProject

Aplicação web para acompanhar projetos fonográficos, suas faixas, músicos, instrumentos e etapas de produção.

Cada projeto é classificado automaticamente pelo número de faixas:

| Faixas | Tipo |
|---|---|
| 1–3 | Single |
| 4–6 | EP |
| 7+ | Álbum |

O limite atual é de três projetos, tanto no modo local quanto por conta.

## Arquitetura

O frontend é uma SPA sem framework ou processo de build:

```text
index.html          página principal
assets/app.js       interface, modelo de dados e persistência
assets/api.js       cliente do Google Apps Script
assets/styles.css   estilos
apps-script/Code.gs backend
```

O frontend pode ser hospedado como site estático no GitHub Pages. O backend é um Web App do Google Apps Script e utiliza:

- Google Sheets para registrar contas;
- Google Drive para armazenar um JSON por conta;
- Google Drive para armazenar capas privadas separadas do JSON;
- propriedades do Apps Script para configuração e assinatura das sessões.

## Funcionamento dos dados

### Sem conta

Os projetos ficam no `localStorage` do navegador. Permanecem após recarregar a página, mas não são compartilhados com outros dispositivos.

### Com conta

Os dados continuam em cache local e são enviados automaticamente ao Apps Script, com debounce. O backend salva um JSON independente para cada conta.

Ao entrar com projetos locais existentes, o app permite:

- salvá-los na conta;
- resolver conflitos de nomes;
- descartar os dados locais e carregar somente a nuvem.

A mesclagem respeita o limite de três projetos e só é considerada sincronizada depois da confirmação do servidor.

As capas de projetos locais ficam temporariamente em Base64 no navegador. Ao salvar o projeto em uma conta, cada capa é enviada ao Drive e o JSON passa a guardar somente seu `fileId`. O Apps Script autentica a leitura e a exclusão; os arquivos não são publicados por link.

## Modelo de produção

Cada faixa possui:

- compositores;
- informações gerais, letra/cifra e observações;
- produtores fonográficos;
- instrumentos e músicos responsáveis;
- uma sequência configurável de etapas.

Faixas novas começam com uma etapa-base chamada **Gravação**. Ela funciona por instrumentos, permanece na primeira posição e não pode ser removida, embora possa ser renomeada. As etapas seguintes podem ser holísticas ou por instrumentos e seus rótulos podem ser personalizados.

Os estados possíveis são:

- não iniciado;
- em andamento;
- concluído.

## Executar localmente

Sirva a raiz do projeto por HTTP:

```bash
python -m http.server 4173
```

Depois acesse [http://localhost:4173](http://localhost:4173).

O frontend local utiliza o endpoint configurado em `assets/api.js`, portanto login e sincronização podem ser testados contra o Apps Script publicado.

## Configurar o backend

O script espera uma planilha ativa com uma aba `Accounts`. A primeira linha deve ser o cabeçalho e as colunas usadas são:

```text
id | username | name | passwordHash | salt | createdAt
```

Configure estas propriedades em **Configurações do projeto → Propriedades do script**:

- `COUPON`: código necessário para criar conta;
- `SECRET`: segredo usado para assinar tokens;
- `MAX_ACCOUNTS`: quantidade máxima de contas.

`DATA_FOLDER_ID` e `COVERS_FOLDER_ID` são criadas automaticamente. Execute `setup()` uma vez para autorizar o script e criar as pastas.

Depois publique como Web App e atualize `API_URL` em `assets/api.js` quando a URL da implantação mudar.

Alterar `apps-script/Code.gs` no repositório não atualiza automaticamente a implantação: é necessário criar uma nova versão do Web App no Apps Script.

## Publicar o frontend

No GitHub:

1. Abra **Settings → Pages**.
2. Selecione a branch de publicação.
3. Selecione a pasta raiz (`/root`).
4. Salve e aguarde a publicação.

Para produção, mantenha o Pages apontado para `main` e valide branches de trabalho localmente antes do merge.

## Pendências

- Validar o fluxo privado de capas em produção.
- Permitir exportar e importar um projeto completo em JSON, como cópia independente.
