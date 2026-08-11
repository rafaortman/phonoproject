# Controle Fonográfico

Dashboard estático para acompanhar a produção de projetos fonográficos.
Cada projeto é classificado automaticamente pelo número de faixas:

| Faixas | Tipo |
|--------|------|
| 1–3 | Single |
| 4–6 | EP |
| 7+ | Álbum |

Cada **faixa (fonograma)** tem um pipeline de 6 etapas — Composição · Gravação ·
Edição · Pré-mix · Mix · Master — e cada etapa tem 3 estados: não iniciado ·
em andamento · concluído. Clicar numa célula alterna o estado.

## Estrutura

```
index.html          página principal
assets/styles.css   estilos
assets/app.js        lógica (SPA sem dependências)
data/projects.json   dados iniciais (semente) — versionados no repositório
```

## Como funciona o salvamento

O GitHub Pages é hospedagem **estática**: a página não grava arquivos no servidor.
Por isso:

1. Ao abrir, o app lê `data/projects.json` como estado inicial.
2. Suas edições (criar/editar/remover projetos e faixas) ficam no **navegador**
   (localStorage) — persistem entre sessões naquele dispositivo.
3. Para tornar uma mudança "oficial" e visível em qualquer lugar, clique em
   **Exportar JSON**, substitua o `data/projects.json` do repositório pelo arquivo
   baixado e faça commit.
4. **Recarregar** descarta as edições locais e volta ao que está no repositório.

## Rodando localmente

Como o app usa `fetch` para ler o JSON, abra via servidor (não por `file://`):

```bash
python -m http.server 4173
```

Depois acesse http://localhost:4173

## Publicando no GitHub Pages

1. Crie um repositório e envie estes arquivos.
2. Em **Settings → Pages**, selecione a branch (`main`) e a pasta raiz (`/root`).
3. O site fica disponível em `https://<usuario>.github.io/<repo>/`.
