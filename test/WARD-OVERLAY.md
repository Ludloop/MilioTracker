# MilioTracker — Mapa de Wards

Esta versão mantém o painel principal, o arraste manual, o redimensionamento e o cadeado já existentes. O mapa de wards roda em uma segunda `BrowserWindow`, totalmente transparente e independente.

## Fluxo

1. `main.js` cria `wardOverlayWindow` oculta, sem foco e sem entrada de mouse.
2. A cada 5 segundos, `src/live-client.js` consulta `activeplayer` e `playerlist` na Live Client Data API.
3. O Riot ID do jogador ativo é cruzado com `playerlist`. `ORDER` seleciona `assets/wards-blue.svg`; `CHAOS` seleciona `assets/wards-red.svg`.
4. `src/lol-settings.js` procura `MinimapScale` primeiro em `PersistedSettings.json` e depois em `game.cfg`.
5. `src/minimap-layout.js` calcula o retângulo do minimapa e `main.js` chama `wardOverlayWindow.setBounds(...)`.
6. O estado chega ao HTML seguro por IPC, através de `ward-preload.js`. Fora de uma partida, a janela de wards é ocultada.

## Matemática do minimapa

O Electron fornece `display.bounds` em DIP, a mesma unidade aceita por `BrowserWindow.setBounds`.

```text
fatorResolucao = alturaDoMonitor / 1080
tamanho = 250 × fatorResolucao × MinimapScale × scaleMultiplier
x = origemX + larguraDoMonitor - tamanho - rightOffsetEscalado
y = origemY + alturaDoMonitor - tamanho - bottomOffsetEscalado
```

O cálculo usa `display.bounds`, não `workArea`, porque o LoL em tela cheia também ocupa a área da barra de tarefas.

## Calibração fina

A Riot expõe `MinimapScale`, mas não publica o tamanho-base e os recuos exatos do HUD. Na primeira execução, o MilioTracker cria `milio-tracker-data/ward-overlay-settings.json` dentro da pasta `userData` do Electron:

```json
{
  "referenceHeight": 1080,
  "referenceMinimapSize": 250,
  "scaleMultiplier": 1,
  "rightOffset": 0,
  "bottomOffset": 0
}
```

- Se a camada inteira estiver maior/menor, ajuste `referenceMinimapSize` ou `scaleMultiplier`.
- Se estiver deslocada, ajuste `rightOffset` e `bottomOffset` em pixels de referência para 1080p.
- A configuração é relida no polling; não é necessário recompilar o aplicativo.

## Arquivos a copiar

Além de substituir `main.js`, copie estes itens para a mesma raiz do projeto:

- `ward-overlay.html`, `ward-overlay.css`, `ward-overlay.js` e `ward-preload.js`
- pasta `src/`
- pasta `assets/`

`preload.js`, `renderer.js`, `index.html` e `style.css` permanecem compatíveis e preservam o painel atual.

## Conta logada automática

As constantes fixas `RIOT_GAME_NAME` e `RIOT_TAG_LINE` não são mais necessárias. `src/league-client.js` encontra o `lockfile` do League Client, autentica apenas na API local e consulta `/lol-summoner/v1/current-summoner`.

No renderer, use:

```js
const loggedAccount = await window.milioAPI.getLoggedAccount();

if (loggedAccount.connected) {
  console.log(loggedAccount.gameName, loggedAccount.tagLine, loggedAccount.puuid);
}
```

No processo principal, quando precisar chamar `RiotPreGameController`, prefira o `puuid` já descoberto. Se o fluxo ainda usar Account-V1 por Riot ID:

```js
const { getLoggedInLeagueAccount } = require("./src/league-client");

const { gameName, tagLine } = await getLoggedInLeagueAccount();
const preGameInfo = await riotController.getPlayerPreGameInfo(gameName, tagLine);
```

Assim, trocar de conta no League não exige alterar nem recompilar o MilioTracker.

## Testes

Execute na raiz do projeto:

```powershell
node --test
node --check main.js
node --check ward-preload.js
node --check ward-overlay.js
```

## Limite do modo de exibição

No Windows, uma janela Electron pode não aparecer acima de um jogo em **Tela Cheia Exclusiva**, mesmo com `alwaysOnTop`. Para o overlay funcionar de forma consistente, use **Sem Bordas** no LoL. `setIgnoreMouseEvents(true)` garante que cliques e movimentos continuem indo para o jogo.
