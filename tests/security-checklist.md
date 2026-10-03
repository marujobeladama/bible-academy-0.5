# Checklist de segurança pré-lançamento

- [ ] Testar usuário A tentando acessar curso de usuário B.
- [ ] Testar aluno tentando chamar rotas administrativas.
- [ ] Testar IDs inválidos, ausentes e manipulados.
- [ ] Testar SQL-like payloads em todos os campos de texto.
- [ ] Testar brute force e limites de login.
- [ ] Testar upload de MIME falso, arquivo grande e extensão dupla.
- [ ] Testar acesso direto ao storage sem matrícula.
- [ ] Testar CORS com origem não autorizada.
- [ ] Testar CSRF em todas as mutações.
- [ ] Testar expiração/renovação de sessão.
- [ ] Confirmar que nenhuma variável `SERVICE_ROLE` chega ao bundle do browser.
- [ ] Confirmar CSP e HSTS em produção.
- [ ] Configurar CDN/WAF e rate limit distribuído.
- [ ] Fazer backup e testar restauração.
- [ ] Testar webhook de pagamento com assinatura, replay e idempotência.
