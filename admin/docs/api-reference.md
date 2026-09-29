## Conventions

**Base URL:** `http://<your-server>/api`

**Responses:**
- Success responses include `{ "success": true }` and an HTTP 2xx status
- Error responses return the appropriate HTTP status (400, 404, 409, 500) with an error message
- Long-running operations (downloads, benchmarks, embeddings) return 201 or 202 with a job/benchmark ID for polling

**Async pattern:** Submit a job → receive an ID → poll a status endpoint until complete.

# Documentação da API 

NOMAD disponibiliza um REST API para todas operações. Todos os endpoints estão sob `/api/` e retornam JSON.
---

# Referência Interativa 

A documentação completa e sempre atualizada dos endpoint é gerada diretamente das rotas e validadores da aplicação e disponibilizada como uma interface interativa do Scalar (https://scalar.com): 
- **[/reference](/reference)** — Navegue por todos os endpoints, esquemas de solicitação/resposta e teste chamadas em tempo real
- **[/api/openapi.json](/api/openapi.json)** — O documento bruto da OpenAPI 3.1 (importe no Postman, Insomnia, codegen, etc.)

Como ela  é derivada dos mesmos validadores do VineJS usados pela API, ela nunca fica desalinhada em relação à implementação. Prefira usa-la de qualquer lista de endpoints escrita manualmente.
---

## Convenções

**URL base:** `http://<seu-servidor>/api`

**Respostas:**
- Respostas de sucesso incluem { "success": true } e um código de status HTTP 2xx
- As respostas de erro retornam o código de status HTTP apropriado (400, 404, 409, 500) com uma mensagem de erro
- Operações de longa duração (downloads, benchmarks, embeddings) retornam 201 ou 202 com o ID de um job/benchmark para consultar o status (polling).

Padrão assíncrono: Envie uma tarefa → receba um ID → consulte o endpoint de status até ser concluída.
