# Fase `06` — Velocidade do ciclo: e2e desacoplado da vista, verificação por escopo, API mais rápida

> **Pixel:** a tela abre mais rápido (hoje 6–8 s); e nenhum spec quebra porque a vista inicial mudou.
> **Componentes:** `web` · `infra` · `sentimento`
> **Origem:** `docs/context/paineis-de-fluxo/handoff/CICLO-2026-10-02.md` (diagnóstico medido da fase 05 +
> `[DECISÃO-OWNER: 2026-10-02, escolha entre alternativas apresentadas]`).
> **Ordem:** `6.1` antes de `6.2` (ver o handoff, "A ordem, e por quê"); `6.3`/`6.4` em paralelo.

## Itens

| # | item | componente |
|---|---|---|
| 6.1 | Helper de e2e que posiciona o eixo explicitamente (range em tempo ou N barras), e migração dos specs que hoje dependem da vista de montagem (incluindo os "zoom-out à mão" da fase 05) | `web` |
| 6.2 | Verificação por escopo para o builder: todos os portões não-e2e + os e2e que a task toca + o de pixel; o e2e completo fica portão da wave. Atualiza `CLAUDE.md`, `docs/protocolo-de-despacho.md` e `scripts/verify.sh` | `infra` |
| 6.3 | API com mais de um worker (dentro da RAM da VPS) e as 10 séries da tela servidas em paralelo | `infra` |
| 6.4 | Parar as regravações: backfill de boot que reescreve minutos já gravados; re-poll de liquidação (~33× por bucket). E o destino das linhas duplicadas existentes | `sentimento` · `infra` |

## DoD verificável — comando e universo

1. **6.1:** mudar `VIEW_BARS` (ex.: 120 → 60) não quebra nenhum spec migrado. **Ablação:** um spec migrado
   de volta para a vista de montagem reprova sob a mesma mudança.
2. **6.2:** o modo por escopo roda num diff de task em `≤ 1/3` do tempo do `make verify` completo, e
   reprova quando a task quebra um spec que ela toca. O completo continua rodando no gate da wave.
3. **6.3:** tempo de carga da tela (10 séries) medido antes/depois, mesma janela e mesmo símbolo, `n ≥ 5`.
4. **6.4:** linhas por minuto por série depois de 2 boots do coletor = as de antes do boot (sem
   regravação); `as_of` devolve o mesmo valor antes e depois (nenhum fato muda).
5. `make verify` verde no gate da wave.
