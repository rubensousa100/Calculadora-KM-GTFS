# Calculadora-KM-GTFS

Ferramenta web para calcular **km de serviço** a partir de feeds GTFS e comparar com os **km anuais contratualizados** por Lote (caderno de encargos). Todo o processamento corre no browser — nenhum ficheiro sai da máquina do utilizador.

**Demo:** https://rubensousa100.github.io/Calculadora-KM-GTFS/

## Funcionalidades

- Upload por *drag & drop* de um ou vários ZIPs GTFS (ex.: um por mês)
- Deteção automática do período de cada feed (`feed_info.txt` → `calendar.txt`/`calendar_dates.txt`), com datas editáveis por ficheiro
- Avisos: períodos sobrepostos, períodos com mais de 40 dias, presença de `frequencies.txt`
- Cálculo de km por linha: comprimento do trajeto (`shapes.txt`, geodésica WGS84/Vincenty) × dias ativos por `service_id`
- *Fallback* via `shape_dist_traveled` (`stop_times.txt`) para viagens sem shape utilizável
- Painel de execução do contrato com valores por Lote pré-carregados, protegido contra comparações enganadoras (cobertura do ano < 90% sem anualização)
- Tabela ordenável e exportação CSV

## Estrutura do projeto

```
Calculadora-KM-GTFS/
├── index.html          Marcação da página (sem estilos nem lógica inline)
├── css/
│   └── styles.css      Folha de estilos (design tokens + componentes)
└── js/
    ├── config.js       Constantes de negócio: km por Lote, limiares de aviso
    ├── utils.js        Utilitários puros: datas, formatação, escape de HTML
    ├── geo.js          Geodésia: fórmula de Vincenty no elipsoide WGS84
    ├── gtfs.js         Leitura do ZIP/CSV e cálculo de km (sem DOM)
    └── app.js          Interface: estado, eventos, apresentação
```

A ordem de carregamento dos scripts no `index.html` importa: `config → utils → geo → gtfs → app` (todos com `defer`, portanto executam por ordem depois do parse do HTML).

## Método de cálculo

1. Para cada viagem em `trips.txt`, obtém-se a distância do respetivo `shape_id`, somando segmentos com a fórmula de **Vincenty** (elipsoide WGS84).
2. Viagens sem shape utilizável usam o máximo de `shape_dist_traveled` em `stop_times.txt` (com heurística de deteção metros/km — ver `CONFIG.METERS_MEDIAN_THRESHOLD`).
3. Para cada `service_id`, contam-se os dias ativos dentro do período escolhido, cruzando `calendar.txt` (dias da semana + validade) com `calendar_dates.txt` (exceções: 1 = adiciona, 2 = remove).
4. Km por linha = Σ (distância da viagem × dias ativos do seu serviço).

**Limitação conhecida:** feeds com `frequencies.txt` (serviço por *headway*) são apenas assinalados com aviso — as viagens repetidas por frequência não são expandidas, pelo que os km podem ficar subestimados nesses períodos.

## Configuração

Os valores contratuais e limiares estão centralizados em [`js/config.js`](js/config.js):

| Constante | Descrição |
|---|---|
| `LOTES_CADERNO_ENCARGOS` | Km/ano por Lote (fixos para a concessão) |
| `MIN_YEAR_COVERAGE_PCT` | Cobertura mínima do ano para mostrar a % de execução |
| `SPAN_WARN_DAYS` | Dias a partir dos quais o período de um feed é assinalado |
| `METERS_MEDIAN_THRESHOLD` | Heurística metros/km no fallback |

## Desenvolvimento

Sem *build step* nem backend. Dependências via CDN: [JSZip](https://stuk.github.io/jszip/) e [PapaParse](https://www.papaparse.com/).

Para testar localmente (os browsers restringem `fetch` de ficheiros via `file://`, por isso convém servir a pasta):

```bash
python -m http.server 8000
# abrir http://localhost:8000
```

Validar sintaxe dos módulos:

```bash
node --check js/*.js
```

## Publicação

GitHub Pages a servir a raiz do repositório. Ao atualizar via interface web do GitHub, não esquecer de clicar em **Commit changes** depois de carregar os ficheiros.
